"""
Pydantic models for WebSocket message protocol between client, backend, and Vertex AI.
"""

from typing import Any, Dict, Literal, Optional
from pydantic import BaseModel, Field


# Client → Backend Messages

class AudioChunkMessage(BaseModel):
    """Audio chunk from client to backend."""
    type: Literal["audio_chunk"] = "audio_chunk"
    data: str = Field(..., description="Base64 encoded audio data")


class FunctionResult(BaseModel):
    """Result of function execution."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: Optional[str] = None
    error: Optional[str] = None
    suggestions: Optional[list[str]] = None


class FunctionResultMessage(BaseModel):
    """Function execution result from client to backend."""
    type: Literal["function_result"] = "function_result"
    id: str = Field(..., description="Function call ID")
    result: FunctionResult


class SessionControlMessage(BaseModel):
    """Session control message (start/stop)."""
    type: Literal["session_control"] = "session_control"
    action: Literal["start", "stop"]


# Backend → Client Messages

class AudioResponseMessage(BaseModel):
    """Audio response from backend to client."""
    type: Literal["audio_response"] = "audio_response"
    data: str = Field(..., description="Base64 encoded audio data")


class FunctionCallMessage(BaseModel):
    """Function call request from backend to client."""
    type: Literal["function_call"] = "function_call"
    id: str = Field(..., description="Unique function call ID")
    name: str = Field(..., description="Function name to execute")
    parameters: Dict[str, Any] = Field(..., description="Function parameters")


class TranscriptMessage(BaseModel):
    """Transcript of conversation."""
    type: Literal["transcript"] = "transcript"
    role: Literal["user", "assistant"]
    text: str


class ErrorMessage(BaseModel):
    """Error message."""
    type: Literal["error"] = "error"
    message: str
    code: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class ConnectionStatusMessage(BaseModel):
    """Connection status update."""
    type: Literal["connection_status"] = "connection_status"
    status: Literal["connecting", "connected", "disconnected", "error"]
    message: Optional[str] = None


class TurnInterruptedMessage(BaseModel):
    """Barge-in / interruption event."""
    type: Literal["turn_interrupted"] = "turn_interrupted"


# Union types for message handling

ClientMessage = AudioChunkMessage | FunctionResultMessage | SessionControlMessage
ServerMessage = (
    AudioResponseMessage
    | FunctionCallMessage
    | TranscriptMessage
    | ErrorMessage
    | ConnectionStatusMessage
    | TurnInterruptedMessage
)
