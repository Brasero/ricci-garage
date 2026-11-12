import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { searchAll } from '../../shared/search'
import { STATUTS, type Client, type Statut, type Vehicle } from '../../shared/types'
import { db } from '../db'
import { fullName } from '../repo'
import { Icon, type IconName } from './Icon'

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

/** Plaque d'immatriculation de style européen (bande bleue F / L). */
export function PlateBadge({ vehicle, large = false }: { vehicle: Pick<Vehicle, 'plate' | 'country'>; large?: boolean }) {
  return (
    <span className={`plate plate-${vehicle.country.toLowerCase()}${large ? ' plate-lg' : ''}`}>
      <span className="plate-country" aria-label={vehicle.country === 'LU' ? 'Luxembourg' : 'France'}>{vehicle.country === 'LU' ? 'L' : 'F'}</span>
      <span className="plate-body">{vehicle.plate}</span>
    </span>
  )
}

/** Pastille ronde avec les initiales (couleur stable pour une même personne). */
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return <span className={`avatar av-${h % 6}${large ? ' lg' : ''}`} aria-hidden>{initials}</span>
}

export function EmptyState({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ico"><Icon name={icon} size={22} /></span>
      <p>{children}</p>
    </div>
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
      <Icon name="chevron-right" size={18} className="chev" />
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

export function StaleBanner({ onReload, onKeep }: { onReload: () => void; onKeep: () => void }) {
  return (
    <div className="warning" role="alert">
      <strong>Cette fiche a été modifiée sur un autre appareil.</strong>
      <div className="actions">
        <button type="button" className="btn" onClick={onReload}>Voir la version à jour (perdre ma saisie)</button>
        <button type="button" className="btn" onClick={onKeep}>Garder ma saisie (écrasera l'autre)</button>
      </div>
    </div>
  )
}

export function VehiclePicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const [q, setQ] = useState('')
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const vehicles = useLiveQuery(() => db.vehicles.toArray(), [], [])
  const selected = vehicles.find((v) => v.id === value)
  const owner = selected && clients.find((c) => c.id === selected.clientId)
  const hits = q.trim() ? searchAll(q, clients, vehicles).vehicles.slice(0, 6) : []
  return (
    <Field label="Véhicule *" error={error}>
      {selected ? (
        <div className="picked">
          <span>
            <PlateBadge vehicle={selected} /> {selected.marque} {selected.modele} <span className="muted">· {fullName(owner)}</span>
          </span>
          <button type="button" className="link" onClick={() => onChange('')}>
            Changer
          </button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plaque, modèle ou nom du propriétaire" autoComplete="off" />
          {hits.length > 0 && (
            <ul className="picker-list">
              {hits.map(({ vehicle: v, owner: o }) => (
                <li key={v.id}>
                  <button type="button" onClick={() => onChange(v.id)}>
                    <strong>{v.plate}</strong> {v.marque} {v.modele} <span className="muted">· {fullName(o)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim() && hits.length === 0 && <span className="hint">Aucun véhicule trouvé.</span>}
        </>
      )}
    </Field>
  )
}

export function StatusBadge({ statut }: { statut: Statut }) {
  return <span className={`status ${statut}`}>{STATUTS.find((s) => s[0] === statut)?.[1]}</span>
}

export const fmtDateTime = (ms: number): string => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Ligne de client dans une liste : avatar, nom, téléphone. */
export function ClientCard({ client, to }: { client: Client; to: string }) {
  return (
    <Link to={to} className="card clickable">
      <Avatar name={fullName(client)} />
      <div className="card-main">
        <strong>{fullName(client)}</strong>
        <span className="muted">{client.telephone}</span>
      </div>
      <Icon name="chevron-right" size={18} className="chev" />
    </Link>
  )
}

/** Petit calendrier : jour et mois d'une date (cartes d'historique). */
export function DateBox({ ms }: { ms: number }) {
  const d = new Date(ms)
  return (
    <span className="datebox" aria-hidden>
      <b>{d.getDate()}</b>
      <i>{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</i>
    </span>
  )
}
