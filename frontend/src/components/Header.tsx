import { BookOpen, ShoppingCart } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { usingDevAuth } from '../auth/firebase'
import { setLocale, useLocale, useT } from '../i18n'
import { formatClock } from '../lib/format'
import { useStore } from '../lib/store'
import type { Locale } from '../protocol/events'
import { cartStore, patchUi } from '../stores/app'
import { announceLocale } from '../voice/controller'
import { useHoldSeconds } from './CartDrawer'

function LocaleToggle() {
  const locale = useLocale()
  const choose = (next: Locale) => { setLocale(next); announceLocale() }
  return (
    <div role="group" aria-label="Language / Idioma" className="flex overflow-hidden rounded-md border border-mist-900/15 text-xs font-medium">
      {(['en', 'pt-BR'] as const).map((code) => (
        <button key={code} type="button" aria-pressed={locale === code} onClick={() => choose(code)}
          className={`px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-coral ${locale === code ? 'bg-mist-900 text-white' : 'text-mist-700 hover:bg-mist-900/5'}`}>
          {code === 'en' ? 'EN' : 'PT'}
        </button>
      ))}
    </div>
  )
}

export function Header() {
  const t = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const count = useStore(cartStore, (s) => s.cart.items.reduce((n, i) => n + i.quantity, 0))
  const hold = useHoldSeconds()

  useEffect(() => { setQuery(params.get('q') ?? '') }, [params])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams(window.location.pathname === '/' ? params : undefined)
    if (query.trim()) next.set('q', query.trim())
    else next.delete('q')
    patchUi({ spotlight: null })
    navigate({ pathname: '/', search: next.toString() })
  }

  return (
    <header className="sticky top-0 z-30 border-b border-mist-900/10 bg-mist-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold text-mist-900 hover:text-brand-red">
          <span className="rounded-md bg-brand-red p-1"><BookOpen className="h-4 w-4 text-white" aria-hidden /></span>
          {t.brand}
        </Link>
        <span className="rounded-full bg-warning-light px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-foreground">{t.demoBadge}</span>
        {usingDevAuth ? <span className="hidden rounded-full bg-info-light px-2 py-0.5 text-[11px] text-mist-700 sm:inline">{t.devAuth}</span> : null}
        <form onSubmit={submit} role="search" className="order-last w-full sm:order-none sm:ml-auto sm:w-72">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder}
            className="w-full rounded-md border border-mist-900/15 bg-white px-3 py-1.5 text-sm placeholder-mist-600 outline-none focus:border-brand-coral focus:ring-1 focus:ring-brand-coral" />
        </form>
        <nav className="ml-auto flex items-center gap-2 sm:ml-0">
          <Link to="/about" className="rounded px-1.5 py-1 text-sm text-mist-700 hover:text-mist-900">{t.about}</Link>
          <LocaleToggle />
          <button type="button" onClick={() => patchUi({ cartOpen: true })} aria-label={`${t.cart} (${count})`}
            className="relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-mist-700 hover:bg-mist-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {count > 0 ? <span className="rounded-full bg-brand-red px-1.5 text-xs font-bold text-white">{count}</span> : null}
            {hold !== null ? <span className="hidden text-xs tabular-nums text-mist-600 sm:inline">{formatClock(hold)}</span> : null}
          </button>
        </nav>
      </div>
    </header>
  )
}
