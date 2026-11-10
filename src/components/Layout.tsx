import { useLiveQuery } from 'dexie-react-hooks'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { db } from '../db'
import { useSyncState } from '../sync'

function SyncBadge() {
  const { status } = useSyncState()
  const pending = useLiveQuery(
    async () =>
      (await db.clients.where('dirty').equals(1).count()) +
      (await db.vehicles.where('dirty').equals(1).count()) +
      (await db.interventions.where('dirty').equals(1).count()) +
      (await db.photos.where('dirty').equals(1).or('uploaded').equals(0).count()),
    [],
    0,
  )
  const waiting = pending > 0 ? ` · ${pending} en attente` : ''
  if (status === 'unauthorized')
    return (
      <Link to="/connexion" className="badge warn">
        Connexion requise{waiting}
      </Link>
    )
  if (status === 'offline') return <span className="badge warn">Hors connexion{waiting}</span>
  if (status === 'error') return <span className="badge bad">Erreur de synchro{waiting}</span>
  if (status === 'syncing') return <span className="badge">Synchronisation…</span>
  return <span className={pending ? 'badge warn' : 'badge ok'}>{pending ? `${pending} en attente` : 'À jour'}</span>
}

const NAV = [
  { to: '/', label: 'Recherche', icon: '🔍', end: true },
  { to: '/clients', label: 'Clients', icon: '👤' },
  { to: '/vehicules', label: 'Véhicules', icon: '🚗' },
  { to: '/interventions', label: 'Interventions', icon: '🔧' },
  { to: '/parametres', label: 'Réglages', icon: '⚙️' },
]

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          Ricci Garage
        </Link>
        <SyncBadge />
      </header>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span aria-hidden>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
