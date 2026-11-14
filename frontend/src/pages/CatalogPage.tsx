import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookGridCard } from '../components/BookGridCard'
import { useLocale, useT } from '../i18n'
import { categoryLabel } from '../i18n/strings'
import { useStore } from '../lib/store'
import { catalogStore, patchUi, uiStore } from '../stores/app'
import { categoriesOf, collectionsOf, filterBooks, loadCatalog, type SortKey } from '../stores/catalog'

const selectClass = 'rounded-md border border-mist-900/15 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-coral focus:ring-1 focus:ring-brand-coral'
const SORTS: SortKey[] = ['popular', 'year_new', 'year_old']
const PAGE = 48

export function CatalogPage() {
  const t = useT()
  const locale = useLocale()
  const { status, index } = useStore(catalogStore)
  const spotlight = useStore(uiStore, (s) => s.spotlight)
  const [params, setParams] = useSearchParams()
  const books = index?.books ?? []
  // r2 data carries no languages; offer the filter only when some book has them, and ignore a stale ?lang= link.
  const hasLanguages = useMemo(() => books.some((b) => b.languages.length > 0), [books])
  const query = {
    q: params.get('q') ?? '', subject: params.get('subject') ?? '', lang: hasLanguages ? params.get('lang') ?? '' : '',
    collection: params.get('collection') ?? '',
    sort: (SORTS.includes(params.get('sort') as SortKey) ? params.get('sort') : 'popular') as SortKey,
  }
  const categories = useMemo(
    () => categoriesOf(books).map((value) => ({ value, label: categoryLabel(value, locale) })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    [books, locale],
  )
  const collections = useMemo(() => collectionsOf(books), [books])
  const results = useMemo(() => filterBooks(books.slice(), query), [books, query.q, query.subject, query.lang, query.collection, query.sort])
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [query.q, query.subject, query.lang, query.collection, query.sort])
  const shown = useMemo(() => {
    if (!spotlight) return []
    const byId = new Map(books.map((b) => [b.id, b]))
    return spotlight.bookIds.flatMap((id) => byId.get(id) ?? [])
  }, [spotlight, books])

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && !(key === 'sort' && value === 'popular')) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const filtered = Boolean(query.q || query.subject || query.lang || query.collection)

  if (status === 'error') {
    return (
      <div className="py-16 text-center">
        <p className="text-mist-700">{t.loadFailed}</p>
        <button type="button" onClick={() => void loadCatalog(true)} className="mt-3 rounded-md bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-brand-coral">{t.retry}</button>
      </div>
    )
  }

  return (
    <div>
      {shown.length > 0 ? (
        <section aria-label={t.shownByAgent} className="mb-6 rounded-2xl border border-brand-coral/40 bg-brand-coral/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">{spotlight?.title ?? t.shownByAgent}</h2>
            <button type="button" onClick={() => patchUi({ spotlight: null })} aria-label={t.dismiss} className="rounded p-1 text-mist-600 hover:bg-mist-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral"><X className="h-4 w-4" aria-hidden /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">{shown.map((book) => <BookGridCard key={book.id} book={book} eager />)}</div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto font-display text-xl font-bold">{t.catalog}</h1>
        <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wide text-mist-600">{t.filterSubject}
          <select value={query.subject} onChange={(e) => update('subject', e.target.value)} className={selectClass}>
            <option value="">{t.all}</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        {collections.length ? (
          <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wide text-mist-600">{t.filterCollection}
            <select value={query.collection} onChange={(e) => update('collection', e.target.value)} className={selectClass}>
              <option value="">{t.all}</option>
              {collections.map((c) => <option key={c} value={c}>{t[`collection_${c}` as 'collection_brazilian']}</option>)}
            </select>
          </label>
        ) : null}
        {hasLanguages ? <fieldset className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wide text-mist-600">
          <legend className="mb-0.5">{t.filterLanguage}</legend>
          <div className="flex overflow-hidden rounded-md border border-mist-900/15 bg-white text-sm normal-case tracking-normal">
            {([['', t.all], ['por', 'PT'], ['eng', 'EN']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={query.lang === value} onClick={() => update('lang', value)}
                className={`px-3 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-coral ${query.lang === value ? 'bg-mist-900 text-white' : 'text-mist-700 hover:bg-mist-900/5'}`}>{label}</button>
            ))}
          </div>
        </fieldset> : null}
        <label className="flex flex-col gap-0.5 text-[11px] uppercase tracking-wide text-mist-600">{t.sort}
          <select value={query.sort} onChange={(e) => update('sort', e.target.value)} className={selectClass}>
            <option value="popular">{t.sortPopular}</option>
            <option value="year_new">{t.sortYearNew}</option>
            <option value="year_old">{t.sortYearOld}</option>
          </select>
        </label>
      </div>

      {status === 'loading' && !index ? (
        <div aria-busy="true" aria-label={t.loading} className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-mist-100" />)}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-mist-600" role="status">
            {t.resultsCount(results.length)}
            {filtered ? <button type="button" onClick={() => setParams({}, { replace: true })} className="ml-2 text-brand-red underline underline-offset-2">{t.clearFilters}</button> : null}
          </p>
          {results.length === 0 ? <p className="py-12 text-center text-mist-700">{t.noResults}</p> : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5" lang={locale}>
                {results.slice(0, limit).map((book, i) => <BookGridCard key={book.id} book={book} eager={i < 5} />)}
              </div>
              {results.length > limit ? (
                <div className="mt-8 text-center">
                  <button type="button" onClick={() => setLimit((n) => n + PAGE)}
                    className="rounded-md border border-mist-900/15 bg-white px-4 py-2 text-sm font-medium text-mist-900 hover:bg-mist-900/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
                    {t.showMore(Math.min(PAGE, results.length - limit))}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
