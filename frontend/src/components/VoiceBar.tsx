import { Mic, MicOff, Send, Square } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useT } from '../i18n'
import { formatClock } from '../lib/format'
import { useStore } from '../lib/store'
import { useNow } from '../lib/useNow'
import { MAX_USER_TEXT } from '../protocol/events'
import { sessionStore } from '../stores/app'
import { sendText, startSession, stopSession, toggleMute } from '../voice/controller'

export function SessionClock() {
  const t = useT()
  const expiresAt = useStore(sessionStore, (s) => (s.status === 'live' ? s.expiresAt : null))
  const now = useNow(1000, expiresAt !== null)
  if (expiresAt === null) return null
  const left = expiresAt - now / 1000
  return <span role="timer" aria-label={t.timeLeft} className={`text-xs tabular-nums ${left < 30 ? 'font-semibold text-error-foreground' : 'text-mist-600'}`}>{formatClock(left)}</span>
}

function Level({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5">
      {[0.15, 0.3, 0.5, 0.7].map((threshold, i) => (
        <span key={i} className={`w-1 rounded-sm transition-all ${level > threshold * 0.5 ? 'bg-brand-red' : 'bg-mist-300'}`} style={{ height: `${30 + i * 23}%` }} />
      ))}
    </span>
  )
}

/** Connect-on-click: no Live session exists until the visitor presses the microphone. */
export function VoiceBar() {
  const t = useT()
  const session = useStore(sessionStore)
  const [text, setText] = useState('')
  const active = session.status === 'live' || session.status === 'connecting' || session.status === 'reconnecting'
  const live = session.status === 'live'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (sendText(text)) setText('')
  }

  const status = session.status === 'connecting' || session.status === 'reconnecting' ? t.connecting
    : live ? (session.muted ? t.muted : t.listening)
    : session.ended ? (t[`ended_${session.ended}` as keyof typeof t] as string) ?? t.ended_ended
    : ''
  const micProblem = session.micError === 'denied' ? t.micDenied : session.micError === 'unavailable' ? t.micUnavailable : null

  return (
    <div className="border-t border-mist-900/10 bg-white px-3 py-2">
      <p role="status" aria-live="polite" className="mb-1.5 min-h-4 text-xs text-mist-700">
        {session.warningSeconds !== null && live ? t.warnTime(session.warningSeconds) : session.notice && active ? session.notice : status}
        {live && session.limits ? <span className="ml-2 text-mist-600">· {t.sessionsLeft(session.limits.sessions_left_today)}</span> : null}
      </p>
      {micProblem && active ? <p className="mb-1.5 text-xs text-warning-foreground">{micProblem}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => (active ? stopSession() : void startSession())} aria-label={active ? t.micStop : t.micStart} title={active ? t.micStop : t.micStart}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red ${active ? 'bg-mist-900 hover:bg-mist-700' : 'bg-brand-red hover:bg-brand-coral'}`}>
          {active ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
        </button>
        {live && !session.micError ? (
          <button type="button" onClick={toggleMute} aria-pressed={session.muted} aria-label={session.muted ? t.unmute : t.mute} title={session.muted ? t.unmute : t.mute}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mist-900/15 text-mist-700 hover:bg-mist-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
            {session.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          </button>
        ) : null}
        {live && !session.muted ? <Level level={session.level} /> : null}
        <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-1">
          <input type="text" value={text} maxLength={MAX_USER_TEXT} disabled={!live} onChange={(e) => setText(e.target.value)} placeholder={t.typeMessage} aria-label={t.typeMessage}
            className="min-w-0 flex-1 rounded-md border border-mist-900/15 bg-white px-2.5 py-1.5 text-sm placeholder-mist-600 outline-none focus:border-brand-coral focus:ring-1 focus:ring-brand-coral disabled:bg-mist-100" />
          <button type="submit" disabled={!live || !text.trim()} aria-label={t.send}
            className="rounded-md p-2 text-brand-red hover:bg-brand-red/10 disabled:text-mist-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
      {!active && !session.ended ? <p className="mt-1.5 text-[11px] text-mist-600">{t.headphones}</p> : null}
    </div>
  )
}
