import { useEffect, useState } from 'react'
import { useRouteSegments, useScrollTopOnNavigate } from './lib/router'
import { useDb } from './store/useStore'
import { Sidebar, TabBar } from './components/Layout'
import { ToastProvider } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { ProductDetailPage, StockPage } from './pages/Stock'
import { ShoppingPage } from './pages/Shopping'
import { InventoryPage } from './pages/Inventory'
import { QuickAddPage } from './pages/QuickAdd'
import { RecipeDetailPage, RecipesPage } from './pages/Recipes'
import { MealPlanPage } from './pages/MealPlan'
import { ChoresPage } from './pages/Chores'
import { SettingsPage } from './pages/Settings'

/** Applies the saved theme to <html> so CSS variables pick it up, and keeps
 *  the browser chrome colour in step. */
function useTheme() {
  const theme = useDb().settings.theme

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
    }

    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}

/** Tracks connectivity so the app can say so, rather than looking broken. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** A quiet reassurance, not an error: everything still works. */
function OfflineNotice() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="offline-pill" role="status">
      <span className="dot" />
      Offline — everything still works
    </div>
  )
}

function Routes() {
  const segments = useRouteSegments()
  const [head, param] = segments

  switch (head) {
    case undefined:
      return <Dashboard />
    case 'stock':
      return param ? <ProductDetailPage productId={param} /> : <StockPage />
    case 'shopping':
      return <ShoppingPage />
    case 'inventory':
      return <InventoryPage />
    case 'add':
      return <QuickAddPage />
    case 'recipes':
      return param ? <RecipeDetailPage recipeId={param} /> : <RecipesPage />
    case 'plan':
      return <MealPlanPage />
    case 'chores':
      return <ChoresPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <Dashboard />
  }
}

export default function App() {
  useTheme()
  useScrollTopOnNavigate()

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar />
        <div className="content">
          <Routes />
        </div>
        <OfflineNotice />
        <TabBar />
      </div>
    </ToastProvider>
  )
}
