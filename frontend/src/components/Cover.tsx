import { useState } from 'react'
import { coverUrl } from '../lib/format'

/**
 * A cover hotlinked from covers.openlibrary.org by cover ID, in a fixed 2:3 box so the grid
 * never jumps. A missing cover shows a typographic placeholder made from the title.
 */
export function Cover({ coverId, title, size = 'M', eager = false }: { coverId: number | null; title: string; size?: 'S' | 'M' | 'L'; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  const url = failed ? null : coverUrl(coverId, size)
  return (
    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-mist-100 ring-1 ring-mist-900/10">
      {url ? (
        <img src={url} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-mist-100 to-mist-200 p-3 text-center">
          <span className="line-clamp-4 font-display text-sm font-semibold leading-tight text-mist-700">{title}</span>
        </div>
      )}
    </div>
  )
}
