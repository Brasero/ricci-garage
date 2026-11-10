import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchAll } from '../../shared/search'
import { db } from '../db'
import { fullName } from '../repo'

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
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par nom, prénom, téléphone…" />
      {list.map((c) => (
        <Link key={c.id} to={`/clients/${c.id}`} className="card clickable">
          <div className="card-main">
            <strong>{fullName(c)}</strong>
            <span className="muted">{c.telephone}</span>
          </div>
        </Link>
      ))}
      {list.length === 0 && <p className="empty">{q ? 'Aucun résultat.' : 'Aucun client enregistré.'}</p>}
    </>
  )
}
