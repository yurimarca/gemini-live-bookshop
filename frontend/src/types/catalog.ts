/** Catalog and cart shapes served by the gateway. Mirrors backend/app/catalog/models.py. */

export interface IndexEntry {
  id: string
  title: string
  title_pt: string | null
  author_names: string[]
  category: string
  subjects: string[]
  year: number | null
  languages: string[]
  segments: string[]
  price_cents: number
  rating: number | null
  rating_count: number | null
  popularity: number
  cover_id: number | null
  description: string | null
}

export interface CatalogIndex {
  schema_version: number
  dataset_version: string
  count: number
  license: string
  books: IndexEntry[]
}

export interface CatalogBook {
  id: string
  work_key: string
  title: string
  subtitle: string | null
  title_pt: string | null
  authors: { id: string; name: string }[]
  author_names: string[]
  description: string | null
  subjects: string[]
  category: string
  cover_id: number | null
  first_publish_year: number | null
  languages: string[]
  primary_language: string | null
  segments: string[]
  edition: { isbn_13: string | null; publisher: string | null; pages: number | null; publish_year: number | null } | null
  price_cents: number
  price_is_fictional: true
  rating: { average: number; count: number } | null
  book_url: string
  dataset_version: string
}

export interface CartItem {
  id: string
  title: string
  author: string
  cover_id: number | null
  price_cents: number
  quantity: number
}

export interface Cart {
  items: CartItem[]
  total_cents: number
  hold_expires_at: number | null
}

export const EMPTY_CART: Cart = { items: [], total_cents: 0, hold_expires_at: null }
