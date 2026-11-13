/** Smoke test: the whole page renders against the committed 30-book fixture, with no voice session. */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import fixture from '../../fixtures/catalog-fixture.json'
import App from './App'
import { setLocale } from './i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const sockets: string[] = []
let host: HTMLDivElement

beforeEach(() => {
  setLocale('en')
  window.history.pushState({}, '', '/')
  host = document.createElement('div')
  document.body.appendChild(host)
  const index = {
    schema_version: 1, dataset_version: fixture.dataset_version, count: fixture.count, license: 'CC0-1.0',
    books: fixture.books.map((b) => ({
      id: b.id, title: b.title, title_pt: b.title_pt, author_names: b.author_names, category: b.category, subjects: b.subjects,
      year: b.first_publish_year, languages: b.languages, segments: b.segments, price_cents: b.price_cents, rating: b.rating?.average ?? null,
      rating_count: b.rating?.count ?? null, popularity: b.popularity.score, cover_id: b.cover_id, description: b.description,
    })),
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.endsWith('/api/catalog') ? index : fixture.books.find((b) => url.endsWith(`/api/books/${b.id}`))
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 })
  }))
  vi.stubGlobal('WebSocket', class { constructor(url: string) { sockets.push(url) } })
})

afterEach(() => {
  host.remove()
  vi.unstubAllGlobals()
})

async function mount() {
  const root = createRoot(host)
  await act(async () => { root.render(<App />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  return root
}

it('shows the catalog, the demo labels and the conversation dock without opening a voice session', async () => {
  const root = await mount()
  expect(host.querySelectorAll('main article')).toHaveLength(30)
  expect(host.textContent).toContain('DEMO · prices are fake')
  expect(host.textContent).toContain('demo price')
  expect(host.textContent).toContain('30 books')
  expect(host.querySelector('[aria-label="Start voice session"]')).not.toBeNull()
  expect(sockets).toEqual([]) // connect-on-click: a page view costs nothing
  expect(host.textContent).not.toMatch(/checkout|register|in stock/i)
  act(() => root.unmount())
})

it('switches the interface to Portuguese and prefers Portuguese titles', async () => {
  const root = await mount()
  const pt = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'PT' && b.getAttribute('aria-pressed') !== null)!
  await act(async () => { pt.click() })
  expect(host.textContent).toContain('preço fictício')
  expect(host.textContent).toContain('Orgulho e Preconceito')
  expect(document.documentElement.lang).toBe('pt-BR')
  act(() => root.unmount())
})

it('renders a book detail page from the API', async () => {
  window.history.pushState({}, '', '/book/OL27482W')
  const root = await mount()
  expect(host.querySelector('h1')?.textContent).toBe('The Hobbit')
  expect(host.textContent).toContain('Open Library')
  expect(host.querySelector('a[href="https://openlibrary.org/works/OL27482W"]')).not.toBeNull()
  act(() => root.unmount())
})
