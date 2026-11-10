import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchAll, searchInterventions } from '../../shared/search'
import { TIMEZONE } from '../../shared/settings'
import { localDate } from '../../shared/time'
import { db } from '../db'
import { fullName } from '../repo'
import { VehicleCard, fmtDateTime } from '../components/ui'

export function HomePage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const interventions = useLiveQuery(() => db.interventions.toArray(), [], [])
  const overdue = useLiveQuery(async () => {
    const today = localDate(Date.now(), TIMEZONE)
    return db.echeances.filter((e) => !e.deletedAt && e.statut === 'ouverte' && !!e.dateDue && e.dateDue < today).count()
  }, [], 0)
  const result = useMemo(() => searchAll(q, clients, vehicles), [q, clients, vehicles])
  const iHits = useMemo(() => searchInterventions(q, interventions, vehicles, clients).slice(0, 10), [q, interventions, vehicles, clients])
  const searching = q.trim().length > 0
  const ownerOf = new Map(clients.map((c) => [c.id, c]))

  const recent = useMemo(
    () => vehicles.filter((v) => !v.deletedAt && ownerOf.get(v.clientId) && !ownerOf.get(v.clientId)!.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, clients],
  )

  return (
    <>
      <input
        className="search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Plaque, marque, modèle, nom du propriétaire…"
        aria-label="Recherche globale"
        autoFocus
      />
      {!searching && overdue > 0 && (
        <Link to="/agenda" className="warning banner" role="alert">⏰ {overdue} échéance{overdue > 1 ? 's' : ''} en retard — voir l'agenda</Link>
      )}
      {!searching && (
        <div className="actions">
          <Link className="btn primary" to="/clients/nouveau">
            + Nouveau client
          </Link>
          <Link className="btn" to="/vehicules/nouveau">
            + Nouveau véhicule
          </Link>
        </div>
      )}

      {searching ? (
        <>
          <h2>Véhicules ({result.vehicles.length})</h2>
          {result.vehicles.map(({ vehicle, owner }) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} owner={owner} onClick={() => nav(`/vehicules/${vehicle.id}`)} />
          ))}
          {result.vehicles.length === 0 && <p className="empty">Aucun véhicule trouvé.</p>}
          <h2>Clients ({result.clients.length})</h2>
          {result.clients.map(({ client }) => (
            <Link key={client.id} to={`/clients/${client.id}`} className="card clickable">
              <div className="card-main">
                <strong>{fullName(client)}</strong>
                <span className="muted">{client.telephone}</span>
              </div>
            </Link>
          ))}
          {result.clients.length === 0 && <p className="empty">Aucun client trouvé.</p>}
          {iHits.length > 0 && <h2>Interventions ({iHits.length})</h2>}
          {iHits.map(({ intervention: i, vehicle: v, owner: o }) => (
            <Link key={i.id} to={`/interventions/${i.id}`} className="card clickable">
              <div className="card-main">
                <strong>{v.marque} {v.modele} · {fmtDateTime(i.startAt)}</strong>
                <span className="muted">{fullName(o)} · {i.description || 'Sans description'}</span>
              </div>
            </Link>
          ))}
        </>
      ) : (
        <>
          <h2>Derniers véhicules modifiés</h2>
          {recent.map((v) => (
            <VehicleCard key={v.id} vehicle={v} owner={ownerOf.get(v.clientId)} onClick={() => nav(`/vehicules/${v.id}`)} />
          ))}
          {recent.length === 0 && <p className="empty">Rien pour l'instant. Commencez par créer un client, puis son véhicule.</p>}
        </>
      )}
    </>
  )
}
