import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useStore } from '../lib/store'
import { useNow } from '../lib/useNow'
import { patchUi, sessionStore } from '../stores/app'
import { transcriptStore, type TranscriptItem } from '../stores/transcript'
import { player } from '../voice/controller'

/**
 * Agent text is revealed in step with its audio: the fraction of characters shown equals the
 * fraction of received audio that has played. Text usually arrives well ahead of the voice.
 */
function AgentText({ item, pacing }: { item: Extract<TranscriptItem, { kind: 'utterance' }>; pacing: boolean }) {
  useNow(120, pacing)
  const progress = pacing && !item.interrupted ? player.progress(item.id) : 1
  const shown = progress >= 1 ? item.text : item.text.slice(0, Math.ceil(item.text.length * progress))
  return <>{shown}{item.interrupted ? '—' : !item.final || progress < 1 ? '…' : ''}</>
}

function Row({ item, pacing }: { item: TranscriptItem; pacing: boolean }) {
  const t = useT()
  if (item.kind === 'note') return <li className="py-1 text-center text-xs text-mist-600">{item.text}</li>
  if (item.kind === 'marker') {
    return (
      <li className="py-1 text-xs text-mist-700">
        <span aria-hidden>› </span>{t.posted(t[`agent_${item.agent}`])}{' '}
        <button type="button" onClick={() => patchUi({ focusSurface: item.surfaceId, sheetTab: 'foryou' })}
          className="rounded font-medium text-brand-red underline underline-offset-2 hover:text-brand-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">{t.view}</button>
      </li>
    )
  }
  const isUser = item.role === 'user'
  return (
    // Only finished utterances are exposed to assistive technology, and the agent's are skipped:
    // its voice already said them.
    <li className="py-1" aria-hidden={!item.final || !isUser ? true : undefined}>
      <span className={`mr-2 text-[11px] font-semibold uppercase tracking-wide ${isUser ? 'text-mist-600' : 'text-brand-red'}`}>{isUser ? t.you : t.agent}</span>
      <span className={`text-sm leading-relaxed ${item.final ? 'text-mist-900' : 'text-mist-700'}`}>
        {isUser ? item.text : <AgentText item={item} pacing={pacing} />}
      </span>
      {item.interrupted ? <span className="ml-1.5 rounded bg-mist-100 px-1 text-[10px] uppercase tracking-wide text-mist-600">{t.interrupted}</span> : null}
    </li>
  )
}

export function Transcript() {
  const t = useT()
  const items = useStore(transcriptStore, (s) => s.items)
  const live = useStore(sessionStore, (s) => s.status === 'live')
  const box = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  // Follow the conversation only while the reader is at the bottom; otherwise offer a jump.
  useEffect(() => {
    if (pinned && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [items, pinned])

  const onScroll = () => {
    const el = box.current
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 32)
  }
  const lastAgent = [...items].reverse().find((i) => i.kind === 'utterance' && i.role === 'agent')

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={box} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {items.length === 0 ? <p className="py-6 text-center text-sm text-mist-600">{t.transcriptEmpty}</p> : (
          <ul role="log" aria-label={t.conversation} aria-live="polite" aria-relevant="additions">
            {items.map((item) => <Row key={item.id} item={item} pacing={live && item === lastAgent} />)}
          </ul>
        )}
      </div>
      {!pinned ? (
        <button type="button" onClick={() => setPinned(true)}
          className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-mist-900 px-3 py-1 text-xs text-white shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-coral">
          <ArrowDown className="h-3 w-3" aria-hidden />{t.jumpToLatest}
        </button>
      ) : null}
    </div>
  )
}
