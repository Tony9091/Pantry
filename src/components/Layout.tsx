import type { ReactNode } from 'react'
import { Link, usePathname } from '../lib/router'
import { clsx } from '../lib/util'
import { useDb } from '../store/useStore'
import { choresDue, expiringEntries, missingProducts } from '../store/selectors'
import {
  IconBook,
  IconCalendar,
  IconCart,
  IconCheckCircle,
  IconHome,
  IconBox,
  IconList,
  IconPlus,
  IconSettings,
} from './icons'

interface NavItem {
  to: string
  label: string
  icon: (p: { className?: string }) => ReactNode
  /** Count shown as a red pip; 0 hides it. */
  badge?: number
}

function useNavItems(): NavItem[] {
  const db = useDb()
  const expiring = expiringEntries(db).length
  const missing = missingProducts(db).length
  const chores = choresDue(db).length
  const openShopping = db.shoppingItems.filter((i) => !i.done).length

  return [
    { to: '/', label: 'Home', icon: IconHome, badge: expiring },
    { to: '/add', label: 'Add anything', icon: IconPlus },
    { to: '/stock', label: 'Stock', icon: IconBox, badge: missing },
    { to: '/inventory', label: 'Inventory', icon: IconList },
    { to: '/shopping', label: 'Shopping', icon: IconCart, badge: openShopping },
    { to: '/recipes', label: 'Recipes', icon: IconBook },
    { to: '/plan', label: 'Plan', icon: IconCalendar },
    { to: '/chores', label: 'Chores', icon: IconCheckCircle, badge: chores },
  ]
}

/** A tab is active for its own route and everything nested under it. */
function isActive(route: string, to: string): boolean {
  if (to === '/') return route === '/'
  return route === to || route.startsWith(`${to}/`)
}

export function Sidebar() {
  const route = usePathname()
  const items = useNavItems()
  const db = useDb()

  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <IconCart />
        </div>
        <div className="brand-text">
          <strong>Pantry</strong>
          <span>{db.settings.householdName}</span>
        </div>
      </div>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Link key={item.to} to={item.to} className={clsx(isActive(route, item.to) && 'active')}>
            <Icon />
            <span>{item.label}</span>
            {item.badge ? <span className="tab-badge">{item.badge}</span> : null}
          </Link>
        )
      })}
      <div className="spacer" />
      <Link to="/settings" className={clsx(isActive(route, '/settings') && 'active')}>
        <IconSettings />
        <span>Settings</span>
      </Link>
    </nav>
  )
}

export function TabBar() {
  const route = usePathname()
  const all = useNavItems()
  const pick = (to: string) => all.find((i) => i.to === to)!

  // Add sits dead centre, under the thumb — it's the thing everyone in the
  // house uses most, so it gets the biggest target on the screen.
  const left = [pick('/'), pick('/stock')]
  const right = [pick('/shopping'), pick('/recipes')]

  const tab = (item: NavItem) => {
    const Icon = item.icon
    return (
      <Link key={item.to} to={item.to} className={clsx(isActive(route, item.to) && 'active')}>
        <Icon />
        <span>{item.label}</span>
        {item.badge ? (
          <span className="tab-badge">{item.badge > 99 ? '99+' : item.badge}</span>
        ) : null}
      </Link>
    )
  }

  return (
    <nav className="tabbar has-add">
      {left.map(tab)}
      <Link
        to="/add"
        className={clsx('tab-add', isActive(route, '/add') && 'active')}
        aria-label="Add anything"
      >
        <span className="tab-add-btn">
          <IconPlus />
        </span>
        <span>Add</span>
      </Link>
      {right.map(tab)}
    </nav>
  )
}

export function TopBar({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <header className="topbar">
      {back}
      <h1>
        {title}
        {subtitle && (
          <>
            <br />
            <span className="sub">{subtitle}</span>
          </>
        )}
      </h1>
      {actions}
    </header>
  )
}
