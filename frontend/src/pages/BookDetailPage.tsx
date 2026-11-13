import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DemoPriceTag } from '../a2ui/catalog'
import { api } from '../api/client'
import { AddToCartButton } from '../components/BookGridCard'
import { Cover } from '../components/Cover'
import { useLocale, useT } from '../i18n'
import { LANGUAGE_NAMES } from '../lib/format'
import { displayTitle } from '../stores/catalog'
import type { CatalogBook } from '../types/catalog'

type State = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; book: CatalogBook }

export function BookDetailPage() {
  const t = useT()
  const locale = useLocale()
  const { olid = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api.book(olid).then(
      (book) => { if (!cancelled) setState({ status: 'ready', book }) },
      () => { if (!cancelled) setState({ status: 'missing' }) },
    )
    return () => { cancelled = true }
  }, [olid])

  const back = (
    <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-mist-700 hover:text-brand-red">
      <ArrowLeft className="h-4 w-4" aria-hidden />{t.backToCatalog}
    </Link>
  )
  if (state.status === 'loading') return <div>{back}<p className="py-12 text-center text-mist-600" aria-busy="true">{t.loading}</p></div>
  if (state.status === 'missing') return <div>{back}<p className="py-12 text-center text-mist-700">{t.notFound}</p></div>

  const { book } = state
  const title = displayTitle(book, locale)
  const languages = book.languages.map((code) => LANGUAGE_NAMES[code]?.[locale] ?? code)
  return (
    <div>
      {back}
      <article className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div className="mx-auto w-40 sm:w-full"><Cover coverId={book.cover_id} title={title} size="L" eager /></div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight">{title}</h1>
          {title !== book.title ? <p className="text-sm italic text-mist-600">{book.title}</p> : null}
          <p className="mt-1 text-mist-700">{book.author_names.join(', ')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="text-lg"><DemoPriceTag cents={book.price_cents} /></span>
            <AddToCartButton bookId={book.id} />
          </div>
          {/* Shown only when Open Library has ratings; no claim is made otherwise. */}
          {book.rating && book.rating.count > 0 ? <p className="mt-3 text-sm text-mist-700">{t.ratedBy(book.rating.average.toFixed(1), book.rating.count)}</p> : null}
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {book.first_publish_year ? <><dt className="text-mist-600">{t.firstPublished}</dt><dd className="tabular-nums">{book.first_publish_year}</dd></> : null}
            {languages.length ? <><dt className="text-mist-600">{t.languages}</dt><dd>{languages.join(', ')}</dd></> : null}
          </dl>
          {book.description ? (
            // Plain text only: descriptions are never rendered as HTML or Markdown.
            <p className="mt-4 max-w-prose whitespace-pre-line text-sm leading-relaxed text-mist-900">{book.description}</p>
          ) : <p className="mt-4 text-sm text-mist-600">{t.noDescription}</p>}
          <a href={book.book_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-brand-red underline underline-offset-2 hover:text-brand-coral">
            {t.onOpenLibrary}<ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {book.subjects.length ? (
            <div className="mt-5">
              <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mist-600">{t.subjects}</h2>
              <ul className="flex flex-wrap gap-1.5">{book.subjects.map((s) => <li key={s} className="rounded-full bg-mist-100 px-2.5 py-0.5 text-xs text-mist-700">{s}</li>)}</ul>
            </div>
          ) : null}
        </div>
      </article>
    </div>
  )
}
