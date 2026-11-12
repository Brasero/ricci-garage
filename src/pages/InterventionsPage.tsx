import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEuros, computeTotals } from '../../shared/money'
import { searchInterventions } from '../../shared/search'
import { STATUTS, type Statut } from '../../shared/types'
import { DateBox, EmptyState, StatusBadge } from '../components/ui'
import { Icon } from '../components/Icon'
import { db } from '../db'
import { fullName } from '../repo'

export function InterventionsPage() {
  const [q, setQ] = useState('')
  const [statut, setStatut] = useState<'' | Statut>('')
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const interventions = useLiveQuery(() => db.interventions.toArray(), [], [])

  const list = useMemo(() => {
    const owners = new Map(clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
    const cars = new Map(vehicles.filter((v) => !v.deletedAt).map((v) => [v.id, v]))
    const rows = q.trim()
      ? searchInterventions(q, interventions, vehicles, clients).map((h) => ({ i: h.intervention, v: h.vehicle, o: h.owner }))
      : interventions
          .filter((i) => !i.deletedAt)
          .map((i) => ({ i, v: cars.get(i.vehicleId), o: cars.get(i.vehicleId) && owners.get(cars.get(i.vehicleId)!.clientId) }))
          .filter((r): r is { i: typeof r.i; v: NonNullable<typeof r.v>; o: NonNullable<typeof r.o> } => !!r.v && !!r.o)
          .sort((a, b) => b.i.startAt - a.i.startAt)
    return statut ? rows.filter((r) => r.i.statut === statut) : rows
  }, [q, statut, clients, vehicles, interventions])

  return (
    <>
      <div className="page-head">
        <h1>Interventions ({list.length})</h1>
        <Link className="btn primary" to="/interventions/nouveau">+ Nouvelle</Link>
      </div>
      <div className="search-wrap">
        <Icon name="search" size={20} />
        <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plaque, propriétaire, pièce, travaux…" />
      </div>
      <div className="segmented scroll" style={{ marginBottom: 14 }}>
        {([['', 'Toutes'], ...STATUTS] as const).map(([v, l]) => (
          <button key={v} type="button" className={statut === v ? 'on' : ''} onClick={() => setStatut(v as '' | Statut)}>{l}</button>
        ))}
      </div>
      {list.map(({ i, v, o }) => (
        <Link key={i.id} to={`/interventions/${i.id}`} className="card clickable">
          <DateBox ms={i.startAt} />
          <div className="card-main">
            <strong>{v.marque} {v.modele} · {v.plate}</strong>
            <span className="muted">{fullName(o)} · {i.description || 'Sans description'}</span>
          </div>
          <div className="side">
            <StatusBadge statut={i.statut} />
            <span>{formatEuros(computeTotals(i.pieces, i.mainOeuvreCts).totalCts)}</span>
          </div>
        </Link>
      ))}
      {list.length === 0 && <EmptyState icon="wrench">{q || statut ? 'Aucun résultat.' : 'Aucune intervention enregistrée.'}</EmptyState>}
    </>
  )
}
