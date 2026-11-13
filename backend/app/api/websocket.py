"""
WebSocket endpoint for bidirectional voice communication using Google ADK.

Translates between the frontend's JSON message format and ADK's Runner/LiveRequestQueue,
acting as a protocol adapter so the frontend requires no changes.
"""

import asyncio
import base64
import logging
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.adk.agents import LiveRequestQueue, RunConfig
from google.adk.agents.run_config import StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from google.genai.errors import APIError as GenaiAPIError
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK

from app.agent import agent
from app.config.settings import settings
from app.models.messages import ConnectionStatusMessage, ErrorMessage
from app.tools.cart_cache import set_session_for_cart
from app.tools.notifications import set_notification_queue, clear_notification_queue

logger = logging.getLogger(__name__)
router = APIRouter()

APP_NAME = "voice-web-assistant"


def _transcription_to_text(transcription) -> str:
    """Normalize ADK transcription (string or Transcription object) to plain string."""
    if transcription is None:
        return ""
    if isinstance(transcription, str):
        return transcription
    return getattr(transcription, "text", str(transcription))
session_service = InMemorySessionService()
runner = Runner(app_name=APP_NAME, agent=agent, session_service=session_service)


@router.websocket("/ws/gemini-live")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint bridging the frontend to ADK's bidi-streaming runner.

    Message flow:
      Frontend ↔ Adapter (this endpoint) ↔ ADK Runner ↔ Gemini Live API
    """
    await websocket.accept()

    user_id = str(uuid4())
    session_id = str(uuid4())

    # Get-or-create session (bidi-demo pattern; supports reconnects)
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if not session:
        await session_service.create_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )

    live_queue = LiveRequestQueue()

    audio_chunk_count = 0

    # Convert string modalities (e.g. ["AUDIO"]) to proper enum values.
    # Note: A Pydantic serialization warning for response_modalities may still appear
    # from ADK internals (RunConfig → LiveConnectConfig); it is a known ADK/genai mismatch.
    modalities = [
        types.Modality(m) for m in settings.agent_config.generation.response_modalities
    ]

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=modalities,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=settings.agent_config.voice.name
                )
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    # Notify frontend that we're initiating the Gemini connection
    await websocket.send_json(
        ConnectionStatusMessage(
            status="connecting", message="Connecting to Google AI..."
        ).model_dump()
    )

    async def upstream_task():
        """Forward messages from the frontend WebSocket into the ADK LiveRequestQueue."""
        nonlocal audio_chunk_count
        try:
            while True:
                client_message = await websocket.receive_json()
                message_type = client_message.get("type", "unknown")
                if message_type != "audio_chunk":
                    logger.info(f"Client → ADK: {message_type}")

                if message_type == "audio_chunk":
                    pcm_data = base64.b64decode(client_message["data"])
                    live_queue.send_realtime(
                        types.Blob(mime_type="audio/pcm;rate=16000", data=pcm_data)
                    )
                    audio_chunk_count += 1
                    if audio_chunk_count == 1 or audio_chunk_count % 50 == 0:
                        logger.info(
                            f"Client → ADK: audio_chunk #{audio_chunk_count} ({len(pcm_data)} bytes)"
                        )

                elif message_type == "text":
                    live_queue.send_content(
                        types.Content(
                            role="user",
                            parts=[types.Part.from_text(text=client_message["text"])],
                        )
                    )

                else:
                    logger.warning(f"Unknown message type from client: {message_type}")

        except WebSocketDisconnect:
            logger.info("Client disconnected (upstream)")
        except Exception as e:
            logger.error(f"Error in upstream_task: {e}", exc_info=True)
        finally:
            live_queue.close()

    async def downstream_task():
        """Iterate ADK run_live() events and translate to the frontend message format."""
        # Notification queue: backend-executed tools push here so we can
        # forward function_executed messages to the frontend for UI sync.
        notification_queue: asyncio.Queue = asyncio.Queue()
        set_notification_queue(notification_queue)

        async def drain_notifications():
            """Forward any pending backend-tool notifications to the frontend."""
            while not notification_queue.empty():
                try:
                    msg = notification_queue.get_nowait()
                    await websocket.send_json(msg)
                    logger.info(
                        "Backend tool → Client: function_executed (%s)",
                        msg.get("name", "?"),
                    )
                except Exception:
                    break

        try:
            # Signal connected before entering the Gemini event loop.
            # The actual Gemini WebSocket opens inside runner.run_live(); errors
            # from bad model/key will be caught by the except blocks below.
            await websocket.send_json(
                ConnectionStatusMessage(
                    status="connected", message="Connected to Google AI"
                ).model_dump()
            )
            logger.info("Entering Gemini Live event loop")
            set_session_for_cart(session_id)

            async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_queue,
                run_config=run_config,
            ):
                # Error events
                if event.error_code:
                    await websocket.send_json(
                        ErrorMessage(
                            message=event.error_message or str(event.error_code),
                            code=str(event.error_code),
                        ).model_dump()
                    )
                    continue

                # Input transcription (user speech-to-text)
                if event.input_transcription:
                    text = _transcription_to_text(event.input_transcription)
                    if text:
                        await websocket.send_json(
                            {
                                "type": "transcript",
                                "role": "user",
                                "text": text,
                            }
                        )
                        logger.info(
                            f"ADK → Client: transcript (user) {text[:80]!r}"
                        )

                # Output transcription (assistant speech-to-text)
                if event.output_transcription:
                    text = _transcription_to_text(event.output_transcription)
                    if text:
                        await websocket.send_json(
                            {
                                "type": "transcript",
                                "role": "assistant",
                                "text": text,
                            }
                        )
                        logger.info(
                            f"ADK → Client: transcript (assistant) {text[:80]!r}"
                        )

                # Interruption (barge-in)
                if event.interrupted:
                    await websocket.send_json({"type": "turn_interrupted"})

                # Content parts: audio, function calls
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        logger.debug(
                            "Event part type: %s, has function_call=%s",
                            type(part).__name__,
                            bool(getattr(part, "function_call", None)),
                        )
                        # Audio response
                        if part.inline_data:
                            audio_b64 = base64.b64encode(part.inline_data.data).decode(
                                "utf-8"
                            )
                            await websocket.send_json(
                                {"type": "audio_response", "data": audio_b64}
                            )
                            logger.info(
                                f"ADK → Client: audio_response ({len(audio_b64)} chars b64)"
                            )


                logger.debug(
                    "ADK event attrs: content=%s parts=%s in_tx=%s out_tx=%s interrupted=%s err=%s",
                    bool(event.content),
                    [type(p).__name__ for p in (event.content.parts if event.content else [])],
                    bool(event.input_transcription),
                    bool(event.output_transcription),
                    event.interrupted,
                    event.error_code,
                )

                # Drain backend-tool notifications after each event
                await drain_notifications()

        except GenaiAPIError as e:
            if e.code == 1000:
                logger.info("Gemini Live connection closed normally (1000)")
            elif e.code in (1008, 1011):
                logger.warning(
                    "Gemini Live connection lost (code=%s). Client can reconnect.",
                    e.code,
                )
                try:
                    await websocket.send_json(
                        ErrorMessage(
                            message="Connection to the AI was lost. You can try again.",
                            code="GEMINI_UNAVAILABLE",
                        ).model_dump()
                    )
                except Exception:
                    pass
            else:
                logger.error(f"Gemini API error in downstream_task: {e}", exc_info=True)
                try:
                    await websocket.send_json(
                        ErrorMessage(
                            message=f"Gemini API error: {e}",
                            code=str(e.code),
                        ).model_dump()
                    )
                except Exception:
                    pass
        except ConnectionClosedError as e:
            if e.code == 1011 or (getattr(e, "reason", None) or "").lower().find("unavailable") >= 0:
                logger.warning("Gemini Live WebSocket closed with 1011/unavailable. Client can reconnect.")
                try:
                    await websocket.send_json(
                        ErrorMessage(
                            message="Connection to the AI was lost. You can try again.",
                            code="GEMINI_UNAVAILABLE",
                        ).model_dump()
                    )
                except Exception:
                    pass
            else:
                logger.error(f"Gemini Live WebSocket closed: {e}", exc_info=True)
                try:
                    await websocket.send_json(
                        ErrorMessage(
                            message=f"Connection error: {e}",
                            code="DOWNSTREAM_ERROR",
                        ).model_dump()
                    )
                except Exception:
                    pass
        except ConnectionClosedOK:
            logger.info("Gemini Live WebSocket closed normally")
        except Exception as e:
            logger.error(f"Error in downstream_task: {e}", exc_info=True)
            try:
                await websocket.send_json(
                    ErrorMessage(
                        message=f"Connection error: {e}",
                        code="DOWNSTREAM_ERROR",
                    ).model_dump()
                )
            except Exception:
                pass
        finally:
            clear_notification_queue()

    try:
        await asyncio.gather(upstream_task(), downstream_task())
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json(
                ErrorMessage(message=str(e), code="WEBSOCKET_ERROR").model_dump()
            )
        except Exception:
            pass
    finally:
        live_queue.close()
        try:
            await websocket.send_json(
                ConnectionStatusMessage(
                    status="disconnected", message="Disconnected from Google AI"
                ).model_dump()
            )
        except Exception:
            pass


@router.get("/ws/health")
async def websocket_health():
    """WebSocket service health check."""
    return {"status": "ok"}
