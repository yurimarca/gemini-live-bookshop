/**
 * The A2UI spike (F0), kept as a regression test. It feeds the exact envelopes the gateway
 * builds (fixtures/a2ui-sample.json, checked by the backend tests too) through the pinned
 * renderer packages, renders them with the bookshop catalog, and fires one action.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { A2uiSurface } from '@a2ui/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import sample from '../../../fixtures/a2ui-sample.json'
import { setLocale } from '../i18n'
import { createA2uiSession, rendererCapabilities, type A2uiSession } from './adapter'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
type Messages = Record<string, unknown>[]

let host: HTMLDivElement
let root: Root
let session: A2uiSession
let sent: Record<string, unknown>[]

function render() {
  act(() => {
    root.render(<>{session.surfaces().map((surface) => <A2uiSurface key={surface.id} surface={surface} />)}</>)
  })
}

beforeEach(() => {
  setLocale('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  sent = []
  session = createA2uiSession((message) => sent.push(message))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  session.dispose()
})

describe('bookshop A2UI catalog', () => {
  it('declares v1.0 capabilities for the bookshop catalog only', () => {
    expect(rendererCapabilities).toEqual({ '1.0': { supportedCatalogIds: ['urn:bookshop:catalog:v1'] } })
  })

  it('renders the recommender shelf from createSurface + updateComponents + updateDataModel', () => {
    expect(session.process(sample.recs as Messages)).toEqual(['recs'])
    render()
    expect(host.textContent).toContain('Picked for you')
    expect(host.textContent).toContain('The Hobbit')
    expect(host.textContent).toContain('Dom Casmurro')
    expect(host.textContent).toContain('Matches your interest in fantasy.')
    expect(host.querySelectorAll('article')).toHaveLength(2)
    // Every price carries the fictional-price label.
    expect(host.textContent).toContain('$15.90')
    expect(host.textContent?.match(/demo price/g)).toHaveLength(2)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://covers.openlibrary.org/b/id/14627509-M.jpg?default=false')
  })

  it('updates a surface in place from updateDataModel alone', () => {
    session.process(sample.recs as Messages)
    render()
    act(() => { session.process(sample.recs_update as Messages) })
    expect(host.textContent).toContain('More picks')
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(session.surfaces()).toHaveLength(1)
  })

  it('sends an action envelope with the item context and never handles it locally', async () => {
    session.process(sample.recs as Messages)
    render()
    const add = Array.from(host.querySelectorAll('button')).filter((b) => b.textContent === 'Add to cart')[1]
    await act(async () => { add.click() })
    expect(sent).toHaveLength(1)
    const action = sent[0].action as { name: string; surfaceId: string; context: Record<string, unknown> }
    expect(sent[0].version).toBe('1.0')
    expect(action.name).toBe('add_to_cart')
    expect(action.surfaceId).toBe('recs')
    expect(action.context).toEqual({ book_id: 'OL1003040W' })
  })

  it('renders taste and cart-hold cards, in a stable slot order', () => {
    session.process(sample.cart_hold as Messages)
    session.process(sample.taste as Messages)
    session.process(sample.recs as Messages)
    render()
    expect(session.surfaces().map((s) => s.id)).toEqual(['recs', 'taste', 'cart-hold'])
    expect(host.textContent).toContain('Likes fantasy.')
    expect(host.textContent).toContain('English')
    expect(host.textContent).toContain('Cart hold')
    expect(host.textContent).toContain('2 copies')
  })

  it('deletes a surface', () => {
    session.process(sample.recs as Messages)
    session.process(sample.delete as Messages)
    expect(session.surfaces()).toHaveLength(0)
  })

  it('rejects components outside the catalog and keeps working', () => {
    const hostile: Messages = [
      { version: '1.0', createSurface: { surfaceId: 'x', catalogId: 'urn:bookshop:catalog:v1' } },
      { version: '1.0', updateComponents: { surfaceId: 'x', components: [{ id: 'root', component: 'Modal', title: 'Pay now' }] } },
      { version: '1.0', updateComponents: { surfaceId: 'x', components: [{ id: 'root', component: 'BookCard', bookId: 'a', title: 't', author: 'a', priceCents: 1, html: '<script>' }] } },
    ]
    session.process(hostile)
    session.process(sample.taste as Messages)
    render()
    expect(host.textContent).not.toContain('Pay now')
    expect(host.querySelector('script')).toBeNull()
    expect(host.textContent).toContain('Likes fantasy.')
  })
})
