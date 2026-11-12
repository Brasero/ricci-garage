import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { searchAll, searchInterventions } from '../../shared/search'
import { TIMEZONE } from '../../shared/settings'
import { localDate } from '../../shared/time'
import { ClientCard, EmptyState, VehicleCard, fmtDateTime } from '../components/ui'
import { Icon } from '../components/Icon'
import { db } from '../db'
import { fullName } from '../repo'

export function HomePage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const interventions = useLiveQuery(() => db.interventions.toArray(), [], [])
  const stats = useLiveQuery(
    async () => {
      const today = localDate(Date.now(), TIMEZONE)
      const [rdvs, ech, inters, cl, ve] = await Promise.all([db.rdvs.toArray(), db.echeances.toArray(), db.interventions.toArray(), db.clients.toArray(), db.vehicles.toArray()])
      const okClient = new Set(cl.filter((c) => !c.deletedAt).map((c) => c.id))
      const okCar = new Set(ve.filter((v) => !v.deletedAt && okClient.has(v.clientId)).map((v) => v.id))
      return {
        rdvToday: rdvs.filter((r) => !r.deletedAt && r.statut === 'prevu' && okClient.has(r.clientId) && localDate(r.startAt, TIMEZONE) === today).length,
        overdue: ech.filter((e) => !e.deletedAt && e.statut === 'ouverte' && !!e.dateDue && e.dateDue < today && okCar.has(e.vehicleId)).length,
        open: inters.filter((i) => !i.deletedAt && i.statut !== 'terminee' && okCar.has(i.vehicleId)).length,
      }
    },
    [],
    { rdvToday: 0, overdue: 0, open: 0 },
  )
  const result = useMemo(() => searchAll(q, clients, vehicles), [q, clients, vehicles])
  const iHits = useMemo(() => searchInterventions(q, interventions, vehicles, clients).slice(0, 10), [q, interventions, vehicles, clients])
  const searching = q.trim().length > 0
  const ownerOf = new Map(clients.map((c) => [c.id, c]))

  const recent = useMemo(
    () => vehicles.filter((v) => !v.deletedAt && ownerOf.get(v.clientId) && !ownerOf.get(v.clientId)!.deletedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, clients],
  )
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE })

  return (
    <>
      {!searching && (
        <div className="hello">
          <p className="eyebrow">{dateLabel}</p>
          <h1>Bonjour</h1>
        </div>
      )}
      <div className="search-wrap">
        <Icon name="search" size={20} />
        <input
          className="search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Plaque, marque, modèle, client…"
          aria-label="Recherche globale"
          autoFocus
        />
      </div>

      {searching ? (
        <>
          <h2>Véhicules ({result.vehicles.length})</h2>
          {result.vehicles.map(({ vehicle, owner }) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} owner={owner} onClick={() => nav(`/vehicules/${vehicle.id}`)} />
          ))}
          {result.vehicles.length === 0 && <EmptyState icon="car">Aucun véhicule trouvé.</EmptyState>}
          <h2>Clients ({result.clients.length})</h2>
          {result.clients.map(({ client }) => (
            <ClientCard key={client.id} client={client} to={`/clients/${client.id}`} />
          ))}
          {result.clients.length === 0 && <EmptyState icon="users">Aucun client trouvé.</EmptyState>}
          {iHits.length > 0 && <h2>Interventions ({iHits.length})</h2>}
          {iHits.map(({ intervention: i, vehicle: v, owner: o }) => (
            <Link key={i.id} to={`/interventions/${i.id}`} className="card clickable">
              <span className="avatar av-1" aria-hidden><Icon name="wrench" size={20} /></span>
              <div className="card-main">
                <strong>{v.marque} {v.modele} · {fmtDateTime(i.startAt)}</strong>
                <span className="muted">{fullName(o)} · {i.description || 'Sans description'}</span>
              </div>
              <Icon name="chevron-right" size={18} className="chev" />
            </Link>
          ))}
        </>
      ) : (
        <>
          <div className="stats">
            <Link to="/agenda?vue=jour" className="stat">
              <Icon name="calendar" size={20} className="stat-ico" />
              <b>{stats.rdvToday}</b>
              <span>Rendez-vous aujourd'hui</span>
            </Link>
            <Link to="/agenda" className={`stat${stats.overdue > 0 ? ' hot' : ''}`} aria-label={`${stats.overdue} échéance${stats.overdue > 1 ? 's' : ''} en retard`}>
              <Icon name="alert" size={20} className="stat-ico" />
              <b>{stats.overdue}</b>
              <span>Échéance{stats.overdue > 1 ? 's' : ''} en retard</span>
            </Link>
            <Link to="/interventions" className="stat">
              <Icon name="wrench" size={20} className="stat-ico" />
              <b>{stats.open}</b>
              <span>Intervention{stats.open > 1 ? 's' : ''} à traiter</span>
            </Link>
          </div>

          <div className="tiles">
            <Link className="tile" to="/clients/nouveau"><span className="tile-ico"><Icon name="user-plus" /></span>Nouveau client</Link>
            <Link className="tile" to="/vehicules/nouveau"><span className="tile-ico"><Icon name="car-plus" /></span>Nouveau véhicule</Link>
            <Link className="tile" to="/interventions/nouveau"><span className="tile-ico"><Icon name="wrench" /></span>Nouvelle intervention</Link>
            <Link className="tile" to="/rendez-vous/nouveau"><span className="tile-ico"><Icon name="calendar-plus" /></span>Nouveau rendez-vous</Link>
          </div>

          <h2>Derniers véhicules modifiés</h2>
          {recent.map((v) => (
            <VehicleCard key={v.id} vehicle={v} owner={ownerOf.get(v.clientId)} onClick={() => nav(`/vehicules/${v.id}`)} />
          ))}
          {recent.length === 0 && <EmptyState icon="car">Rien pour l'instant. Commencez par créer un client, puis son véhicule.</EmptyState>}
        </>
      )}
    </>
  )
}
