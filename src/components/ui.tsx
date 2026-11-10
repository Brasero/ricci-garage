import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { searchAll } from '../../shared/search'
import type { Client, Vehicle } from '../../shared/types'
import { db } from '../db'
import { fullName } from '../repo'

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className={`field${error ? ' has-error' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error" role="alert">{error}</span>}
    </label>
  )
}

export function PlateBadge({ vehicle }: { vehicle: Pick<Vehicle, 'plate' | 'country'> }) {
  return (
    <span className={`plate plate-${vehicle.country.toLowerCase()}`}>
      <span className="plate-country">{vehicle.country}</span>
      {vehicle.plate}
    </span>
  )
}

export function VehicleCard({ vehicle, owner, onClick }: { vehicle: Vehicle; owner?: Client; onClick?: () => void }) {
  return (
    <div className="card clickable" onClick={onClick} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
      <PlateBadge vehicle={vehicle} />
      <div className="card-main">
        <strong>
          {vehicle.marque} {vehicle.modele}
        </strong>
        <span className="muted">{owner ? fullName(owner) : '—'}</span>
      </div>
    </div>
  )
}

/** Sélecteur de client avec recherche (reste utilisable avec des milliers de clients). */
export function ClientPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.filter((c) => !c.deletedAt).toArray(), [], [])
  const selected = clients.find((c) => c.id === value)
  const hits = q.trim() ? searchAll(q, clients, []).clients.slice(0, 6) : []
  return (
    <Field label="Propriétaire *" error={error}>
      {selected ? (
        <div className="picked">
          <span>
            {fullName(selected)} <span className="muted">· {selected.telephone}</span>
          </span>
          <button type="button" className="link" onClick={() => onChange('')}>
            Changer
          </button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client (nom, prénom, téléphone)" autoComplete="off" />
          {hits.length > 0 && (
            <ul className="picker-list">
              {hits.map(({ client: c }) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onChange(c.id)}>
                    {fullName(c)} <span className="muted">· {c.telephone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && hits.length === 0 && <span className="hint">Aucun client trouvé.</span>}
        </>
      )}
    </Field>
  )
}
