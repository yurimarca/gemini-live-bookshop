import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useT } from '../i18n'
import { useStore } from '../lib/store'
import { patchUi, surfacesStore, uiStore, type SheetTab } from '../stores/app'
import { transcriptStore } from '../stores/transcript'
import { AgentCanvas } from './AgentCanvas'
import { Timeline } from './Timeline'
import { Transcript } from './Transcript'
import { SessionClock, VoiceBar } from './VoiceBar'

/** Desktop: a docked column with the conversation, the timeline and the voice bar. */
export function DesktopDock() {
  const t = useT()
  const [timelineOpen, setTimelineOpen] = useState(true)
  return (
    <aside aria-label={t.conversation} className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[360px] shrink-0 flex-col border-l border-mist-900/10 bg-mist-50 lg:flex">
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-mist-600">{t.conversation}</h2>
        <SessionClock />
      </div>
      <Transcript />
      <div className={`flex min-h-0 flex-col border-t border-mist-900/10 ${timelineOpen ? 'max-h-[38%]' : ''}`}>
        <button type="button" onClick={() => setTimelineOpen(!timelineOpen)} aria-expanded={timelineOpen}
          className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-mist-600 hover:text-mist-900 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-coral">
          {t.agentsAtWork}
          {timelineOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
        </button>
        {timelineOpen ? <div className="min-h-0 overflow-y-auto"><Timeline /></div> : null}
      </div>
      <VoiceBar />
    </aside>
  )
}

/** Mobile: a bar pinned to the bottom, with a sheet the visitor opens. A new card never opens it. */
export function MobileDock() {
  const t = useT()
  const { sheetOpen, sheetTab } = useStore(uiStore)
  const unread = useStore(surfacesStore, (s) => s.unread)
  const caption = useStore(transcriptStore, (s) => {
    const last = [...s.items].reverse().find((i) => i.kind === 'utterance')
    return last && last.kind === 'utterance' ? last.text : ''
  })
  const select = (tab: SheetTab) => {
    patchUi({ sheetTab: tab })
    if (tab === 'foryou') surfacesStore.set((s) => ({ ...s, unread: 0 }))
  }
  const toggle = () => {
    patchUi({ sheetOpen: !sheetOpen })
    if (!sheetOpen && sheetTab === 'foryou') surfacesStore.set((s) => ({ ...s, unread: 0 }))
  }
  const tabs: [SheetTab, string][] = [['transcript', t.tabTranscript], ['foryou', t.tabForYou], ['agents', t.tabAgents]]

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mist-900/10 bg-mist-50 shadow-[0_-4px_16px_rgba(32,29,27,0.08)] lg:hidden">
      <button type="button" onClick={toggle} aria-expanded={sheetOpen} aria-controls="conversation-sheet"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-mist-700 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-coral">
        <span className="min-w-0 flex-1 truncate">{caption || t.conversation}</span>
        {unread > 0 ? <span className="rounded-full bg-brand-red px-1.5 py-0.5 text-[10px] font-bold text-white">{t.newCards(unread)}</span> : null}
        <SessionClock />
        {sheetOpen ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />}
      </button>
      {sheetOpen ? (
        <div id="conversation-sheet" className="flex h-[55vh] flex-col border-t border-mist-900/10">
          <div role="tablist" className="flex border-b border-mist-900/10">
            {tabs.map(([tab, label]) => (
              <button key={tab} type="button" role="tab" aria-selected={sheetTab === tab} onClick={() => select(tab)}
                className={`flex-1 px-2 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-coral ${sheetTab === tab ? 'border-b-2 border-brand-red text-mist-900' : 'text-mist-600'}`}>
                {label}{tab === 'foryou' && unread > 0 ? ` (${unread})` : ''}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {sheetTab === 'transcript' ? <Transcript /> : sheetTab === 'foryou' ? <div className="p-3"><AgentCanvas compact /></div> : <Timeline />}
          </div>
        </div>
      ) : null}
      <VoiceBar />
    </div>
  )
}
