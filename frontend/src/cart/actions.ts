import { api } from '../api/client'
import { hasIdentity, idToken } from '../auth/firebase'
import { newId } from '../lib/format'
import { cartStore } from '../stores/app'
import type { Cart } from '../types/catalog'

/** The server is the source of truth: every change is a REST call or a socket event, never a local edit. */
export function applyCart(cart: Cart, opId?: string): void {
  cartStore.set({
    cart: { items: cart.items, total_cents: cart.total_cents, hold_expires_at: cart.hold_expires_at ?? null },
    expiredNotice: opId === 'hold-expired',
  })
}

/** Read the cart on page load, but only if this browser already has an identity. */
export async function loadCart(): Promise<void> {
  if (!hasIdentity()) return
  try {
    applyCart(await api.cart(await idToken()))
  } catch { /* the cart stays empty; the next action retries */ }
}

export async function setCartQuantity(bookId: string, quantity: number): Promise<boolean> {
  try {
    const token = await idToken() // signs in anonymously on first use
    applyCart(quantity > 0 ? await api.setCartItem(token, bookId, quantity, newId()) : await api.removeCartItem(token, bookId, newId()))
    return true
  } catch {
    return false
  }
}
