import { byId } from '../lib/catalog'
import { useStore } from '../store/useStore'
import ProductCard from '../components/ProductCard'

export default function Wishlist() {
  const ids = useStore((s) => s.wishlist)
  const list = ids.map(byId).filter(Boolean)
  return (
    <div className="page page--wish wrap">
      <p className="eyebrow">{list.length} saved</p>
      <h1 className="display display--xl">Your <em>wishlist</em></h1>
      {list.length ? <div className="grid grid--3 section--tight">{list.map((p) => <ProductCard key={p!.id} p={p!} />)}</div> : (
        <div className="empty"><p className="empty__title">Nothing saved yet</p><p className="dim">Tap the heart on any piece to keep it here. We'll tell you if it's running low.</p><a className="btn btn--primary" href="#men">Browse the collection</a></div>
      )}
    </div>
  )
}
