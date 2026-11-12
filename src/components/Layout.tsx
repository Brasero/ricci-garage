import { useLiveQuery } from 'dexie-react-hooks'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { countPending } from '../db'
import { Icon, Logo } from './Icon'
import { useSyncState } from '../sync'

function SyncBadge() {
  const { status } = useSyncState()
  const pending = useLiveQuery(countPending, [], 0)
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
  { to: '/', label: 'Recherche', icon: 'search', end: true },
  { to: '/clients', label: 'Clients', icon: 'users' },
  { to: '/vehicules', label: 'Véhicules', icon: 'car' },
  { to: '/interventions', label: 'Interventions', icon: 'wrench' },
  { to: '/agenda', label: 'Agenda', icon: 'calendar' },
  { to: '/parametres', label: 'Réglages', icon: 'sliders' },
] as const

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo size={34} />
          <span>Mitch depann</span>
        </Link>
        <SyncBadge />
      </header>
      <nav className="nav" aria-label="Navigation principale">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="nav-ico">
              <Icon name={n.icon} size={22} />
            </span>
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
