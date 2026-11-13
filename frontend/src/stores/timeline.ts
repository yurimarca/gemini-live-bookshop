import { createStore } from '../lib/store'
import type { AgentName, Behavior, RunsOn, Scheduling, ServerEvent, ToolStatus } from '../protocol/events'

export interface TimelineRow {
  callId: string
  parentCallId: string | null
  agent: AgentName
  tool: string
  behavior: Behavior
  runsOn: RunsOn
  schedulingRequested: Scheduling | null
  schedulingEffective: Scheduling | null
  argsSummary: string | null
  stage: string | null
  status: 'running' | ToolStatus
  startedAt: number // server ts, seconds
  latencyMs: number | null
  summary: string | null
}

export interface TimelineState { rows: TimelineRow[] }
export const EMPTY_TIMELINE: TimelineState = { rows: [] }
const MAX_ROWS = 60

type ToolEvent = Extract<ServerEvent, { type: 'tool.started' | 'tool.progress' | 'tool.finished' }>

/** Rows are keyed by call ID. A specialist's row sits directly under the voice call that started it. */
export function timelineReducer(state: TimelineState, event: ToolEvent | { type: 'reset' }): TimelineState {
  if (event.type === 'reset') return EMPTY_TIMELINE
  const index = state.rows.findIndex((r) => r.callId === event.call_id)
  if (event.type === 'tool.started') {
    if (index !== -1) return state // a duplicate start
    const row: TimelineRow = {
      callId: event.call_id, parentCallId: event.parent_call_id ?? null, agent: event.agent, tool: event.tool,
      behavior: event.behavior, runsOn: event.runs_on, schedulingRequested: event.scheduling_requested ?? null,
      schedulingEffective: null, argsSummary: event.args_summary ?? null, stage: null, status: 'running',
      startedAt: event.ts, latencyMs: null, summary: null,
    }
    const rows = state.rows.slice()
    const parent = row.parentCallId ? rows.findIndex((r) => r.callId === row.parentCallId) : -1
    if (parent === -1) rows.push(row)
    else rows.splice(parent + 1, 0, row)
    return { rows: rows.slice(-MAX_ROWS) }
  }
  if (index === -1) return state
  const rows = state.rows.slice()
  if (event.type === 'tool.progress') {
    rows[index] = { ...rows[index], stage: event.note ? `${event.stage} · ${event.note}` : event.stage }
  } else {
    rows[index] = {
      ...rows[index], status: event.status, latencyMs: event.latency_ms, stage: null,
      schedulingEffective: event.scheduling_effective ?? null, summary: event.summary ?? null,
    }
  }
  return { rows }
}

/** A session that ends leaves no call running. */
export function closeRunning(state: TimelineState): TimelineState {
  if (!state.rows.some((r) => r.status === 'running')) return state
  return { rows: state.rows.map((r) => (r.status === 'running' ? { ...r, status: 'cancelled', stage: null } : r)) }
}

export const timelineStore = createStore<TimelineState>(EMPTY_TIMELINE)
