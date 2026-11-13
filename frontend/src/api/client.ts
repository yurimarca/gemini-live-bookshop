import { config } from '../config'
import type { Cart, CatalogBook, CatalogIndex } from '../types/catalog'

export class ApiError extends Error {
  constructor(public status: number) {
    super(`request failed with ${status}`)
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${config.apiBase}${path}`, { ...init, headers })
  if (!response.ok) throw new ApiError(response.status)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  catalog: () => request<CatalogIndex>('/api/catalog'),
  book: (id: string) => request<CatalogBook>(`/api/books/${encodeURIComponent(id)}`),
  cart: (token: string) => request<Cart>('/api/cart', {}, token),
  setCartItem: (token: string, olid: string, quantity: number, opId: string) =>
    request<Cart>('/api/cart/items', { method: 'POST', body: JSON.stringify({ olid, quantity, op_id: opId }) }, token),
  removeCartItem: (token: string, olid: string, opId: string) =>
    request<Cart>(`/api/cart/items/${encodeURIComponent(olid)}?op_id=${encodeURIComponent(opId)}`, { method: 'DELETE' }, token),
  forgetTaste: (token: string) => request<void>('/api/profile', { method: 'DELETE' }, token),
}
