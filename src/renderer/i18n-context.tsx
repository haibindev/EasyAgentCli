import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { Lang, Translations } from './i18n'
import { getLang, setLang as saveLang, getTranslations } from './i18n'

interface I18nContextValue {
  lang: Lang
  t: Translations
  toggleLang: () => void
}

const I18nContext = createContext<I18nContextValue>(null!)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang)

  const toggleLang = useCallback(() => {
    const next: Lang = lang === 'zh' ? 'en' : 'zh'
    setLangState(next)
    saveLang(next)
  }, [lang])

  const t = useMemo(() => getTranslations(lang), [lang])

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
