import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { setNavigator } from '../lib/nav'
import { m } from '../motion'
import { AgentCanvas } from './AgentCanvas'
import { CartDrawer } from './CartDrawer'
import { DesktopDock, MobileDock } from './ConversationDock'
import { Header } from './Header'

/**
 * Route changes fade in. Keyed by path, so a filter change on the catalog does not replay it.
 * The first page renders as is: animating it in would only delay first paint.
 */
function RouteFade() {
  const { pathname } = useLocation()
  const mounted = useRef(false)
  const animate = mounted.current
  useEffect(() => { mounted.current = true }, [])
  return (
    <m.div key={pathname} initial={animate ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
      <Outlet />
    </m.div>
  )
}

function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)'
  const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return matches
}

/** Header, the page with the agent canvas above it, and the conversation dock (a column or a bottom sheet). */
export function Layout() {
  const navigate = useNavigate()
  const desktop = useIsDesktop()
  useEffect(() => {
    setNavigator((path) => navigate(path))
    return () => setNavigator(null)
  }, [navigate])

  return (
    <div className="min-h-screen bg-mist-50 text-mist-900">
      <Header />
      <div className="mx-auto flex max-w-[1400px]">
        <main className="min-w-0 flex-1 px-4 pb-44 pt-4 lg:pb-10">
          {/* One canvas at a time: each A2UI surface is mounted in exactly one place. */}
          {desktop ? <div className="mb-5"><AgentCanvas /></div> : null}
          <RouteFade />
        </main>
        {desktop ? <DesktopDock /> : null}
      </div>
      {desktop ? null : <MobileDock />}
      <CartDrawer />
    </div>
  )
}
