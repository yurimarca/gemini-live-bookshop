import { createStore } from '../lib/store'
import type { CloseKind, EndReason, Limits } from '../protocol/events'
import { EMPTY_CART, type Cart, type CatalogIndex } from '../types/catalog'

// --- voice session ------------------------------------------------------------------
export type SessionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'ended'

export interface SessionState {
  status: SessionStatus
  muted: boolean
  expiresAt: number | null   // epoch seconds, on the browser's clock
  limits: Limits | null
  warningSeconds: number | null
  ended: CloseKind | EndReason | null
  micError: 'denied' | 'unavailable' | null
  notice: string | null      // a generic message from the server
  level: number              // microphone level, 0 to 1
}

export const IDLE_SESSION: SessionState = {
  status: 'idle', muted: false, expiresAt: null, limits: null, warningSeconds: null, ended: null,
  micError: null, notice: null, level: 0,
}
export const sessionStore = createStore<SessionState>(IDLE_SESSION)
export const patchSession = (patch: Partial<SessionState>) => sessionStore.set((s) => ({ ...s, ...patch }))

// --- catalog ------------------------------------------------------------------------
export interface CatalogState { status: 'loading' | 'ready' | 'error'; index: CatalogIndex | null }
export const catalogStore = createStore<CatalogState>({ status: 'loading', index: null })

// --- cart ---------------------------------------------------------------------------
export interface CartState { cart: Cart; expiredNotice: boolean }
export const cartStore = createStore<CartState>({ cart: EMPTY_CART, expiredNotice: false })

// --- page chrome --------------------------------------------------------------------
export type SheetTab = 'transcript' | 'foryou' | 'agents'
export interface UiState {
  cartOpen: boolean
  spotlight: { title: string | null; bookIds: string[] } | null // books the voice agent put on screen
  sheetOpen: boolean
  sheetTab: SheetTab
  focusSurface: string | null
}
export const uiStore = createStore<UiState>({ cartOpen: false, spotlight: null, sheetOpen: false, sheetTab: 'transcript', focusSurface: null })
export const patchUi = (patch: Partial<UiState>) => uiStore.set((s) => ({ ...s, ...patch }))

// --- A2UI surfaces ------------------------------------------------------------------
export interface SurfacesState {
  ids: string[]                       // in creation order
  unread: number                      // new or updated cards not yet looked at (mobile badge)
  announcement: string                // one polite line for screen readers
  updatedAt: Record<string, number>
}
export const surfacesStore = createStore<SurfacesState>({ ids: [], unread: 0, announcement: '', updatedAt: {} })
