/**
 * TypeScript type definitions for Voice AI Function Calling frontend.
 * These types match the backend WebSocket message protocol.
 */

// ============================================================================
// WebSocket Message Types (Client → Backend)
// ============================================================================

export interface AudioChunkMessage {
  type: 'audio_chunk';
  data: string; // Base64 encoded audio
}

export interface FunctionResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  error?: string;
  suggestions?: string[];
}

export interface FunctionResultMessage {
  type: 'function_result';
  id: string;
  result: FunctionResult;
}

export interface SessionControlMessage {
  type: 'session_control';
  action: 'start' | 'stop';
}

export interface TextMessage {
  type: 'text';
  text: string;
}

export type ClientMessage =
  | AudioChunkMessage
  | FunctionResultMessage
  | SessionControlMessage
  | TextMessage;

// ============================================================================
// WebSocket Message Types (Backend → Client)
// ============================================================================

export interface AudioResponseMessage {
  type: 'audio_response';
  data: string; // Base64 encoded audio
}

export interface FunctionCallMessage {
  type: 'function_call';
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface TranscriptMessage {
  type: 'transcript';
  role: 'user' | 'assistant';
  text: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ConnectionStatusMessage {
  type: 'connection_status';
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  message?: string;
}

/** Sent by backend when a regular (backend-executed) tool completes.
 *  The frontend re-executes locally for UI update only — no result sent back. */
export interface FunctionExecutedMessage {
  type: 'function_executed';
  name: string;
  parameters: Record<string, unknown>;
  result: FunctionResult;
}

export type ServerMessage =
  | AudioResponseMessage
  | FunctionCallMessage
  | FunctionExecutedMessage
  | TranscriptMessage
  | ErrorMessage
  | ConnectionStatusMessage;

// ============================================================================
// Application State Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export interface LiveSessionState {
  connectionStatus: ConnectionStatus;
  isRecording: boolean;
  transcripts: TranscriptEntry[];
  currentFunction?: FunctionCallMessage;
  error?: string;
}

export interface PageInteractionState {
  highlightedElement?: Element;
  lastAction?: {
    functionName: string;
    success: boolean;
    message: string;
    timestamp: number;
  };
}

// ============================================================================
// Function Execution Types
// ============================================================================

export interface FunctionExecutorResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  error?: string;
  suggestions?: string[];
}

export type FunctionExecutor = (
  name: string,
  parameters: Record<string, unknown>
) => Promise<FunctionExecutorResult>;

// ============================================================================
// Audio Types
// ============================================================================

export interface AudioConfig {
  sampleRate: number;
  channelCount: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface AudioChunk {
  data: ArrayBuffer;
  timestamp: number;
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UseGeminiLiveReturn {
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: ClientMessage) => void;
  error?: string;
}

export interface UseAudioStreamReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  audioLevel: number;
  error?: string;
}

export interface UseFunctionExecutionReturn {
  executingFunction?: string;
  lastResult?: FunctionExecutorResult;
  executeFunction: (call: FunctionCallMessage) => Promise<void>;
}
