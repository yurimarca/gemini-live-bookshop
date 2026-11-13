/**
 * The only module that talks to the A2UI renderer packages. They are 0.x and move fast
 * (ten releases in seven months), so everything else in the app goes through this file.
 */
import { MessageProcessor } from '@a2ui/web_core/v1_0'
import { A2UI_VERSION, bookshopCatalog, CATALOG_ID } from './catalog'

export type Surface = Parameters<typeof import('@a2ui/react').A2uiSurface>[0]['surface']
export type ActionSender = (message: Record<string, unknown>) => void

export const SURFACE_ORDER = ['recs', 'taste-recs', 'taste', 'cart-hold']
export const ALLOWED_ACTIONS = new Set(['add_to_cart', 'open_book', 'dismiss', 'forget_taste'])

/** Capabilities sent in session.start, so the gateway knows what this page can render. */
export const rendererCapabilities = { [A2UI_VERSION]: { supportedCatalogIds: [CATALOG_ID] } }

export interface A2uiSession {
  /** Feed one `a2ui` frame. Returns the surface IDs it touched. Bad messages are dropped, not thrown. */
  process(messages: Record<string, unknown>[]): string[]
  surfaces(): Surface[]
  subscribe(listener: () => void): () => void
  dispose(): void
}

function surfaceIdOf(message: Record<string, unknown>): string | null {
  for (const key of ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']) {
    const body = message[key] as { surfaceId?: unknown } | undefined
    if (body && typeof body.surfaceId === 'string') return body.surfaceId
  }
  return null
}

/** One processor per voice session. Actions leave through `send`; they are never handled locally. */
export function createA2uiSession(send: ActionSender): A2uiSession {
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const processor = new MessageProcessor([bookshopCatalog], (action) => {
    const payload = action as unknown as Record<string, unknown>
    if (typeof payload.name !== 'string' || !ALLOWED_ACTIONS.has(payload.name)) return
    send({ version: A2UI_VERSION, action: payload })
  })
  const subscriptions = [processor.onSurfaceCreated(notify), processor.onSurfaceDeleted(notify)]

  return {
    process(messages) {
      const touched = new Set<string>()
      for (const message of messages) {
        // One at a time: a bad message must not take the good ones down with it.
        const errors = processor.processMessagesWithErrors([message])
        if (errors.length > 0) {
          console.warn('[a2ui] message rejected:', errors.map((e) => (e as { error?: { message?: string } }).error?.message).join('; '))
          continue
        }
        const id = surfaceIdOf(message)
        if (id) touched.add(id)
      }
      notify()
      return [...touched]
    },
    surfaces() {
      const all = Array.from(processor.model.surfacesMap.values()) as unknown as Surface[]
      const rank = (id: string) => (SURFACE_ORDER.indexOf(id) + 1) || SURFACE_ORDER.length + 1
      return all.sort((a, b) => rank(a.id) - rank(b.id))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      subscriptions.forEach((s) => s.unsubscribe())
      listeners.clear()
    },
  }
}
