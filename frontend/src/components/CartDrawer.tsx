import { Trash2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DemoPriceTag } from '../a2ui/catalog'
import { setCartQuantity } from '../cart/actions'
import { useT } from '../i18n'
import { formatClock } from '../lib/format'
import { useStore } from '../lib/store'
import { useNow } from '../lib/useNow'
import { cartStore, patchUi, uiStore } from '../stores/app'
import { Cover } from './Cover'

export function useHoldSeconds(): number | null {
  const expiresAt = useStore(cartStore, (s) => s.cart.hold_expires_at)
  const now = useNow(1000, expiresAt !== null)
  return expiresAt === null ? null : Math.max(0, expiresAt - now / 1000)
}

/** The cart is a drawer, opened by the visitor or by the voice agent. It is the last step: there is no checkout. */
export function CartDrawer() {
  const t = useT()
  const open = useStore(uiStore, (s) => s.cartOpen)
  const { cart, expiredNotice } = useStore(cartStore)
  const hold = useHoldSeconds()
  const closeRef = useRef<HTMLButtonElement>(null)
  const close = () => patchUi({ cartOpen: false })

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label={t.dismiss} tabIndex={-1} onClick={close} className="absolute inset-0 bg-mist-900/30" />
      <aside role="dialog" aria-modal="true" aria-label={t.cart} className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-mist-900/10 px-4 py-3">
          <h2 className="font-display text-lg font-semibold">{t.cart}</h2>
          <button ref={closeRef} type="button" onClick={close} aria-label={t.dismiss} className="rounded p-1.5 text-mist-700 hover:bg-mist-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {expiredNotice ? <p role="status" className="mb-3 rounded-md bg-warning-light px-3 py-2 text-sm text-warning-foreground">{t.cartHoldExpired}</p> : null}
          {cart.items.length === 0 ? <p className="text-sm text-mist-700">{t.cartEmpty}</p> : (
            <ul className="flex flex-col gap-3">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="w-14 shrink-0"><Cover coverId={item.cover_id} title={item.title} size="S" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-mist-900">{item.title}</p>
                    <p className="truncate text-xs text-mist-700">{item.author}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                      <span className="text-mist-700">{item.quantity} × <DemoPriceTag cents={item.price_cents} /></span>
                      <button type="button" onClick={() => void setCartQuantity(item.id, 0)} aria-label={`${t.remove}: ${item.title}`}
                        className="rounded p-1 text-mist-600 hover:bg-mist-900/5 hover:text-error-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t border-mist-900/10 px-4 py-3 text-sm">
          {cart.items.length > 0 ? (
            <>
              <div className="flex items-center justify-between"><span className="text-mist-700">{t.cartTotal}</span><DemoPriceTag cents={cart.total_cents} /></div>
              {hold !== null ? <div className="mt-1 flex items-center justify-between text-mist-700"><span>{t.cartHold}</span><span className="tabular-nums" role="timer">{formatClock(hold)}</span></div> : null}
            </>
          ) : null}
          <p className="mt-2 text-xs text-mist-600">{t.cartNote}</p>
        </footer>
      </aside>
    </div>
  )
}
