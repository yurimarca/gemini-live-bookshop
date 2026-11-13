/**
 * The bookshop A2UI catalog: the only components an agent can put on screen.
 * There is no Modal, Video, AudioPlayer, TextField or free-form markup here, so a card can
 * never steal focus, play media or collect input. Styling belongs to the host (A2UI v1.0
 * removed theme properties), which is why these are plain React components.
 */
import { Catalog, CommonSchemas } from '@a2ui/web_core/v1_0'
import { createComponentImplementation } from '@a2ui/react'
import { X } from 'lucide-react'
import { z } from 'zod'
import { Cover } from '../components/Cover'
import { useT, useLocale } from '../i18n'
import { formatClock, formatPrice, LANGUAGE_NAMES } from '../lib/format'
import { useNow } from '../lib/useNow'

export const CATALOG_ID = 'urn:bookshop:catalog:v1'
export const A2UI_VERSION = '1.0'

type Run = (() => unknown) | undefined
const run = (fn: Run) => () => { void fn?.() }

function CardFrame(props: { title: string; agent: string; onDismiss: Run; children: React.ReactNode }) {
  const t = useT()
  return (
    <section className="rounded-xl border border-mist-900/10 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold text-mist-900">{props.title}</h3>
          <p className="text-[11px] uppercase tracking-wide text-mist-600">{props.agent}</p>
        </div>
        <button type="button" onClick={run(props.onDismiss)} aria-label={t.dismiss}
          className="rounded p-1 text-mist-600 hover:bg-mist-900/5 hover:text-mist-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
      <div className="p-3">{props.children}</div>
    </section>
  )
}

/** Always renders the fictional-price label next to a price; an agent cannot show a bare price. */
export function DemoPriceTag({ cents }: { cents: number }) {
  const t = useT()
  const locale = useLocale()
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-semibold text-mist-900">{formatPrice(cents, locale)}</span>
      <span className="text-[10px] uppercase tracking-wide text-mist-600">{t.demoPrice}</span>
    </span>
  )
}

const DemoPrice = createComponentImplementation(
  { name: 'DemoPrice', schema: z.object({ priceCents: CommonSchemas.DynamicNumber }).strict() },
  ({ props }) => <DemoPriceTag cents={Number(props.priceCents) || 0} />,
)

const BookShelf = createComponentImplementation(
  {
    name: 'BookShelf',
    schema: z.object({
      title: CommonSchemas.DynamicString, subtitle: CommonSchemas.DynamicString.optional(),
      children: CommonSchemas.ChildList, onDismiss: CommonSchemas.Action.optional(),
    }).strict(),
  },
  ({ props, buildChild }) => (
    <CardFrame title={String(props.title ?? '')} agent={String(props.subtitle ?? '')} onDismiss={props.onDismiss as Run}>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {(props.children ?? []).map((child, i) => (
          <li key={typeof child === 'string' ? child : `${child.id}:${child.basePath ?? i}`} className="w-36 shrink-0">
            {typeof child === 'string' ? buildChild(child) : buildChild(child.id, child.basePath)}
          </li>
        ))}
      </ul>
    </CardFrame>
  ),
)

const BookCard = createComponentImplementation(
  {
    name: 'BookCard',
    schema: z.object({
      bookId: CommonSchemas.DynamicString, title: CommonSchemas.DynamicString, author: CommonSchemas.DynamicString,
      coverId: CommonSchemas.DynamicNumber.optional(), priceCents: CommonSchemas.DynamicNumber,
      reason: CommonSchemas.DynamicString.optional(),
      onAdd: CommonSchemas.Action.optional(), onOpen: CommonSchemas.Action.optional(),
    }).strict(),
  },
  ({ props }) => {
    const t = useT()
    const title = String(props.title ?? '')
    return (
      <article className="flex h-full flex-col gap-1.5 text-left">
        <button type="button" onClick={run(props.onOpen as Run)} className="group text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-coral">
          <Cover coverId={Number(props.coverId) || null} title={title} size="M" />
          <span className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-mist-900 group-hover:text-brand-red">{title}</span>
        </button>
        <span className="truncate text-xs text-mist-700">{String(props.author ?? '')}</span>
        {props.reason ? <p className="line-clamp-3 text-xs italic text-mist-700">{String(props.reason)}</p> : null}
        <div className="mt-auto flex flex-col gap-1.5 pt-1">
          <DemoPriceTag cents={Number(props.priceCents) || 0} />
          <button type="button" onClick={run(props.onAdd as Run)}
            className="rounded-md bg-brand-red px-2 py-1 text-xs font-medium text-white hover:bg-brand-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red">
            {t.addToCart}
          </button>
        </div>
      </article>
    )
  },
)

