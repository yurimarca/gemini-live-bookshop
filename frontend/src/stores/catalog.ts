import { api } from '../api/client'
import { fold } from '../lib/format'
import { catalogStore } from './app'
import type { IndexEntry } from '../types/catalog'

let inflight: Promise<void> | null = null

/** Load the slim index once. Browsing, filtering and search then need no further requests. */
export function loadCatalog(force = false): Promise<void> {
  if (inflight && !force) return inflight
  catalogStore.set({ status: 'loading', index: catalogStore.get().index })
  inflight = api.catalog().then(
    (index) => catalogStore.set({ status: 'ready', index }),
    () => catalogStore.set({ status: 'error', index: null }),
  )
  return inflight
}

export type SortKey = 'popular' | 'year_new' | 'year_old'
export interface CatalogQuery { q: string; subject: string; lang: string; sort: SortKey }

const haystacks = new WeakMap<IndexEntry, string>()
function haystack(book: IndexEntry): string {
  let text = haystacks.get(book)
  if (!text) {
    text = fold([book.title, book.title_pt ?? '', book.author_names.join(' '), book.category, book.subjects.join(' ')].join(' '))
    haystacks.set(book, text)
  }
  return text
}

/** Client-side filter over the slim index: every query word must appear, accents ignored. */
export function filterBooks(books: IndexEntry[], query: CatalogQuery): IndexEntry[] {
  const words = fold(query.q).split(/\s+/).filter(Boolean)
  const filtered = books.filter((book) => {
    if (query.lang && !book.languages.includes(query.lang)) return false
    if (query.subject && book.category !== query.subject) return false
    const text = haystack(book)
    return words.every((word) => text.includes(word))
  })
  const year = (b: IndexEntry, missing: number) => b.year ?? missing
  switch (query.sort) {
    case 'year_new': return filtered.sort((a, b) => year(b, -Infinity) - year(a, -Infinity))
    case 'year_old': return filtered.sort((a, b) => year(a, Infinity) - year(b, Infinity))
    default: return filtered.sort((a, b) => b.popularity - a.popularity)
  }
}

export function categoriesOf(books: IndexEntry[]): string[] {
  return [...new Set(books.map((b) => b.category))].sort()
}

/** In Portuguese, prefer the Portuguese title when the book has one. */
export function displayTitle(book: { title: string; title_pt: string | null }, locale: string): string {
  return locale === 'pt-BR' && book.title_pt ? book.title_pt : book.title
}
