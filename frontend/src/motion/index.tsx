/**
 * Motion for "follow the agent": cards entering, surfaces updating, timeline rows, transcript lines,
 * the cart badge and route changes. The only module that imports framer-motion.
 *
 * Components use the small `m` element; the animation features load in their own chunk after first
 * paint (LazyMotion). `MotionConfig reducedMotion="user"` turns transforms off for visitors who ask
 * for reduced motion; fades remain. Nothing here moves focus, and every movement is a transform or
 * an overlay, so no animation shifts the layout under the pointer.
 */
import { AnimatePresence, LazyMotion, MotionConfig, m, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

const loadFeatures = () => import('./features').then((mod) => mod.default)

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>{children}</LazyMotion>
    </MotionConfig>
  )
}

/** Fade and rise, 200 ms: a new card, row or line. */
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
} as const

/**
 * A ring that fades out over its parent (which must be `relative`): "this just changed".
 * Change `flashKey` to replay it. It is an overlay, so the content does not re-enter or move.
 */
export function Flash({ flashKey, className = 'inset-0 rounded-xl' }: { flashKey: string | number; className?: string }) {
  return (
    <m.span key={flashKey} aria-hidden initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.4, ease: 'easeIn' }}
      className={`pointer-events-none absolute ring-2 ring-brand-coral ${className}`} />
  )
}

export { AnimatePresence, m, useReducedMotion }
