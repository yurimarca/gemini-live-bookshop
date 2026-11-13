/**
 * Protocol 2 wire contract. Mirrors backend/app/protocol/events.py.
 * Text frames are snake_case JSON. Binary frames are audio only:
 * client to server PCM16 mono 16 kHz, server to client PCM16 mono 24 kHz.
 */
import type { Cart } from '../types/catalog'

export const PROTOCOL_VERSION = 2
export const MAX_USER_TEXT = 500

export type Locale = 'en' | 'pt-BR'
export type AgentName = 'voice' | 'taste_profiler' | 'recommender' | 'cart_timer'
export type Behavior = 'BLOCKING' | 'NON_BLOCKING'
export type Scheduling = 'INTERRUPT' | 'WHEN_IDLE' | 'SILENT'
export type RunsOn = 'gateway' | 'agent_runtime' | 'cloud_tasks'
export type ToolStatus = 'ok' | 'error' | 'denied' | 'cancelled'
export type EndReason = 'time_limit' | 'quota' | 'idle' | 'client' | 'upstream' | 'error'
export type Role = 'user' | 'agent'

// --- client to server ---------------------------------------------------------------
export type ClientEvent =
  | { type: 'session.start'; protocol: 2; id_token: string; app_check_token?: string; locale: Locale; a2ui_capabilities: Record<string, unknown> }
  | { type: 'session.update'; locale: Locale }
  | { type: 'mic'; muted: boolean }
  | { type: 'user.text'; text: string; client_msg_id: string }
  | { type: 'a2ui.action'; op_id: string; message: Record<string, unknown> }
  | { type: 'session.stop' }
  | { type: 'ping' }

// --- server to client ---------------------------------------------------------------
interface Base { seq: number; ts: number }
export interface Limits { max_seconds: number; warn_at_seconds: number; sessions_left_today: number }

export type ServerEvent = Base & (
  | { type: 'session.ready'; session_id: string; expires_at: number; server_time: number; limits: Limits; dataset_version: string; cart: Cart }
  | { type: 'audio.start'; utterance_id: string }
  | { type: 'transcript.delta'; utterance_id: string; role: Role; text: string }
  | { type: 'transcript.final'; utterance_id: string; role: Role; text: string; interrupted?: boolean }
  | { type: 'turn.interrupted'; utterance_id?: string; cancelled_call_ids?: string[] }
  | { type: 'turn.complete' }
  | { type: 'tool.started'; call_id: string; agent: AgentName; tool: string; behavior: Behavior; scheduling_requested?: Scheduling; runs_on: RunsOn; args_summary?: string; parent_call_id?: string }
  | { type: 'tool.progress'; call_id: string; stage: string; note?: string }
  | { type: 'tool.finished'; call_id: string; status: ToolStatus; scheduling_effective?: Scheduling; latency_ms: number; summary?: string }
  | { type: 'a2ui'; agent: AgentName; call_id?: string; messages: Record<string, unknown>[] }
  | { type: 'ui.command'; command: 'show_books' | 'open_book' | 'open_cart'; book_ids?: string[]; book_id?: string; title?: string }
  | ({ type: 'cart.updated'; op_id?: string } & Cart)
  | { type: 'session.warning'; reason: 'time_limit'; seconds_left: number }
  | { type: 'session.ended'; reason: EndReason }
  | { type: 'error'; code: string; message: string; fatal?: boolean }
  | { type: 'pong' }
)

export type ServerEventType = ServerEvent['type']

const KNOWN: ReadonlySet<string> = new Set<ServerEventType>([
  'session.ready', 'audio.start', 'transcript.delta', 'transcript.final', 'turn.interrupted', 'turn.complete',
  'tool.started', 'tool.progress', 'tool.finished', 'a2ui', 'ui.command', 'cart.updated', 'session.warning',
  'session.ended', 'error', 'pong',
])

/** Parse a text frame. Unknown or malformed events return null, so a newer server never breaks the page. */
export function parseServerEvent(raw: string): ServerEvent | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const type = (data as { type?: unknown }).type
  if (typeof type !== 'string' || !KNOWN.has(type)) return null
  return data as ServerEvent
}

// --- close codes --------------------------------------------------------------------
export const CloseCode = {
  NORMAL: 1000, ABNORMAL: 1006, UPSTREAM: 1011, RESTART: 1012,
  BAD_START: 4400, BAD_TOKEN: 4401, FORBIDDEN: 4403, TIME_LIMIT: 4408, QUOTA: 4429, AT_CAPACITY: 4503,
} as const

export const MAX_RETRIES = 2
const RETRYABLE: ReadonlySet<number> = new Set([CloseCode.ABNORMAL, CloseCode.UPSTREAM, CloseCode.RESTART])

/**
 * Never reconnect on a 4xxx close: the server meant it. Retry at most twice on a dropped
 * connection. A reconnect is a new session, so a session that already said goodbye is not retried.
 */
export function shouldRetry(code: number, attempt: number, endedByServer: boolean): boolean {
  if (endedByServer || attempt >= MAX_RETRIES) return false
  return RETRYABLE.has(code)
}

export type CloseKind = 'ended' | 'time_limit' | 'quota' | 'capacity' | 'auth' | 'forbidden' | 'lost' | 'failed'

export function closeKind(code: number): CloseKind {
  switch (code) {
    case CloseCode.NORMAL: return 'ended'
    case CloseCode.TIME_LIMIT: return 'time_limit'
    case CloseCode.QUOTA: return 'quota'
    case CloseCode.AT_CAPACITY: return 'capacity'
    case CloseCode.BAD_TOKEN: return 'auth'
    case CloseCode.FORBIDDEN: return 'forbidden'
    case CloseCode.BAD_START: return 'failed'
    default: return 'lost'
  }
}
