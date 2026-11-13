/**
 * Unified Gemini Live Voice Session Hook
 *
 * Combines WebSocket connection, audio recording, and audio playback
 * to provide a complete voice conversation interface with Gemini Live API.
 *
 * Features:
 * - WebSocket connection management
 * - Audio recording and streaming
 * - Audio playback from Gemini
 * - Transcript management
 * - Function call handling
 * - Error handling and recovery
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { wsService } from '../services/websocketService';
import { FunctionExecutor } from '../services/functionExecutor';
import { useAudioRecording } from './useAudioRecording';
import { useAudioPlayback } from './useAudioPlayback';
import type {
  ServerMessage,
  TranscriptMessage,
  FunctionExecutedMessage,
  AudioChunkMessage
} from '../types';

export interface Transcript {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface UseGeminiLiveReturn {
  // Connection state
  isConnected: boolean;
  connectionStatus: string;

  // Recording state
  isRecording: boolean;
  audioLevel: number;

  // Playback state
  isPlaying: boolean;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  startRecording: (stream?: MediaStream) => Promise<void>;
  stopRecording: () => void;

  // Data
  transcripts: Transcript[];

  // Error state
  error: string | null;
  clearError: () => void;
}

export function useGeminiLive(): UseGeminiLiveReturn {
  // Shared singleton so remounts (e.g. React Strict Mode) reuse the same connection
  const getWebSocketService = useCallback(() => wsService, []);

  // Function executor instance
  const executorRef = useRef<FunctionExecutor>(new FunctionExecutor());

  // Unsubscribe functions for WS handlers (prevents duplicates on Strict Mode remount)
  const unsubscribeRef = useRef<(() => void)[]>([]);

  // Send greeting trigger only once per connection when user starts talking
  const hasTriggeredGreetingRef = useRef(false);

  // Track in-progress (streaming) transcript entries to avoid duplicates
  const inProgressTranscriptRef = useRef<{
    user: { id: string; text: string } | null;
    assistant: { id: string; text: string } | null;
  }>({ user: null, assistant: null });

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  // Data state
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);

  // Error state
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle audio chunk from recording
   */
  const handleAudioChunk = useCallback((base64Data: string) => {
    const ws = getWebSocketService();
    if (!ws.isConnected()) {
      console.warn('[GeminiLive] Cannot send audio chunk - not connected');
      return;
    }

    const message: AudioChunkMessage = {
      type: 'audio_chunk',
      data: base64Data
    };

    try {
      ws.sendMessage(message);
    } catch (err) {
      console.error('[GeminiLive] Failed to send audio chunk:', err);
    }
  }, [getWebSocketService]);

  /**
   * Handle recording errors
   */
  const handleRecordingError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  // Audio playback hook
  const { isPlaying, playAudio, stopPlayback, error: playbackError } = useAudioPlayback();

  // Audio recording hook
  const {
    isRecording,
    audioLevel,
    startRecording: startRecordingBase,
    stopRecording,
    error: recordingError
  } = useAudioRecording({
    onAudioChunk: handleAudioChunk,
    onError: handleRecordingError,
    isConnected
  });

  /**
   * Start recording; first time per connection also triggers agent greeting.
   * Pass a MediaStream when the caller already requested mic (e.g. from click handler) so the browser showed the permission prompt.
   */
  const startRecording = useCallback(async (stream?: MediaStream) => {
    const ws = getWebSocketService();
    if (ws.isConnected() && !hasTriggeredGreetingRef.current) {
      hasTriggeredGreetingRef.current = true;
      ws.sendMessage({
        type: 'text',
        text: 'The user has just joined. Please give a brief friendly greeting and ask how you can help them today.'
      });
    }
    await startRecordingBase(stream);
  }, [getWebSocketService, startRecordingBase]);

  /**
   * Handle messages from backend
   */
  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'audio_response':
        // Play audio from Gemini
        playAudio(message.data).catch(err => {
          console.error('[GeminiLive] Failed to play audio:', err);
          setError('Failed to play audio response');
        });
        break;

      case 'transcript': {
        const transcriptMsg = message as TranscriptMessage;
        const { role, text } = transcriptMsg;
        const otherRole = role === 'user' ? 'assistant' : 'user';
        // When role switches, close the other role's streaming entry
        if (inProgressTranscriptRef.current[otherRole]) {
          inProgressTranscriptRef.current[otherRole] = null;
        }
        const inProgress = inProgressTranscriptRef.current[role];
        console.log(`[GeminiLive] Transcript (${role}): ${text}`);
        if (inProgress) {
          const accumulated = inProgress.text;
          let updated: string;
          if (text.length > accumulated.length && text.includes(accumulated.trim())) {
            updated = text; // final consolidated version — replace
          } else if (accumulated.includes(text.trim())) {
            break; // exact duplicate — skip
          } else {
            updated = accumulated + text; // new chunk — append
          }
          inProgressTranscriptRef.current[role] = { id: inProgress.id, text: updated };
          setTranscripts(prev =>
            prev.map(t => t.id === inProgress.id ? { ...t, text: updated } : t)
          );
        } else {
          const id = `${Date.now()}-${role}`;
          inProgressTranscriptRef.current[role] = { id, text };
          setTranscripts(prev => [...prev, { id, role, text, timestamp: new Date() }]);
        }
        break;
      }

      case 'function_executed': {
        // Backend-executed tool completed — re-execute locally for UI update only.
        // No result is sent back (the model already has it via ADK's internal path).
        const executed = message as FunctionExecutedMessage;
        console.log(`[GeminiLive] Backend-executed function: ${executed.name}`, executed.parameters);
        const executor = executorRef.current;
        executor.execute(executed.name, executed.parameters || {}).catch(err => {
          console.error(`[GeminiLive] Local UI update for ${executed.name} failed:`, err);
        });
        break;
      }

      case 'error': {
        // Handle error messages from backend
        const errMsg = message as { message?: string; code?: string };
        const isConnectionLost =
          errMsg.code === 'GEMINI_UNAVAILABLE' || errMsg.code === 'CONNECTION_LOST';
        setError(
          isConnectionLost
            ? 'Connection to AI lost. Reconnecting…'
            : (errMsg.message || 'An error occurred')
        );
        console.error('[GeminiLive] Backend error:', errMsg.code, errMsg.message);
        break;
      }

      case 'connection_status':
        // Update connection status
        setConnectionStatus(message.status);
        if (message.message) {
          console.log(`[GeminiLive] Status: ${message.status} - ${message.message}`);
        }
        break;

      default:
        console.warn('[GeminiLive] Unknown message type:', (message as any).type);
    }
  }, [playAudio]);

  /**
   * Handle connection status changes
   */
  const handleConnectionChange = useCallback((status: 'connected' | 'disconnected' | 'error') => {
    console.log('[GeminiLive] Connection status changed:', status);

    setIsConnected(status === 'connected');

    if (status === 'connected') {
      setConnectionStatus('connected');
      setError(null);
    } else if (status === 'disconnected') {
      setConnectionStatus('disconnected');
      hasTriggeredGreetingRef.current = false;
      // Stop recording if connection is lost
      if (isRecording) {
        stopRecording();
      }
      // Stop playback if connection is lost
      if (isPlaying) {
        stopPlayback();
      }
    } else if (status === 'error') {
      setConnectionStatus('error');
      setError('Connection error occurred');
    }
  }, [isRecording, stopRecording, isPlaying, stopPlayback]);

  /**
   * Connect to backend
   */
  const connect = useCallback(async () => {
    const ws = getWebSocketService();

    // Clean up previous subscriptions (prevents duplicates from Strict Mode remount)
    unsubscribeRef.current.forEach(unsub => unsub());
    unsubscribeRef.current = [];

    // Subscribe to messages and connection events
    unsubscribeRef.current.push(ws.onMessage(handleMessage));
    unsubscribeRef.current.push(ws.onConnectionChange(handleConnectionChange));

    try {
      setConnectionStatus('connecting');
      await ws.connect();
      console.log('[GeminiLive] Connected to backend');
    } catch (err) {
      console.error('[GeminiLive] Connection failed:', err);
      setError('Failed to connect to backend');
      setConnectionStatus('error');
      throw err;
    }
  }, [getWebSocketService, handleMessage, handleConnectionChange]);

  /**
   * Disconnect from backend
   */
  const disconnect = useCallback(() => {
    const ws = getWebSocketService();

    // Stop recording and playback
    if (isRecording) {
      stopRecording();
    }
    if (isPlaying) {
      stopPlayback();
    }

    // Disconnect WebSocket
    ws.disconnect();
    setIsConnected(false);
    setConnectionStatus('disconnected');

    console.log('[GeminiLive] Disconnected from backend');
  }, [getWebSocketService, isRecording, stopRecording, isPlaying, stopPlayback]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Sync connection state when hook mounts and singleton is already connected
   * (e.g. after React Strict Mode remount).
   */
  useEffect(() => {
    if (getWebSocketService().isConnected()) {
      setIsConnected(true);
      setConnectionStatus('connected');
    }
  }, [getWebSocketService]);

  /**
   * Update error from sub-hooks
   */
  useEffect(() => {
    if (recordingError) {
      setError(recordingError);
    } else if (playbackError) {
      setError(playbackError);
    }
  }, [recordingError, playbackError]);

  /**
   * Cleanup on unmount: only unsubscribe from handlers. Do not close the
   * WebSocket so that React Strict Mode remounts keep the same connection
   * and the conversation is not dropped when the component tree re-mounts.
   */
  useEffect(() => {
    return () => {
      unsubscribeRef.current.forEach(unsub => unsub());
      unsubscribeRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Connection state
    isConnected,
    connectionStatus,

    // Recording state
    isRecording,
    audioLevel,

    // Playback state
    isPlaying,

    // Actions
    connect,
    disconnect,
    startRecording,
    stopRecording,

    // Data
    transcripts,

    // Error state
    error,
    clearError
  };
}
