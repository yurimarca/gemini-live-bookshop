import { A2uiSurface } from '@a2ui/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useT } from '../i18n'
import { useStore } from '../lib/store'
import { patchUi, surfacesStore, uiStore } from '../stores/app'
import { getA2ui } from '../voice/controller'

const noop = () => () => {}

/**
 * The docked, non-modal home of the specialists' cards: one stable slot per surface, updated in
 * place. Cards arrive unprompted while the visitor is speaking, so nothing here takes focus or
 * covers the microphone. A new or updated card is announced once through a polite status line.
 */
export function AgentCanvas({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const { ids, announcement, updatedAt } = useStore(surfacesStore)
  const focus = useStore(uiStore, (s) => s.focusSurface)
  const session = getA2ui()
  useSyncExternalStore(session ? session.subscribe : noop, () => ids.join(','))
  const slots = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!focus) return
    slots.current.get(focus)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const id = setTimeout(() => patchUi({ focusSurface: null }), 1600)
    return () => clearTimeout(id)
  }, [focus])

  const surfaces = session ? session.surfaces().filter((s) => ids.includes(s.id)) : []
  return (
    <section aria-label={t.agentCanvas} className={compact ? '' : 'rounded-2xl border border-dashed border-mist-900/15 bg-mist-100/40 p-3'}>
      {!compact ? <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mist-600">{t.agentCanvas}</h2> : null}
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {surfaces.length === 0 ? (
        <p className="px-1 py-3 text-sm text-mist-600">{t.canvasEmpty}</p>
      ) : (
        <div className={compact ? 'flex flex-col gap-3' : 'grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}>
          {surfaces.map((surface, i) => (
            <div key={surface.id} ref={(el) => { if (el) slots.current.set(surface.id, el); else slots.current.delete(surface.id) }}
              data-updated={updatedAt[surface.id]}
              className={`min-w-0 rounded-xl transition-shadow duration-500 ${focus === surface.id ? 'ring-2 ring-brand-coral' : ''} ${!compact && i === 0 && surface.id === 'recs' ? 'xl:row-span-2' : ''}`}>
              <A2uiSurface surface={surface} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
