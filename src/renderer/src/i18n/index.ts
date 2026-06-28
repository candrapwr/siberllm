// i18next config. Default language is Indonesian (id); choice is persisted to
// localStorage so the user's last selection is remembered across launches.

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import id from './id'
import en from './en'

const STORAGE_KEY = 'siberllm.lang'

function loadStoredLang(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch {
    /* localStorage may be unavailable (SSR / sandboxed) */
  }
  return 'id' // default
}

export function saveLang(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

export const LANGUAGES = [
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', flag: '🇬🇧' }
] as const

void i18n.use(initReactI18next).init({
  resources: {
    id: { translation: id },
    en: { translation: en }
  },
  lng: loadStoredLang(),
  fallbackLng: 'id',
  interpolation: {
    // React already escapes values, so disable i18next's own escaping.
    escapeValue: false
  }
})

export default i18n
