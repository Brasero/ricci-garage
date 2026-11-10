import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { validatePlate, validateVin, type Country } from '../../shared/plate'
import { MOTORISATIONS, type Motorisation, type Vehicle } from '../../shared/types'
import { db, type Row } from '../db'
import { fullName, findVehiclesByPlate, saveVehicle, setVehicleArchived, type VehicleInput } from '../repo'
import { ClientPicker, Field, PlateBadge } from '../components/ui'

const BRANDS = ['Alfa Romeo', 'Audi', 'BMW', 'Citroën', 'Cupra', 'Dacia', 'DS', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Jeep', 'Kia', 'Land Rover', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Renault', 'Seat', 'Skoda', 'Smart', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo']

export function VehiclePage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => ({ v: id ? await db.vehicles.get(id) : undefined }), [id])
  if (id && !loaded) return <p className="empty">Chargement…</p>
  if (id && !loaded?.v) return <p className="empty">Véhicule introuvable. <Link to="/vehicules">Retour</Link></p>
  return <VehicleForm key={loaded?.v?.id ?? 'new'} existing={loaded?.v} />
}

function VehicleForm({ existing }: { existing?: Row<Vehicle> }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [f, setF] = useState<VehicleInput>({
    clientId: existing?.clientId ?? params.get('client') ?? '',
    marque: existing?.marque ?? '',
    modele: existing?.modele ?? '',
    motorisation: existing?.motorisation ?? 'essence',
    motorisationDetail: existing?.motorisationDetail ?? '',
    country: existing?.country ?? 'FR',
    plate: existing?.plate ?? '',
    couleur: existing?.couleur ?? '',
    miseEnCirculation: existing?.miseEnCirculation ?? '',
    vin: existing?.vin ?? '',
    km: existing?.km ?? null,
    dernierCT: existing?.dernierCT ?? '',
    notes: existing?.notes ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleInput, string>>>({})
  const [dupes, setDupes] = useState<Row<Vehicle>[]>([])
  const [saved, setSaved] = useState(false)
  const clients = useLiveQuery(() => db.clients.toArray(), [], [])
  const nameOf = (cid: string) => fullName(clients.find((c) => c.id === cid))

  const patch = <K extends keyof VehicleInput>(k: K, v: VehicleInput[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setDupes([])
    setSaved(false)
  }
  const text = (k: 'marque' | 'modele' | 'motorisationDetail' | 'plate' | 'couleur' | 'miseEnCirculation' | 'vin' | 'dernierCT' | 'notes') =>
    (e: { target: { value: string } }) => patch(k, e.target.value)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!f.clientId) errs.clientId = 'Choisissez le propriétaire.'
    if (!f.marque.trim()) errs.marque = 'La marque est obligatoire.'
    if (!f.modele.trim()) errs.modele = 'Le modèle est obligatoire.'
    const pv = validatePlate(f.country, f.plate)
    if (!pv.ok) errs.plate = pv.error
    if (f.vin.trim() && !validateVin(f.vin)) errs.vin = 'N° de châssis invalide (17 caractères, sans I, O ni Q).'
    if (f.km !== null && (!Number.isFinite(f.km) || f.km < 0)) errs.km = 'Kilométrage invalide.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (dupes.length === 0) {
      const found = await findVehiclesByPlate(f.plate, existing?.id)
      if (found.length) {
        setDupes(found)
        return
      }
    }
    const id = await saveVehicle(f, existing)
    if (existing) setSaved(true)
    else nav(`/vehicules/${id}`, { replace: true })
  }

  async function toggleArchive() {
    if (!existing) return
    if (!window.confirm('Archiver ce véhicule ? (récupérable depuis la corbeille)')) return
    await setVehicleArchived(existing.id, true)
    nav('/vehicules', { replace: true })
  }

  return (
    <>
      <h1>{existing ? `${existing.marque} ${existing.modele}` : 'Nouveau véhicule'}</h1>
      {existing && <PlateBadge vehicle={existing} />}
      <form onSubmit={submit} noValidate className="form">
        <ClientPicker value={f.clientId} onChange={(cid) => patch('clientId', cid)} error={errors.clientId} />
        {f.clientId && <Link className="link" to={`/clients/${f.clientId}`}>Voir la fiche du propriétaire</Link>}

        <fieldset className="field">
          <legend className="field-label">Pays de la plaque *</legend>
          <div className="segmented">
            {(['FR', 'LU'] as Country[]).map((c) => (
              <button key={c} type="button" className={f.country === c ? 'on' : ''} onClick={() => patch('country', c)}>
                {c === 'FR' ? '🇫🇷 France' : '🇱🇺 Luxembourg'}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Immatriculation *" error={errors.plate} hint={f.country === 'LU' ? 'Ex. AB 1234' : 'Ex. AB-123-CD'}>
          <input className="plate-input" value={f.plate} onChange={text('plate')} autoCapitalize="characters" autoComplete="off" />
        </Field>

        <Field label="Marque *" error={errors.marque}>
          <input list="brands" value={f.marque} onChange={text('marque')} />
          <datalist id="brands">{BRANDS.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="Modèle *" error={errors.modele}>
          <input value={f.modele} onChange={text('modele')} />
        </Field>
        <Field label="Motorisation *">
          <select value={f.motorisation} onChange={(e) => patch('motorisation', e.target.value as Motorisation)}>
            {MOTORISATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Précision moteur" hint="Ex. 1.5 dCi 110 ch">
          <input value={f.motorisationDetail} onChange={text('motorisationDetail')} />
        </Field>
        <Field label="Couleur">
          <input value={f.couleur} onChange={text('couleur')} />
        </Field>
        <Field label="1ʳᵉ mise en circulation">
          <input type="date" value={f.miseEnCirculation} onChange={text('miseEnCirculation')} />
        </Field>
        <Field label="Kilométrage actuel" error={errors.km}>
          <input type="number" inputMode="numeric" min={0} value={f.km ?? ''} onChange={(e) => patch('km', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Dernier contrôle technique">
          <input type="date" value={f.dernierCT} onChange={text('dernierCT')} />
        </Field>
        <Field label="N° de châssis (VIN)" error={errors.vin}>
          <input value={f.vin} onChange={text('vin')} autoCapitalize="characters" maxLength={17} />
        </Field>
        <Field label="Notes">
          <textarea rows={3} value={f.notes} onChange={text('notes')} />
        </Field>

        {dupes.length > 0 && (
          <div className="warning" role="alert">
            <strong>Cette plaque existe déjà :</strong>
            <ul>
              {dupes.map((d) => (
                <li key={d.id}>
                  <Link to={`/vehicules/${d.id}`}>{d.marque} {d.modele}</Link> · {nameOf(d.clientId)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn primary big" type="submit">{dupes.length > 0 ? 'Enregistrer quand même' : 'Enregistrer'}</button>
        {saved && <p className="ok-msg" role="status">✓ Enregistré</p>}
      </form>

      {existing && existing.ownerHistory.length > 0 && (
        <>
          <h2>Anciens propriétaires</h2>
          <ul className="plain">
            {[...existing.ownerHistory].reverse().map((h, i) => (
              <li key={i}>{nameOf(h.clientId)} <span className="muted">· jusqu'au {new Date(h.until).toLocaleDateString('fr-FR')}</span></li>
            ))}
          </ul>
        </>
      )}
      {existing && <button className="btn danger" type="button" onClick={toggleArchive}>Archiver ce véhicule</button>}
    </>
  )
}
