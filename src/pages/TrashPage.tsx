import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { fullName, restoreClient, setVehicleArchived } from '../repo'

export function TrashPage() {
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const byId = new Map(clients.map((c) => [c.id, c]))
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
    </>
  )
}
