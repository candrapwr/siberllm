import { useTranslation } from 'react-i18next'
import { LANGUAGES, saveLang } from '../i18n'
import { cn } from '../lib/utils'

/** A compact language picker shown in the sidebar. */
export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const current = i18n.language

  const change = (code: string): void => {
    void i18n.changeLanguage(code)
    saveLang(code)
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          onClick={() => change(l.code)}
          title={l.label}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
            current === l.code
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="text-sm">{l.flag}</span>
          <span className="hidden lg:inline">{l.code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}
