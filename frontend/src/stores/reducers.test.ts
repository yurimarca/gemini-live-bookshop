import { describe, expect, it } from 'vitest'
import type { ServerEvent } from '../protocol/events'
import { EMPTY_TIMELINE, closeRunning, timelineReducer, type TimelineState } from './timeline'
import { EMPTY_TRANSCRIPT, transcriptReducer, type TranscriptAction, type TranscriptState } from './transcript'
import { filterBooks } from './catalog'
import type { IndexEntry } from '../types/catalog'

const run = (actions: TranscriptAction[]) => actions.reduce<TranscriptState>(transcriptReducer, EMPTY_TRANSCRIPT)

describe('transcript reducer', () => {
  it('appends deltas and replaces the text on final', () => {
    const state = run([
      { type: 'delta', utteranceId: 'u1', role: 'user', text: 'something like ' },
      { type: 'delta', utteranceId: 'u1', role: 'user', text: 'Dom Casmuro' },
      { type: 'final', utteranceId: 'u1', role: 'user', text: 'something like Dom Casmurro', interrupted: false },
    ])
    expect(state.items).toEqual([{ kind: 'utterance', id: 'u1', role: 'user', text: 'something like Dom Casmurro', final: true, interrupted: false }])
  })

  it('orders utterances by their first delta, even when the user text finishes late', () => {
    const state = run([
      { type: 'delta', utteranceId: 'u1', role: 'user', text: 'hi' },
      { type: 'delta', utteranceId: 'a2', role: 'agent', text: 'Hello' },
      { type: 'final', utteranceId: 'u1', role: 'user', text: 'hi there', interrupted: false },
    ])
    expect(state.items.map((i) => i.id)).toEqual(['u1', 'a2'])
  })

  it('drops the unheard remainder on barge-in', () => {
    const state = run([
      { type: 'delta', utteranceId: 'a1', role: 'agent', text: 'I found a few books that you might enjoy' },
      { type: 'final', utteranceId: 'a1', role: 'agent', text: 'I found a few books that you might enjoy', interrupted: true, revealedChars: 14 },
    ])
    expect(state.items[0]).toMatchObject({ text: 'I found a few', interrupted: true, final: true })
  })

  it('ignores deltas after a final and empty finals for unknown utterances', () => {
    const state = run([
      { type: 'final', utteranceId: 'x', role: 'agent', text: '', interrupted: false },
      { type: 'final', utteranceId: 'u1', role: 'user', text: 'typed', interrupted: false },
      { type: 'delta', utteranceId: 'u1', role: 'user', text: ' late' },
    ])
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ text: 'typed' })
  })

  it('adds one marker per card, not one per update', () => {
    const state = run([
      { type: 'marker', agent: 'recommender', surfaceId: 'recs' },
      { type: 'marker', agent: 'recommender', surfaceId: 'recs' },
      { type: 'marker', agent: 'taste_profiler', surfaceId: 'taste' },
    ])
    expect(state.items.map((i) => i.kind === 'marker' && i.surfaceId)).toEqual(['recs', 'taste'])
  })
})

type ToolEvent = Extract<ServerEvent, { type: 'tool.started' | 'tool.progress' | 'tool.finished' }>
const base = { seq: 1, ts: 100 }
const started = (call_id: string, extra: Partial<Extract<ToolEvent, { type: 'tool.started' }>> = {}): ToolEvent => ({
  ...base, type: 'tool.started', call_id, agent: 'voice', tool: 'recommend_books', behavior: 'NON_BLOCKING',
  scheduling_requested: 'WHEN_IDLE', runs_on: 'gateway', ...extra,
})
const play = (events: ToolEvent[]) => events.reduce<TimelineState>(timelineReducer, EMPTY_TIMELINE)

