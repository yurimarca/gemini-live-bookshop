import { useT } from '../i18n'

export function AboutPage() {
  const t = useT()
  return (
    <article className="max-w-prose">
      <h1 className="font-display text-2xl font-bold">{t.aboutTitle}</h1>
      {t.aboutBody.map((paragraph) => <p key={paragraph.slice(0, 24)} className="mt-3 text-sm leading-relaxed text-mist-900">{paragraph}</p>)}
      <h2 className="mt-6 font-display text-lg font-semibold">{t.aboutHow}</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-mist-900">
        {t.aboutHowItems.map((item) => <li key={item.slice(0, 24)}>{item}</li>)}
      </ul>
      <p className="mt-6 text-sm leading-relaxed text-mist-700">
        {t.aboutData}{' '}
        <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" className="text-brand-red underline underline-offset-2">openlibrary.org</a>
      </p>
    </article>
  )
}