function Chips({ label, items, tone }: { label: string; items: string[]; tone: 'like' | 'avoid' | 'plain' }) {
  if (items.length === 0) return null
  const color = tone === 'like' ? 'bg-success-light text-success-foreground' : tone === 'avoid' ? 'bg-error-light text-error-foreground' : 'bg-mist-100 text-mist-700'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-mist-600">{label}</span>
      {items.map((item) => <span key={item} className={`rounded-full px-2 py-0.5 text-xs ${color}`}>{item}</span>)}
    </div>
  )
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

const TasteProfile = createComponentImplementation(
  {
    name: 'TasteProfile',
    schema: z.object({
      summary: CommonSchemas.DynamicString, likes: CommonSchemas.DynamicStringList, dislikes: CommonSchemas.DynamicStringList,
      languages: CommonSchemas.DynamicStringList, onDismiss: CommonSchemas.Action.optional(),
    }).strict(),
  },
  ({ props }) => {
    const t = useT()
    const locale = useLocale()
    const languages = strings(props.languages).map((code) => LANGUAGE_NAMES[code]?.[locale] ?? code)
    return (
      <CardFrame title={t.tasteTitle} agent={t.agent_taste_profiler} onDismiss={props.onDismiss as Run}>
        <p className="mb-2 text-sm text-mist-900">{String(props.summary ?? '')}</p>
        <div className="flex flex-col gap-1.5">
          <Chips label={t.tasteLikes} items={strings(props.likes)} tone="like" />
          <Chips label={t.tasteAvoids} items={strings(props.dislikes)} tone="avoid" />
          <Chips label={t.tasteReads} items={languages} tone="plain" />
        </div>
      </CardFrame>
    )
  },
)

const CartHold = createComponentImplementation(
  {
    name: 'CartHold',
    schema: z.object({
      expiresAt: CommonSchemas.DynamicNumber, itemCount: CommonSchemas.DynamicNumber, totalCents: CommonSchemas.DynamicNumber,
      expired: CommonSchemas.DynamicBoolean, onDismiss: CommonSchemas.Action.optional(),
    }).strict(),
  },
  ({ props }) => {
    const t = useT()
    const now = useNow(1000)
    const secondsLeft = Math.max(0, Number(props.expiresAt) - now / 1000)
    const count = Number(props.itemCount) || 0
    return (
      <CardFrame title={t.holdTitle} agent={t.agent_cart_timer} onDismiss={props.onDismiss as Run}>
        {props.expired || count === 0 ? (
          <p className="text-sm text-mist-700">{props.expired ? t.cartHoldExpired : t.cartEmpty}</p>
        ) : (
          <div className="flex items-end justify-between gap-3">
            <p className="font-display text-2xl font-bold tabular-nums text-mist-900" role="timer" aria-live="off">
              {formatClock(secondsLeft)} <span className="text-xs font-normal text-mist-600">{t.holdLeft}</span>
            </p>
            <p className="text-right text-xs text-mist-700">{t.holdItems(count)}<br /><DemoPriceTag cents={Number(props.totalCents) || 0} /></p>
          </div>
        )}
      </CardFrame>
    )
  },
)

export const bookshopCatalog = new Catalog(CATALOG_ID, A2UI_VERSION, [BookShelf, BookCard, TasteProfile, CartHold, DemoPrice], [])
