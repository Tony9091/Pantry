/** A ~50-line hash router. Hash routing means the built app can be opened
 *  from any static host — or even a file:// path — with no rewrite rules. */

import { useCallback, useEffect, useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, '')
  return hash || '/'
}

/** The active route path, e.g. "/stock" or "/recipes/rec_123". */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/')
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`
  if (opts.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function back() {
  window.history.back()
}

/** The route without its query string, e.g. "/stock" for "/stock?filter=soon". */
export function usePathname(): string {
  return useRoute().split('?')[0]
}

/** Query params of the current route. */
export function useQuery(): URLSearchParams {
  const route = useRoute()
  return new URLSearchParams(route.split('?')[1] ?? '')
}

/** Splits "/recipes/rec_1" into ["recipes", "rec_1"]. */
export function useRouteSegments(): string[] {
  return usePathname().split('/').filter(Boolean)
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
}

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e)
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault()
      navigate(to)
    },
    [to, onClick],
  )
  return <a href={`#${to}`} onClick={handle} {...rest} />
}

/** Returns the window to the top whenever the route changes, so deep pages
 *  don't open halfway down. */
export function useScrollTopOnNavigate() {
  const route = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
}
