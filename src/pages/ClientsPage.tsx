import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchAll } from '../../shared/search'
import { db } from '../db'
import { ClientCard, EmptyState } from '../components/ui'
import { Icon } from '../components/Icon'

export function ClientsPage() {
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.filter((c) => !c.deletedAt).toArray(), [], [])
  const list = useMemo(() => {
    if (q.trim()) return searchAll(q, clients, []).clients.map((h) => h.client)
    return [...clients].sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'))
  }, [q, clients])
  return (
    <>
      <div className="page-head">
        <h1>Clients ({clients.length})</h1>
        <Link className="btn primary" to="/clients/nouveau">
          + Nouveau
        </Link>
      </div>
      <div className="search-wrap">
        <Icon name="search" size={20} />
        <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les clients…" />
      </div>
      {list.map((c) => (
        <ClientCard key={c.id} client={c} to={`/clients/${c.id}`} />
      ))}
      {list.length === 0 && <EmptyState icon="users">{q ? 'Aucun résultat.' : 'Aucun client enregistré.'}</EmptyState>}
    </>
  )
}
