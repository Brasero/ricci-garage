import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchAll } from '../../shared/search'
import { db } from '../db'
import { VehicleCard } from '../components/ui'

export function VehiclesPage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const owners = new Map(clients.map((c) => [c.id, c]))
  const list = useMemo(() => {
    if (q.trim()) return searchAll(q, clients, vehicles).vehicles.map((h) => h.vehicle)
    return vehicles
      .filter((v) => !v.deletedAt && owners.get(v.clientId) && !owners.get(v.clientId)!.deletedAt)
      .sort((a, b) => a.marque.localeCompare(b.marque, 'fr') || a.modele.localeCompare(b.modele, 'fr'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, clients, vehicles])
  return (
    <>
      <div className="page-head">
        <h1>Véhicules ({list.length})</h1>
        <Link className="btn primary" to="/vehicules/nouveau">
          + Nouveau
        </Link>
      </div>
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plaque, marque, modèle, propriétaire…" />
      {list.map((v) => (
        <VehicleCard key={v.id} vehicle={v} owner={owners.get(v.clientId)} onClick={() => nav(`/vehicules/${v.id}`)} />
      ))}
      {list.length === 0 && <p className="empty">{q ? 'Aucun résultat.' : 'Aucun véhicule enregistré.'}</p>}
    </>
  )
}