describe('timeline reducer', () => {
  it('tracks a call from start to finish, keyed by call id', () => {
    const state = play([
      started('c1'),
      { ...base, type: 'tool.progress', call_id: 'c1', stage: 'ranking', note: '30 candidates' },
      { ...base, type: 'tool.finished', call_id: 'c1', status: 'ok', scheduling_effective: 'WHEN_IDLE', latency_ms: 1800 },
    ])
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ status: 'ok', latencyMs: 1800, schedulingRequested: 'WHEN_IDLE', schedulingEffective: 'WHEN_IDLE', stage: null })
  })

  it('keeps requested and effective scheduling apart', () => {
    const state = play([
      started('c1', { scheduling_requested: 'INTERRUPT' }),
      { ...base, type: 'tool.finished', call_id: 'c1', status: 'ok', scheduling_effective: 'WHEN_IDLE', latency_ms: 5 },
    ])
    expect(state.rows[0]).toMatchObject({ schedulingRequested: 'INTERRUPT', schedulingEffective: 'WHEN_IDLE' })
  })

  it('nests a specialist row under the call that started it', () => {
    const state = play([
      started('c1'), started('c2', { tool: 'search_books', behavior: 'BLOCKING' }),
      started('c1:recommender', { agent: 'recommender', tool: 'rank_candidates', parent_call_id: 'c1' }),
    ])
    expect(state.rows.map((r) => r.callId)).toEqual(['c1', 'c1:recommender', 'c2'])
  })

  it('nests researcher then recommender two levels deep, in start order', () => {
    const state = play([
      started('c1', { tool: 'research_for_taste' }), started('c2', { tool: 'search_books', behavior: 'BLOCKING' }),
      started('c1:researcher', { agent: 'researcher', tool: 'plan_angles', parent_call_id: 'c1' }),
      started('c1:researcher:recommender', { agent: 'recommender', tool: 'rank_candidates', parent_call_id: 'c1:researcher' }),
      started('auto-1', { agent: 'researcher', tool: 'research_for_taste' }),
      started('auto-1:recommender', { agent: 'recommender', tool: 'rank_candidates', parent_call_id: 'auto-1' }),
    ])
    expect(state.rows.map((r) => [r.callId, r.depth])).toEqual([
      ['c1', 0], ['c1:researcher', 1], ['c1:researcher:recommender', 2], ['c2', 0], ['auto-1', 0], ['auto-1:recommender', 1],
    ])
  })

  it('ignores duplicate starts and events for unknown calls', () => {
    const state = play([started('c1'), started('c1'), { ...base, type: 'tool.finished', call_id: 'zz', status: 'ok', latency_ms: 1 }])
    expect(state.rows).toHaveLength(1)
  })

  it('leaves no call running after the session ends', () => {
    expect(closeRunning(play([started('c1')])).rows[0].status).toBe('cancelled')
  })
})

describe('catalog filter', () => {
  const book = (over: Partial<IndexEntry>): IndexEntry => ({
    id: 'OL1W', title: 'T', title_pt: null, author_names: ['A'], category: 'Fiction', subjects: [], year: 1900, languages: ['eng'],
    segments: [], price_cents: 990, rating: null, rating_count: null, popularity: 1, cover_id: null, description: null, ...over,
  })
  const books = [
    book({ id: 'OL1W', title: 'Memórias Póstumas de Brás Cubas', author_names: ['Machado de Assis'], languages: ['por'], popularity: 2, year: 1881, category: 'Brazilian Literature' }),
    book({ id: 'OL2W', title: 'The Hobbit', author_names: ['J. R. R. Tolkien'], popularity: 5, year: 1937, category: 'Fantasy' }),
    book({ id: 'OL3W', title: 'Dracula', author_names: ['Bram Stoker'], popularity: 3, year: null, category: 'Horror' }),
  ]
  const q = { q: '', subject: '', lang: '', sort: 'popular' as const }

  it('matches every word, ignoring accents', () => {
    expect(filterBooks(books.slice(), { ...q, q: 'memorias machado' }).map((b) => b.id)).toEqual(['OL1W'])
    expect(filterBooks(books.slice(), { ...q, q: 'hobbit stoker' })).toEqual([])
  })

  it('filters by language and subject and sorts', () => {
    expect(filterBooks(books.slice(), { ...q, lang: 'por' }).map((b) => b.id)).toEqual(['OL1W'])
    expect(filterBooks(books.slice(), { ...q, subject: 'Horror' }).map((b) => b.id)).toEqual(['OL3W'])
    expect(filterBooks(books.slice(), q).map((b) => b.id)).toEqual(['OL2W', 'OL3W', 'OL1W'])
    expect(filterBooks(books.slice(), { ...q, sort: 'year_old' }).map((b) => b.id)).toEqual(['OL1W', 'OL2W', 'OL3W'])
  })
})
