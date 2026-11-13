import { Check, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DemoPriceTag } from '../a2ui/catalog'
import { setCartQuantity } from '../cart/actions'
import { useLocale, useT } from '../i18n'
import { LANGUAGE_NAMES } from '../lib/format'
import { useStore } from '../lib/store'
import { cartStore } from '../stores/app'
import { displayTitle } from '../stores/catalog'
import type { IndexEntry } from '../types/catalog'
import { Cover } from './Cover'

export function LanguageBadges({ languages }: { languages: string[] }) {
  const known = languages.filter((code) => code === 'eng' || code === 'por')
  if (known.length === 0) return null
  return (
    <span className="flex gap-1">
      {known.map((code) => (
        <span key={code} className="rounded border border-mist-900/15 px-1 text-[10px] font-medium text-mist-700">{LANGUAGE_NAMES[code].short}</span>
      ))}
    </span>
  )
}

export function AddToCartButton({ bookId, compact = false }: { bookId: string; compact?: boolean }) {
  const t = useT()
  const inCart = useStore(cartStore, (s) => s.cart.items.some((i) => i.id === bookId))
  return (
    <button type="button" disabled={inCart} onClick={() => void setCartQuantity(bookId, 1)}
      className={`inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red ${compact ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'} ${inCart ? 'bg-mist-100 text-mist-700' : 'bg-brand-red text-white hover:bg-brand-coral'}`}>
      {inCart ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
      {inCart ? t.inCart : t.addToCart}
    </button>
  )
}

export function BookGridCard({ book, eager = false }: { book: IndexEntry; eager?: boolean }) {
  const locale = useLocale()
  const title = displayTitle(book, locale)
  return (
    <article className="flex flex-col gap-1.5">
      <Link to={`/book/${book.id}`} className="group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-coral">
        <Cover coverId={book.cover_id} title={title} eager={eager} />
        <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-mist-900 group-hover:text-brand-red">{title}</h3>
      </Link>
      <p className="truncate text-xs text-mist-700">{book.author_names.slice(0, 2).join(', ')}</p>
      <div className="flex items-center gap-2 text-xs text-mist-600">
        {book.year ? <span className="tabular-nums">{book.year}</span> : null}
        <LanguageBadges languages={book.languages} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
        <DemoPriceTag cents={book.price_cents} />
        <AddToCartButton bookId={book.id} compact />
      </div>
    </article>
  )
}
