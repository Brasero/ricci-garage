import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RDV_STATUTS, type RdvStatut, type RendezVous } from '../../shared/types'
import { ClientPicker, Field, StaleBanner, fmtDateTime } from '../components/ui'
import { db, type Row } from '../db'
import { findRdvConflicts, fullName, saveRdv, setRdvArchived, type RdvInput } from '../repo'
import { useToast } from '../components/Toast'
import { useGoBack } from '../useGoBack'
import { useStaleGuard } from '../useStaleGuard'

const pad = (n: number) => String(n).padStart(2, '0')
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** Prochaine heure ronde (ou la date demandée à 9 h). */
function defaultStart(dateParam: string | null): number {
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return new Date(`${dateParam}T09:00`).getTime()
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.getTime()
}

interface FormState {
  clientId: string
  vehicleId: string
  startAt: string
  duree: string
  motif: string
  statut: RdvStatut
  notes: string
}
const toForm = (r: RendezVous | undefined, p: URLSearchParams): FormState => ({
  clientId: r?.clientId ?? p.get('client') ?? '',
  vehicleId: r?.vehicleId ?? p.get('vehicule') ?? '',
  startAt: toLocalInput(r?.startAt ?? defaultStart(p.get('date'))),
  duree: String(r?.dureeMin ?? 60),
  motif: r?.motif ?? '',
  statut: r?.statut ?? 'prevu',
  notes: r?.notes ?? '',
})

export function RdvPage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => ({ r: id ? await db.rdvs.get(id) : undefined }), [id])
  if (id && !loaded) return <p className="empty">Chargement…</p>
  if (id && !loaded?.r) return <p className="empty">Rendez-vous introuvable. <Link to="/agenda">Retour</Link></p>
  return <RdvForm key={loaded?.r?.id ?? 'new'} existing={loaded?.r} />
}

function RdvForm({ existing }: { existing?: Row<RendezVous> }) {
  const nav = useNavigate()
  const goBack = useGoBack('/agenda')
  const toast = useToast()
  const [params] = useSearchParams()
  const [f, setF] = useState<FormState>(() => toForm(existing, params))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [conflicts, setConflicts] = useState<Row<RendezVous>[]>([])
  const guard = useStaleGuard(existing, (r) => {
    setF(toForm(r, new URLSearchParams()))
    setErrors({})
  })
  const vehicles = useLiveQuery(() => (f.clientId ? db.vehicles.where('clientId').equals(f.clientId).filter((v) => !v.deletedAt).toArray() : []), [f.clientId], [])
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])

  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    guard.markTouched()
  }

  // Avertissement de chevauchement en direct (jamais bloquant).
  const startMs = new Date(f.startAt).getTime()
  const dureeMin = Number(f.duree)
  useEffect(() => {
    if (!Number.isFinite(startMs) || !(dureeMin > 0)) return setConflicts([])
    let live = true
    void findRdvConflicts(startMs, dureeMin, existing?.id).then((c) => live && setConflicts(c))
    return () => {
      live = false
    }
  }, [startMs, dureeMin, existing?.id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.clientId) errs.clientId = 'Choisissez le client.'
    if (!f.startAt || !Number.isFinite(startMs)) errs.startAt = 'Date et heure invalides.'
    if (!Number.isInteger(dureeMin) || dureeMin < 5 || dureeMin > 24 * 60) errs.duree = 'Durée invalide (en minutes, 5 à 1440).'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const input: RdvInput = { clientId: f.clientId, vehicleId: f.vehicleId || null, startAt: startMs, dureeMin, motif: f.motif, statut: f.statut, notes: f.notes }
    const id = await saveRdv(input, existing)
    if (existing) guard.saved((await db.rdvs.get(id))!.updatedAt)
    toast('Rendez-vous enregistré')
    goBack() // toujours la page précédente
  }

  async function archive() {
    if (!existing || !window.confirm('Archiver ce rendez-vous ? (récupérable depuis la corbeille)')) return
    await setRdvArchived(existing.id, true)
    nav('/agenda', { replace: true })
  }

  const toIntervention = () => {
    const q = new URLSearchParams({ rdv: existing!.id })
    if (existing!.vehicleId) q.set('vehicule', existing!.vehicleId)
    nav(`/interventions/nouveau?${q}`)
  }

  return (
    <>
      <h1>{existing ? 'Rendez-vous' : 'Nouveau rendez-vous'}</h1>
      {guard.stale && <StaleBanner onReload={guard.reloadNow} onKeep={guard.keepMine} />}
      {existing?.interventionId && <p><Link to={`/interventions/${existing.interventionId}`}>→ Voir l'intervention liée</Link></p>}
      <form onSubmit={submit} noValidate className="form">
        <ClientPicker value={f.clientId} onChange={(id) => setF((p) => ({ ...p, clientId: id, vehicleId: '' }))} error={errors.clientId} />
        {f.clientId && (
          <Field label="Véhicule (facultatif)">
            <select value={f.vehicleId} onChange={(e) => patch('vehicleId', e.target.value)}>
              <option value="">— Non précisé —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.marque} {v.modele}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date et heure *" error={errors.startAt}>
          <input type="datetime-local" value={f.startAt} onChange={(e) => patch('startAt', e.target.value)} />
        </Field>
        <Field label="Durée estimée (minutes)" error={errors.duree}>
          <input type="number" inputMode="numeric" min={5} step={5} value={f.duree} onChange={(e) => patch('duree', e.target.value)} />
        </Field>
        {conflicts.length > 0 && (
          <div className="warning" role="alert">
            <strong>Ce créneau chevauche un autre rendez-vous :</strong>
            <ul>
              {conflicts.map((c) => (
                <li key={c.id}><Link to={`/rendez-vous/${c.id}`}>{fmtDateTime(c.startAt)}</Link> · {fullName(clients.find((x) => x.id === c.clientId))}{c.motif ? ` · ${c.motif}` : ''}</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Motif">
          <input value={f.motif} onChange={(e) => patch('motif', e.target.value)} placeholder="Ex. Vidange, bruit au freinage…" />
        </Field>
        <Field label="Statut">
          <select value={f.statut} onChange={(e) => patch('statut', e.target.value as RdvStatut)}>
            {RDV_STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={f.notes} onChange={(e) => patch('notes', e.target.value)} />
        </Field>
        <button className="btn primary big" type="submit">Enregistrer</button>
      </form>
      {existing && !existing.interventionId && (
        <button className="btn big" type="button" onClick={toIntervention}>🔧 Créer l'intervention</button>
      )}
      {existing && <button className="btn danger" type="button" onClick={archive}>Archiver ce rendez-vous</button>}
    </>
  )
}
