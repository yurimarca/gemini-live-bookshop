/**
 * The voice session, outside React: one socket, one microphone, one player, one A2UI processor.
 * Nothing here runs until the visitor clicks the microphone, so a page view never opens a
 * Live session. Server events are routed into the stores that the components read.
 */
import { createA2uiSession, rendererCapabilities, type A2uiSession } from '../a2ui/adapter'
import { MIC_CONSTRAINTS, startCapture, type Capture } from '../audio/capture'
import { PcmPlayer } from '../audio/player'
import { appCheckToken, idToken } from '../auth/firebase'
import { applyCart, setCartQuantity } from '../cart/actions'
import { config, liveSocketUrl } from '../config'
import { localeStore, t } from '../i18n'
import { newId } from '../lib/format'
import { go } from '../lib/nav'
import { MAX_USER_TEXT, closeKind, shouldRetry, type AgentName, type ServerEvent } from '../protocol/events'
import { IDLE_SESSION, patchSession, patchUi, sessionStore, surfacesStore, uiStore } from '../stores/app'
import { closeRunning, timelineReducer, timelineStore } from '../stores/timeline'
import { dispatchTranscript, transcriptStore } from '../stores/transcript'
import { LiveSocket } from './socket'

export const player = new PcmPlayer()
let socket: LiveSocket | null = null
let capture: Capture | null = null
let a2ui: A2uiSession | null = null
let attempt = 0
let stopping = false
let clockSkew = 0 // server time minus browser time, seconds

export const getA2ui = () => a2ui

function sendAction(message: Record<string, unknown>): void {
  if (socket?.open) {
    socket.send({ type: 'a2ui.action', op_id: newId(), message })
    return
  }
  // The session is over but its cards are still on screen: honour the two harmless actions locally.
  const action = message.action as { name?: string; context?: { book_id?: unknown } } | undefined
  const bookId = action?.context?.book_id
  if (typeof bookId !== 'string') return
  if (action?.name === 'open_book') go(`/book/${bookId}`)
  if (action?.name === 'add_to_cart') void setCartQuantity(bookId, 1)
}

function syncSurfaces(touched: string[], agent: AgentName): void {
  if (!a2ui) return
  const ids = a2ui.surfaces().map((s) => s.id)
  const ui = uiStore.get()
  const visible = touched.filter((id) => ids.includes(id))
  const lookingAtCards = ui.sheetOpen && ui.sheetTab === 'foryou'
  surfacesStore.set((s) => ({
    ids,
    // A new card adds a badge. It never opens the sheet or moves focus by itself.
    unread: visible.length && !lookingAtCards ? s.unread + 1 : s.unread,
    announcement: visible.length ? t().posted(t()[`agent_${agent}`]) : s.announcement,
    updatedAt: { ...s.updatedAt, ...Object.fromEntries(visible.map((id) => [id, Date.now()])) },
  }))
  visible.forEach((surfaceId) => dispatchTranscript({ type: 'marker', agent, surfaceId }))
}

function onEvent(event: ServerEvent): void {
  switch (event.type) {
    case 'session.ready':
      attempt = 0
      clockSkew = event.server_time - Date.now() / 1000
      patchSession({ status: 'live', expiresAt: event.expires_at - clockSkew, limits: event.limits, ended: null, notice: null, warningSeconds: null })
      applyCart(event.cart)
      break
    case 'audio.start':
      player.startUtterance(event.utterance_id)
      break
    case 'transcript.delta':
      dispatchTranscript({ type: 'delta', utteranceId: event.utterance_id, role: event.role, text: event.text })
      break
    case 'transcript.final': {
      const interrupted = event.interrupted === true
      let revealedChars: number | undefined
      if (interrupted && event.role === 'agent') {
        // Barge-in: note how much was heard, then drop the buffered audio at once.
        revealedChars = Math.floor(event.text.length * player.progress(event.utterance_id))
        player.flush()
      }
      dispatchTranscript({ type: 'final', utteranceId: event.utterance_id, role: event.role, text: event.text, interrupted, revealedChars })
      break
    }
    case 'turn.interrupted':
      player.flush()
      break
    case 'tool.started':
    case 'tool.progress':
    case 'tool.finished':
      timelineStore.set((s) => timelineReducer(s, event))
      break
    case 'a2ui':
      if (a2ui) syncSurfaces(a2ui.process(event.messages), event.agent)
      break
    case 'ui.command':
      if (event.command === 'open_cart') patchUi({ cartOpen: true })
      else if (event.command === 'open_book' && event.book_id) go(`/book/${event.book_id}`)
      else if (event.command === 'show_books' && event.book_ids?.length) {
        patchUi({ spotlight: { title: event.title ?? null, bookIds: event.book_ids } })
        go('/')
      }
      break
    case 'cart.updated':
      applyCart(event, event.op_id)
      break
    case 'session.warning':
      patchSession({ warningSeconds: event.seconds_left })
      break
    case 'session.ended':
      patchSession({ ended: event.reason === 'client' ? 'ended' : event.reason })
      break
    case 'error':
      patchSession({ notice: event.message })
      break
    case 'turn.complete':
    case 'pong':
      break
  }
}

