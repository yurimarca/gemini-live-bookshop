import type { Locale } from '../protocol/events'

/**
 * Prices are fictional: the same number is labelled dollars in English and reais in Portuguese,
 * never converted. 1290 cents is $12.90 or R$ 12,90.
 */
export function formatPrice(cents: number, locale: Locale): string {
  const [tag, currency] = locale === 'pt-BR' ? ['pt-BR', 'BRL'] : ['en-US', 'USD']
  return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(cents / 100)
}

/**
 * Covers are hotlinked by cover ID, the lookup the Covers API does not rate-limit.
 * `default=false` asks for a 404 instead of a blank image when the cover is missing.
 */
export function coverUrl(coverId: number | null | undefined, size: 'S' | 'M' | 'L' = 'M'): string | null {
  return coverId && coverId > 0 ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg?default=false` : null
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

export const LANGUAGE_NAMES: Record<string, { en: string; 'pt-BR': string; short: string }> = {
  eng: { en: 'English', 'pt-BR': 'Inglês', short: 'EN' },
  por: { en: 'Portuguese', 'pt-BR': 'Português', short: 'PT' },
  spa: { en: 'Spanish', 'pt-BR': 'Espanhol', short: 'ES' },
  fre: { en: 'French', 'pt-BR': 'Francês', short: 'FR' },
}

export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function newId(prefix = 'op'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}
