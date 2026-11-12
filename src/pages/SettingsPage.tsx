import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Client, Vehicle } from '../../shared/types'
import { db } from '../db'
import { exportAll, importAll } from '../backup'
import { ReminderSettings } from '../components/ReminderSettings'
import { Icon } from '../components/Icon'
import { logout, syncNow, useSyncState } from '../sync'

const LABEL = { idle: 'À jour', syncing: 'Synchronisation…', offline: 'Hors connexion', unauthorized: 'Connexion requise', error: 'Erreur' } as const

export function SettingsPage() {
  const sync = useSyncState()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const counts = useLiveQuery(
    async () => ({
      clients: await db.clients.filter((c) => !c.deletedAt).count(),
      vehicles: await db.vehicles.filter((v) => !v.deletedAt).count(),
      interventions: await db.interventions.filter((i) => !i.deletedAt).count(),
      trash:
        (await db.clients.filter((c) => !!c.deletedAt).count()) +
        (await db.vehicles.filter((v) => !!v.deletedAt).count()) +
        (await db.interventions.filter((i) => !!i.deletedAt).count()) +
        (await db.rdvs.filter((r) => !!r.deletedAt).count()) +
        (await db.echeances.filter((e) => !!e.deletedAt).count()),
    }),
    [],
    { clients: 0, vehicles: 0, interventions: 0, trash: 0 },
  )

  async function doExport() {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ricci-garage-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function doImport(file: File) {
    try {
      const n = await importAll(JSON.parse(await file.text()) as { clients?: Client[]; vehicles?: Vehicle[] })
      setMsg(`✓ ${n} enregistrement(s) importé(s). Ils seront synchronisés.`)
    } catch (e) {
      setMsg(`Import impossible : ${e instanceof Error ? e.message : 'fichier invalide'}`)
    }
  }

  return (
    <>
      <h1>Réglages</h1>
      <h2>Synchronisation</h2>
      <div className="panel">
        <p style={{ margin: 0 }}>
          État : <strong>{LABEL[sync.status]}</strong>
          {sync.lastSync && <span className="muted"> · dernière à {new Date(sync.lastSync).toLocaleTimeString('fr-FR')}</span>}
        </p>
        <div className="actions" style={{ margin: 0 }}>
          <button className="btn" onClick={() => void syncNow()}><Icon name="refresh" size={18} /> Synchroniser maintenant</button>
          {sync.status === 'unauthorized' ? <Link className="btn primary" to="/connexion">Se connecter</Link> : <button className="btn" onClick={() => void logout()}><Icon name="lock" size={18} /> Se déconnecter</button>}
        </div>
      </div>

      <ReminderSettings />

      <h2>Données</h2>
      <div className="panel">
        <p style={{ margin: 0 }}>{counts.clients} client(s) · {counts.vehicles} véhicule(s) · {counts.interventions} intervention(s) · <Link to="/corbeille">corbeille ({counts.trash})</Link></p>
        <div className="actions" style={{ margin: 0 }}>
          <button className="btn" onClick={() => void doExport()}><Icon name="download" size={18} /> Exporter une sauvegarde</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Importer une sauvegarde</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
        </div>
        {msg && <p role="status" style={{ margin: 0 }}>{msg}</p>}
        <p className="muted" style={{ margin: 0 }}>La sauvegarde JSON ne contient pas les photos (elles sont conservées sur le serveur). Les données sont enregistrées sur cet appareil puis synchronisées ; le serveur conserve en plus un historique de restauration.</p>
      </div>
    </>
  )
}
