import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addMonths, localDate } from '../../shared/time'
import { TIMEZONE } from '../../shared/settings'
import { ECHEANCE_TYPES, type Echeance, type EcheanceType } from '../../shared/types'
import { Field, StaleBanner, VehiclePicker } from '../components/ui'
import { db, type Row } from '../db'
import { saveEcheance, setEcheanceArchived, setEcheanceDone } from '../repo'
import { useStaleGuard } from '../useStaleGuard'

interface FormState {
  vehicleId: string
  type: EcheanceType
  libelle: string
  dateDue: string
  kmDue: string
  notes: string
}
const toForm = (e: Echeance | undefined, vehicleId: string, type: EcheanceType | null): FormState => ({
  vehicleId: e?.vehicleId ?? vehicleId,
  type: e?.type ?? type ?? 'ct',
  libelle: e?.libelle ?? '',
  // Contrôle technique : tous les 2 ans en France comme au Luxembourg (à ajuster si besoin).
  dateDue: e?.dateDue ?? (!e && (type ?? 'ct') === 'ct' ? addMonths(localDate(Date.now(), TIMEZONE), 24) : ''),
  kmDue: e?.kmDue != null ? String(e.kmDue) : '',
  notes: e?.notes ?? '',
})

export function EcheancePage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => ({ e: id ? await db.echeances.get(id) : undefined }), [id])
  if (id && !loaded) return <p className="empty">Chargement…</p>
  if (id && !loaded?.e) return <p className="empty">Échéance introuvable. <Link to="/agenda">Retour</Link></p>
  return <EcheanceForm key={loaded?.e?.id ?? 'new'} existing={loaded?.e} />
}

function EcheanceForm({ existing }: { existing?: Row<Echeance> }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [f, setF] = useState<FormState>(() => toForm(existing, params.get('vehicule') ?? '', null))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const guard = useStaleGuard(existing, (e) => {
    setF(toForm(e, '', null))
    setErrors({})
  })
  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    guard.markTouched()
    setSaved(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.vehicleId) errs.vehicleId = 'Choisissez le véhicule.'
    if (f.type === 'autre' && !f.libelle.trim()) errs.libelle = 'Précisez de quoi il s’agit.'
    const km = f.kmDue.trim() ? Number(f.kmDue) : null
    if (km !== null && (!Number.isInteger(km) || km < 0)) errs.kmDue = 'Kilométrage invalide.'
    if (!f.dateDue && km === null) errs.dateDue = 'Indiquez une date et/ou un kilométrage.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const id = await saveEcheance({ vehicleId: f.vehicleId, type: f.type, libelle: f.libelle, dateDue: f.dateDue || null, kmDue: km, statut: existing?.statut ?? 'ouverte', notes: f.notes }, existing)
    if (existing) {
      guard.saved((await db.echeances.get(id))!.updatedAt)
      setSaved(true)
    } else nav(`/vehicules/${f.vehicleId}`, { replace: true })
  }

  async function archive() {
    if (!existing || !window.confirm('Archiver cette échéance ? (récupérable depuis la corbeille)')) return
    await setEcheanceArchived(existing.id, true)
    nav(-1)
  }

  return (
    <>
      <h1>{existing ? 'Échéance' : 'Nouvelle échéance'}</h1>
      {guard.stale && <StaleBanner onReload={guard.reloadNow} onKeep={guard.keepMine} />}
      {existing?.statut === 'faite' && <p className="ok-msg">✓ Marquée comme faite</p>}
      <form onSubmit={submit} noValidate className="form">
        <VehiclePicker value={f.vehicleId} onChange={(v) => patch('vehicleId', v)} error={errors.vehicleId} />
        <Field label="Type">
          <select value={f.type} onChange={(e) => patch('type', e.target.value as EcheanceType)}>
            {ECHEANCE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label={f.type === 'autre' ? 'De quoi s’agit-il ? *' : 'Précision (facultatif)'} error={errors.libelle}>
          <input value={f.libelle} onChange={(e) => patch('libelle', e.target.value)} placeholder={f.type === 'autre' ? 'Ex. Pneus hiver, courroie…' : ''} />
        </Field>
        <Field label="Date d'échéance" error={errors.dateDue} hint="Les rappels par email au client sont envoyés avant cette date">
          <input type="date" value={f.dateDue} onChange={(e) => patch('dateDue', e.target.value)} />
        </Field>
        <Field label="ou kilométrage d'échéance" error={errors.kmDue} hint="Visible dans « À venir » et le récapitulatif (pas d'email au client)">
          <input type="number" inputMode="numeric" min={0} value={f.kmDue} onChange={(e) => patch('kmDue', e.target.value)} />
        </Field>
        <Field label="Notes">
          <textarea rows={2} value={f.notes} onChange={(e) => patch('notes', e.target.value)} />
        </Field>
        <button className="btn primary big" type="submit">Enregistrer</button>
        {saved && <p className="ok-msg" role="status">✓ Enregistré</p>}
      </form>
      {existing && (
        <>
          <button className="btn big" type="button" onClick={() => setEcheanceDone(existing.id, existing.statut !== 'faite')}>
            {existing.statut === 'faite' ? '↩︎ Rouvrir' : '✓ Marquer comme faite'}
          </button>
          <button className="btn danger" type="button" onClick={archive}>Archiver cette échéance</button>
        </>
      )}
    </>
  )
}
