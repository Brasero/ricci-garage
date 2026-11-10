import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { fmtDateTime } from '../components/ui'
import { echeanceName } from './AgendaPage'
import { fullName, restoreClient, setEcheanceArchived, setInterventionArchived, setRdvArchived, setVehicleArchived } from '../repo'

export function TrashPage() {
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const interventions = useLiveQuery(() => db.interventions.toArray(), [], [])
  const byId = new Map(clients.map((c) => [c.id, c]))
  const rdvs = useLiveQuery(() => db.rdvs.toArray(), [], [])
  const echeances = useLiveQuery(() => db.echeances.toArray(), [], [])
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const archivedRdvs = rdvs.filter((r) => r.deletedAt && byId.get(r.clientId) && !byId.get(r.clientId)!.deletedAt)
  const archivedEcheances = echeances.filter((e) => e.deletedAt && vById.get(e.vehicleId) && !vById.get(e.vehicleId)!.deletedAt)
  const archivedInterventions = interventions.filter((i) => i.deletedAt && vById.get(i.vehicleId) && !vById.get(i.vehicleId)!.deletedAt)
  const archivedClients = clients.filter((c) => c.deletedAt)
  // Un véhicule archivé avec son client se restaure avec lui : on ne liste que les autres.
  const archivedVehicles = vehicles.filter((v) => v.deletedAt && byId.get(v.clientId) && !byId.get(v.clientId)!.deletedAt)
  return (
    <>
      <h1>Corbeille</h1>
      <h2>Clients ({archivedClients.length})</h2>
      {archivedClients.map((c) => (
        <div className="card" key={c.id}>
          <div className="card-main">
            <strong>{fullName(c)}</strong>
            <span className="muted">Archivé le {new Date(c.deletedAt!).toLocaleDateString('fr-FR')} · restaure aussi ses véhicules</span>
          </div>
          <button className="btn" onClick={() => restoreClient(c.id)}>Restaurer</button>
        </div>
      ))}
      {archivedClients.length === 0 && <p className="empty">Aucun client archivé.</p>}
      <h2>Véhicules ({archivedVehicles.length})</h2>
      {archivedVehicles.map((v) => (
        <div className="card" key={v.id}>
          <div className="card-main">
            <strong>{v.marque} {v.modele} · {v.plate}</strong>
            <span className="muted">{fullName(byId.get(v.clientId))}</span>
          </div>
          <button className="btn" onClick={() => setVehicleArchived(v.id, false)}>Restaurer</button>
        </div>
      ))}
      {archivedVehicles.length === 0 && <p className="empty">Aucun véhicule archivé.</p>}
      <h2>Interventions ({archivedInterventions.length})</h2>
      {archivedInterventions.map((i) => (
        <div className="card" key={i.id}>
          <div className="card-main">
            <strong>{vById.get(i.vehicleId)!.marque} {vById.get(i.vehicleId)!.modele} · {fmtDateTime(i.startAt)}</strong>
            <span className="muted">{i.description || 'Sans description'}</span>
          </div>
          <button className="btn" onClick={() => setInterventionArchived(i.id, false)}>Restaurer</button>
        </div>
      ))}
      {archivedInterventions.length === 0 && <p className="empty">Aucune intervention archivée.</p>}
      <h2>Rendez-vous ({archivedRdvs.length})</h2>
      {archivedRdvs.map((r) => (
        <div className="card" key={r.id}>
          <div className="card-main">
            <strong>{fmtDateTime(r.startAt)} · {fullName(byId.get(r.clientId))}</strong>
            <span className="muted">{r.motif || 'Sans motif'}</span>
          </div>
          <button className="btn" onClick={() => setRdvArchived(r.id, false)}>Restaurer</button>
        </div>
      ))}
      {archivedRdvs.length === 0 && <p className="empty">Aucun rendez-vous archivé.</p>}
      <h2>Échéances ({archivedEcheances.length})</h2>
      {archivedEcheances.map((e) => (
        <div className="card" key={e.id}>
          <div className="card-main">
            <strong>{echeanceName(e)}</strong>
            <span className="muted">{vById.get(e.vehicleId)!.marque} {vById.get(e.vehicleId)!.modele} · {vById.get(e.vehicleId)!.plate}</span>
          </div>
          <button className="btn" onClick={() => setEcheanceArchived(e.id, false)}>Restaurer</button>
        </div>
      ))}
      {archivedEcheances.length === 0 && <p className="empty">Aucune échéance archivée.</p>}
    </>
  )
}
