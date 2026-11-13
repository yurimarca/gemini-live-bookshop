/**
 * E-commerce store: books (from CSV), cart, user, search results.
 * Singleton with subscribe() so React and FunctionExecutor share state.
 */

import type { Book, CartItem, User, OrderComplete } from '../types/book';

const ENRICHED_JSON_URL = '/data/books-enriched.json';
const CSV_URL = '/data/boks.csv';

const RATING_MAP: Record<string, number> = {
  One: 1,
  Two: 2,
  Three: 3,
  Four: 4,
  Five: 5
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function slugFromTitle(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base ? `book-${base}-${index}` : `book-${index}`;
}

let booksCache: Book[] | null = null;

async function loadBooks(): Promise<Book[]> {
  if (booksCache) return booksCache;
  try {
    const res = await fetch(ENRICHED_JSON_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        booksCache = data as Book[];
        return booksCache;
      }
    }
  } catch {
    // Fall through to CSV
  }
  const res = await fetch(CSV_URL);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = lines[0];
  if (!header || !header.toLowerCase().includes('title')) {
    throw new Error('Invalid CSV: expected header with title');
  }
  const books: Book[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 6) continue;
    const [title, priceStr, stock, ratingStr, category, book_url] = parts;
    const price = parseFloat(priceStr?.replace(/[^0-9.]/g, '') || '0') || 0;
    const rating = RATING_MAP[ratingStr?.trim() ?? ''] ?? 0;
    books.push({
      id: slugFromTitle(title ?? '', i),
      title: (title ?? '').replace(/^"|"$/g, ''),
      price,
      stock: stock ?? '',
      rating,
      category: category ?? 'Default',
      book_url: book_url ?? ''
    });
  }
  booksCache = books;
  return books;
}

export function searchBooks(query?: string, category?: string): Promise<Book[]> {
  return loadBooks().then((books) => {
    let out = books;
    if (category && category.trim()) {
      const cat = category.trim();
      out = out.filter(
        (b) => b.category.toLowerCase() === cat.toLowerCase()
      );
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q)
      );
    }
    return out;
  });
}

export function getBookById(id: string): Promise<Book | undefined> {
  return loadBooks().then((books) => books.find((b) => b.id === id));
}

export function getBookByTitle(title: string): Promise<Book | undefined> {
  return loadBooks().then((books) =>
    books.find(
      (b) =>
        b.title.toLowerCase() === title.toLowerCase() ||
        b.title.toLowerCase().includes(title.toLowerCase())
    )
  );
}

export function getCategories(): Promise<string[]> {
  return loadBooks().then((books) => {
    const set = new Set(books.map((b) => b.category));
    return Array.from(set).sort();
  });
}

export function getCatalogStats(): Promise<{ totalBooks: number; categories: string[] }> {
  return loadBooks().then((books) =>
    getCategories().then((categories) => ({
      totalBooks: books.length,
      categories
    }))
  );
}

// --- Cart & session state ---

const USER_STORAGE_KEY = 'bookshop_user';

function parseStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return null;
    const o = data as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const email = typeof o.email === 'string' ? o.email.trim() : '';
    if (!name || !email) return null;
    const address = typeof o.address === 'string' ? o.address.trim() : undefined;
    return { name, email, address: address || undefined };
  } catch {
    return null;
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((cb) => cb());
}

interface CartState {
  items: CartItem[];
  user: User | null;
  orderComplete: OrderComplete | null;
  lastSearchResults: Book[];
  lastSearchQuery: string;
}

let state: CartState = {
  items: [],
  user: parseStoredUser(),
  orderComplete: null,
  lastSearchResults: [],
  lastSearchQuery: ''
};

export function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCart(): CartState['items'] {
  return state.items.slice();
}

export function addToCart(bookId: string, quantity = 1): void {
  const existing = state.items.find((i) => i.bookId === bookId);
  if (existing) {
    state = {
      ...state,
      items: state.items.map((i) =>
        i.bookId === bookId ? { ...i, quantity: i.quantity + quantity } : i
      )
    };
  } else {
    state = { ...state, items: [...state.items, { bookId, quantity }] };
  }
  notify();
}

export function removeFromCart(bookIdOrIndex: string | number): void {
  if (typeof bookIdOrIndex === 'number') {
    const idx = bookIdOrIndex < 1 ? 0 : bookIdOrIndex - 1;
    state = { ...state, items: state.items.filter((_, i) => i !== idx) };
  } else {
    state = { ...state, items: state.items.filter((i) => i.bookId !== bookIdOrIndex) };
  }
  notify();
}

export function clearCart(): void {
  state = { ...state, items: [] };
  notify();
}

export function setUser(user: User | null): void {
  state = { ...state, user };
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }
  notify();
}

export function getUser(): User | null {
  return state.user;
}

export function setLastSearchResults(books: Book[]): void {
  state = { ...state, lastSearchResults: books };
  notify();
}

export function getLastSearchResults(): Book[] {
  return state.lastSearchResults.slice();
}

export function setLastSearchQuery(query: string): void {
  state = { ...state, lastSearchQuery: query };
  notify();
}

export function getLastSearchQuery(): string {
  return state.lastSearchQuery;
}

export function setOrderComplete(order: OrderComplete | null): void {
  state = { ...state, orderComplete: order };
  notify();
}

export function getOrderComplete(): OrderComplete | null {
  return state.orderComplete;
}

export function checkout(): void {
  state = {
    ...state,
    orderComplete: {
      orderId: `ord-${Date.now()}`,
      completedAt: Date.now()
    },
    items: []
  };
  notify();
}

export function getSnapshot(): Readonly<CartState> {
  return state;
}
