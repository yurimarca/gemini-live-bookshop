import { createStore, useStore } from '../lib/store'
import type { Locale } from '../protocol/events'
import { STRINGS, type Strings } from './strings'

const KEY = 'bookshop.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'pt-BR') return saved
  } catch { /* storage may be unavailable */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en'
}

export const localeStore = createStore<Locale>(initialLocale())

export function setLocale(locale: Locale): void {
  localeStore.set(locale)
  try { localStorage.setItem(KEY, locale) } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

export function useLocale(): Locale {
  return useStore(localeStore)
}

/** UI strings for the current locale. */
export function useT(): Strings {
  return STRINGS[useStore(localeStore)]
}

export function t(): Strings {
  return STRINGS[localeStore.get()]
}