function teardown(): void {
  capture?.stop()
  capture = null
  socket = null
  timelineStore.set(closeRunning)
  patchSession({ level: 0, expiresAt: null, warningSeconds: null })
}

function onClose(code: number, endedByServer: boolean): void {
  if (!stopping && shouldRetry(code, attempt, endedByServer)) {
    attempt += 1
    socket = null
    patchSession({ status: 'reconnecting' })
    dispatchTranscript({ type: 'note', text: t().reconnecting })
    setTimeout(() => { if (sessionStore.get().status === 'reconnecting') void connect() }, 1000 * attempt)
    return
  }
  const previous = sessionStore.get().ended
  teardown()
  player.flush()
  patchSession({ status: 'ended', ended: previous ?? closeKind(code) })
}

async function connect(): Promise<void> {
  try {
    const [token, appCheck] = await Promise.all([idToken(), appCheckToken()])
    socket = new LiveSocket(liveSocketUrl(), {
      onEvent,
      onAudio: (pcm) => player.play(pcm),
      onClose,
    })
    socket.connect({ idToken: token, appCheckToken: appCheck, locale: localeStore.get(), a2uiCapabilities: rendererCapabilities })
  } catch {
    teardown()
    patchSession({ status: 'ended', ended: 'auth' })
  }
}

/** Must be called from a click handler: it unlocks audio output and asks for the microphone. */
export async function startSession(): Promise<void> {
  const status = sessionStore.get().status
  if (status === 'connecting' || status === 'live' || status === 'reconnecting') return
  stopping = false
  attempt = 0
  player.unlock()
  sessionStore.set({ ...IDLE_SESSION, status: 'connecting' })
  transcriptStore.set({ items: [] })
  timelineStore.set({ rows: [] })
  a2ui?.dispose()
  a2ui = createA2uiSession(sendAction)
  surfacesStore.set({ ids: [], unread: 0, announcement: '', updatedAt: {} })

  // No microphone is not fatal: the visitor can still type.
  if (!navigator.mediaDevices?.getUserMedia) {
    patchSession({ micError: 'unavailable', muted: true })
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
      capture = await startCapture(stream, (pcm) => socket?.sendAudio(pcm), (level) => {
        if (Math.abs(level - sessionStore.get().level) > 0.04) patchSession({ level })
      })
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      patchSession({ micError: denied ? 'denied' : 'unavailable', muted: true })
    }
  }
  await connect()
}

export function stopSession(): void {
  stopping = true
  if (socket) socket.stop()
  else {
    teardown()
    patchSession({ status: 'ended', ended: 'ended' })
  }
}

export function toggleMute(): void {
  if (!capture) return
  const muted = !sessionStore.get().muted
  patchSession({ muted })
  socket?.send({ type: 'mic', muted })
}

export function sendText(text: string): boolean {
  const trimmed = text.trim().slice(0, MAX_USER_TEXT)
  if (!trimmed || !socket?.open) return false
  player.flush() // typing over the agent is a barge-in too
  socket.send({ type: 'user.text', text: trimmed, client_msg_id: newId('msg') })
  return true
}

/** The EN|PT toggle: UI strings change locally, and the gateway is told for its own strings. */
export function announceLocale(): void {
  socket?.send({ type: 'session.update', locale: localeStore.get() })
}

export const usesDirectSocket = config.wsUrl !== null
