import { lazy, Suspense, useEffect, useMemo } from 'react'
import { useRoute } from './lib/router'
import { useSmoothScroll, scrollToTop, ScrollTrigger } from './lib/motion'
import { useStore } from './store/useStore'
import Header from './components/Header'
import Footer from './components/Footer'
import BottomBar from './components/BottomBar'
import Toasts from './components/Toasts'
import Icon from './components/Icon'
import SafeBoundary from './components/SafeBoundary'
import Home from './pages/Home'
import Collection from './pages/Collection'
import Product from './pages/Product'
import Lab from './pages/Lab'
import Track from './pages/Track'
import Wishlist from './pages/Wishlist'
import BagDrawer from './overlays/BagDrawer'
import SearchOverlay from './overlays/SearchOverlay'
import AuthModal from './overlays/AuthModal'
import CheckoutModal from './overlays/CheckoutModal'
import FitFinder from './overlays/FitFinder'
import Concierge from './overlays/Concierge'
import InfoPanel from './overlays/InfoPanel'
import { byId } from './lib/catalog'
import { LITE } from './lib/perf'

const VelvetBackdrop = lazy(() => import('./three/VelvetBackdrop'))
const TryOnOverlay = lazy(() => import('./overlays/TryOnOverlay'))

function FitFallback() {
  const open = useStore((s) => s.open)
  useEffect(() => { open('fit') }, [open])
  return null
}

export default function App() {
  const route = useRoute()
  const overlay = useStore((s) => s.overlay)
  const open = useStore((s) => s.open)
  useSmoothScroll()

  useEffect(() => {
    scrollToTop()
    const p = route.name === 'product' ? byId(route.param ?? '') : null
    const titles: Record<string, string> = { home: 'VÉLOURA Atelier', men: 'Men · VÉLOURA', women: 'Women · VÉLOURA', drops: 'Drops · VÉLOURA', lab: '3D Try-On Lab · VÉLOURA', track: 'Track order · VÉLOURA', wishlist: 'Wishlist · VÉLOURA' }
    document.title = p ? `${p.name} · VÉLOURA` : titles[route.name] ?? 'VÉLOURA Atelier'
    const t = setTimeout(() => ScrollTrigger.refresh(), 300)
    return () => clearTimeout(t)
  }, [route.name, route.param])

  const tone = useMemo(() => {
    if (route.name === 'women') return 1
    if (route.name === 'lab') return 2
    if (route.name === 'drops') return 3
    if (route.name === 'product') { const p = byId(route.param ?? ''); return p?.dept === 'women' ? 1 : p?.dept === 'drops' ? 3 : 0 }
    return 0
  }, [route])

  const page = (() => {
    switch (route.name) {
      case 'men': case 'women': case 'drops': return <Collection key={route.name} dept={route.name} />
      case 'product': return <Product key={route.param} id={route.param ?? ''} />
      case 'lab': return <Lab />
      case 'track': return <Track id={route.param} />
      case 'wishlist': return <Wishlist />
      default: return <Home />
    }
  })()

  return (
    <>
      <button className="skip" onClick={() => { const m = document.getElementById("main"); m?.setAttribute("tabindex", "-1"); m?.focus() }}>Skip to content</button>
      {LITE ? <div className="velvet-backdrop" /> : <SafeBoundary fallback={<div className="velvet-backdrop" />}><Suspense fallback={<div className="velvet-backdrop" />}><VelvetBackdrop tone={tone} /></Suspense></SafeBoundary>}
      <Header route={route} />
      <main id="main" key={route.name + (route.param ?? '')} className="route-enter">{page}</main>
      <Footer />
      <BottomBar route={route} />
      {overlay !== 'concierge' && (
        <button className="fab" onClick={() => open('concierge')} aria-label="Open concierge chat"><Icon name="chat" /><span className="hide-sm">Concierge</span></button>
      )}
      {overlay === 'bag' && <BagDrawer />}
      {overlay === 'search' && <SearchOverlay />}
      {overlay === 'auth' && <AuthModal />}
      {overlay === 'checkout' && <CheckoutModal />}
      {overlay === 'fit' && <FitFinder />}
      {overlay === 'concierge' && <Concierge />}
      {overlay === 'info' && <InfoPanel />}
      {overlay === 'tryon' && <SafeBoundary fallback={<FitFallback />}><Suspense fallback={<div className="shell"><div className="shell__scrim" /></div>}><TryOnOverlay /></Suspense></SafeBoundary>}
      <Toasts />
    </>
  )
}
