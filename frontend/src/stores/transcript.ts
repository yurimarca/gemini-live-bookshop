import { createStore } from '../lib/store'
import type { AgentName, Role } from '../protocol/events'

export type TranscriptItem =
  | { kind: 'utterance'; id: string; role: Role; text: string; final: boolean; interrupted: boolean }
  | { kind: 'marker'; id: string; agent: AgentName; surfaceId: string }
  | { kind: 'note'; id: string; text: string }

export interface TranscriptState { items: TranscriptItem[] }

export type TranscriptAction =
  | { type: 'delta'; utteranceId: string; role: Role; text: string }
  | { type: 'final'; utteranceId: string; role: Role; text: string; interrupted: boolean; revealedChars?: number }
  | { type: 'marker'; agent: AgentName; surfaceId: string }
  | { type: 'note'; text: string }
  | { type: 'reset' }

export const EMPTY_TRANSCRIPT: TranscriptState = { items: [] }
const MAX_ITEMS = 200

/**
 * The backend aggregates utterances and owns their IDs, so this reducer only appends and replaces.
 * Items are ordered by their first delta: the user's transcription can arrive after the agent
 * has started answering, and it still belongs where it first appeared.
 */
export function transcriptReducer(state: TranscriptState, action: TranscriptAction): TranscriptState {
  switch (action.type) {
    case 'reset':
      return EMPTY_TRANSCRIPT
    case 'delta': {
      const index = state.items.findIndex((i) => i.kind === 'utterance' && i.id === action.utteranceId)
      if (index === -1) {
        return push(state, { kind: 'utterance', id: action.utteranceId, role: action.role, text: action.text, final: false, interrupted: false })
      }
      const item = state.items[index]
      if (item.kind !== 'utterance' || item.final) return state
      return replace(state, index, { ...item, text: item.text + action.text })
    }
    case 'final': {
      const index = state.items.findIndex((i) => i.kind === 'utterance' && i.id === action.utteranceId)
      let text = action.text
      if (action.interrupted && action.revealedChars !== undefined) {
        // Barge-in: keep only what the listener actually heard.
        text = text.slice(0, action.revealedChars).trimEnd()
      }
      const item: TranscriptItem = { kind: 'utterance', id: action.utteranceId, role: action.role, text, final: true, interrupted: action.interrupted }
      if (index === -1) return text ? push(state, item) : state
      return replace(state, index, item)
    }
    case 'marker': {
      const last = state.items[state.items.length - 1]
      if (last?.kind === 'marker' && last.surfaceId === action.surfaceId) return state // an update in place
      return push(state, { kind: 'marker', id: `m${state.items.length}-${action.surfaceId}`, agent: action.agent, surfaceId: action.surfaceId })
    }
    case 'note':
      return push(state, { kind: 'note', id: `n${state.items.length}`, text: action.text })
  }
}

function push(state: TranscriptState, item: TranscriptItem): TranscriptState {
  return { items: [...state.items, item].slice(-MAX_ITEMS) }
}

function replace(state: TranscriptState, index: number, item: TranscriptItem): TranscriptState {
  const items = state.items.slice()
  items[index] = item
  return { items }
}

export const transcriptStore = createStore<TranscriptState>(EMPTY_TRANSCRIPT)
export const dispatchTranscript = (action: TranscriptAction) => transcriptStore.set((s) => transcriptReducer(s, action))
