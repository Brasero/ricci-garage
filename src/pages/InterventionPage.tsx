import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { computeTotals, eurosToInput, formatEuros, parseEuros } from '../../shared/money'
import { INTERVENTION_TYPES, STATUTS, type Intervention, type InterventionType, type Piece, type Statut } from '../../shared/types'
import { NextReminderPrompt } from '../components/NextReminderPrompt'
import { Icon } from '../components/Icon'
import { PhotoGallery } from '../components/Photos'
import { Field, StaleBanner, VehiclePicker } from '../components/ui'
import { db, type Row } from '../db'
import { linkRdvToIntervention, saveIntervention, setInterventionArchived, type InterventionInput } from '../repo'
import { useToast } from '../components/Toast'
import { useGoBack } from '../useGoBack'
import { useStaleGuard } from '../useStaleGuard'

const MAX_PIECES = 50

interface PieceDraft {
  designation: string
  reference: string
  quantite: string
  achat: string
  vente: string
}
interface FormState {
  vehicleId: string
  startAt: string
  heures: string
  minutes: string
  km: string
  type: InterventionType
  description: string
  pieces: PieceDraft[]
  mainOeuvre: string
  statut: Statut
  notes: string
}

const pad = (n: number) => String(n).padStart(2, '0')
/** ms → valeur d'un <input type="datetime-local"> (heure locale). */
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyPiece = (): PieceDraft => ({ designation: '', reference: '', quantite: '1', achat: '', vente: '' })
const num = (s: string) => Number(s.trim().replace(',', '.'))

function toForm(i: Intervention | undefined, vehicleId: string): FormState {
  return {
    vehicleId: i?.vehicleId ?? vehicleId,
    startAt: toLocalInput(i?.startAt ?? Date.now()),
    heures: i?.dureeMin != null ? String(Math.floor(i.dureeMin / 60)) : '',
    minutes: i?.dureeMin != null ? String(i.dureeMin % 60) : '',
    km: i?.km != null ? String(i.km) : '',
    type: i?.type ?? 'vidange',
    description: i?.description ?? '',
    pieces: (i?.pieces ?? []).map((p) => ({
      designation: p.designation,
      reference: p.reference,
      quantite: String(p.quantite).replace('.', ','),
      achat: eurosToInput(p.prixAchatCts),
      vente: eurosToInput(p.prixVenteCts),
    })),
    mainOeuvre: eurosToInput(i?.mainOeuvreCts),
    statut: i?.statut ?? 'terminee',
    notes: i?.notes ?? '',
  }
}

/** Interprète le formulaire ; `pieces` est toujours renvoyé (pour afficher les totaux en direct même si une ligne est incomplète). */
function parseForm(f: FormState): { input?: InterventionInput; errors: Record<string, string>; pieces: Piece[]; mainOeuvreCts: number | null } {
  const errors: Record<string, string> = {}
  if (!f.vehicleId) errors.vehicleId = 'Choisissez le véhicule.'
  const startAt = new Date(f.startAt).getTime()
  if (!f.startAt || Number.isNaN(startAt)) errors.startAt = 'Date et heure invalides.'

  let dureeMin: number | null = null
  if (f.heures.trim() || f.minutes.trim()) {
    const h = f.heures.trim() ? Number(f.heures) : 0
    const m = f.minutes.trim() ? Number(f.minutes) : 0
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) errors.duree = 'Durée invalide (heures entières, minutes de 0 à 59).'
    else dureeMin = h * 60 + m
  }
  let km: number | null = null
  if (f.km.trim()) {
    km = Number(f.km)
    if (!Number.isInteger(km) || km < 0) {
      errors.km = 'Kilométrage invalide.'
      km = null
    }
  }

  const pieces: Piece[] = []
  f.pieces.forEach((p, idx) => {
    const blank = !p.designation.trim() && !p.reference.trim() && !p.achat.trim() && !p.vente.trim()
    if (blank) return
    const q = num(p.quantite)
    const achat = p.achat.trim() ? parseEuros(p.achat) : 0
    const vente = p.vente.trim() ? parseEuros(p.vente) : 0
    if (!p.designation.trim()) errors[`piece${idx}`] = 'Désignation obligatoire.'
    else if (!(q > 0) || !Number.isFinite(q)) errors[`piece${idx}`] = 'Quantité invalide.'
    else if (achat === null || vente === null) errors[`piece${idx}`] = 'Prix invalide (ex. 12,50).'
    pieces.push({ designation: p.designation, reference: p.reference, quantite: q > 0 ? q : 0, prixAchatCts: achat ?? 0, prixVenteCts: vente ?? 0 })
  })

  let mainOeuvreCts: number | null = null
  if (f.mainOeuvre.trim()) {
    mainOeuvreCts = parseEuros(f.mainOeuvre)
    if (mainOeuvreCts === null) errors.mainOeuvre = 'Montant invalide (ex. 60 ou 60,50).'
  }
  if (Object.keys(errors).length) return { errors, pieces, mainOeuvreCts }
  return {
    errors,
    pieces,
    mainOeuvreCts,
    input: { vehicleId: f.vehicleId, startAt, dureeMin, km, type: f.type, description: f.description, pieces, mainOeuvreCts, statut: f.statut, notes: f.notes },
  }
}

export function InterventionPage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => ({ i: id ? await db.interventions.get(id) : undefined }), [id])
  if (id && !loaded) return <p className="empty">Chargement…</p>
  if (id && !loaded?.i) return <p className="empty">Intervention introuvable. <Link to="/interventions">Retour</Link></p>
  return <InterventionForm key={loaded?.i?.id ?? 'new'} existing={loaded?.i} />
}

function InterventionForm({ existing }: { existing?: Row<Intervention> }) {
  const nav = useNavigate()
  const goBack = useGoBack('/interventions')
  const toast = useToast()
  const location = useLocation()
  const [params] = useSearchParams()
  const rdvId = params.get('rdv')
  const [f, setF] = useState<FormState>(() => toForm(existing, params.get('vehicule') ?? ''))
  // Proposition du prochain rappel : `leave` = on quitte la page ensuite (cas normal) ; sinon elle s'affiche sous le formulaire.
  const [reminder, setReminder] = useState<{ row: Row<Intervention>; leave: boolean } | null>(() =>
    existing && (location.state as { askReminder?: boolean } | null)?.askReminder ? { row: existing, leave: false } : null,
  )

  // Création depuis un rendez-vous : on reprend son heure, son motif et son véhicule.
  useEffect(() => {
    if (existing || !rdvId) return
    void db.rdvs.get(rdvId).then((r) => {
      if (!r) return
      setF((p) => ({ ...p, startAt: toLocalInput(r.startAt), description: p.description || r.motif, vehicleId: p.vehicleId || r.vehicleId || '' }))
    })
  }, [existing, rdvId])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const guard = useStaleGuard(existing, (i) => {
    setF(toForm(i, ''))
    setErrors({})
  })
  const parsed = parseForm(f)
  const totals = computeTotals(parsed.pieces, parsed.mainOeuvreCts)

  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    guard.markTouched()
  }
  const txt = (k: 'startAt' | 'heures' | 'minutes' | 'km' | 'description' | 'mainOeuvre' | 'notes') => (e: { target: { value: string } }) => patch(k, e.target.value)
  const setPiece = (idx: number, k: keyof PieceDraft, v: string) => patch('pieces', f.pieces.map((p, i) => (i === idx ? { ...p, [k]: v } : p)))

  function submit(e: FormEvent) {
    e.preventDefault()
    void save(false)
  }

  /** `addPhotos` : reste sur l'intervention enregistrée pour y ajouter des photos (impossible avant le premier enregistrement). */
  async function save(addPhotos: boolean) {
    setErrors(parsed.errors)
    if (!parsed.input) return
    const id = await saveIntervention(parsed.input, existing)
    if (!existing && rdvId) await linkRdvToIntervention(rdvId, id)
    const row = (await db.interventions.get(id))!
    if (existing) guard.saved(row.updatedAt)
    toast('Intervention enregistrée')
    const ask = parsed.input.statut === 'terminee' && !(await db.echeances.filter((e) => e.sourceInterventionId === id && !e.deletedAt).count())
    if (addPhotos) nav(`/interventions/${id}`, { replace: true, state: { askReminder: ask } })
    else if (ask) setReminder({ row, leave: true }) // proposition du prochain rappel, puis retour
    else goBack() // toujours la page précédente
  }

  async function archive() {
    if (!existing || !window.confirm('Archiver cette intervention ? (récupérable depuis la corbeille)')) return
    await setInterventionArchived(existing.id, true)
    nav(-1)
  }

  if (reminder?.leave) {
    return (
      <>
        <h1>Intervention enregistrée ✓</h1>
        <NextReminderPrompt intervention={reminder.row} onDone={goBack} />
      </>
    )
  }

  return (
    <>
      <h1>{existing ? 'Intervention' : 'Nouvelle intervention'}</h1>
      {guard.stale && <StaleBanner onReload={guard.reloadNow} onKeep={guard.keepMine} />}
      <form onSubmit={submit} noValidate className="form">
        <div className="panel">
        <h3><Icon name="car" size={18} /> Véhicule et date</h3>
        <VehiclePicker value={f.vehicleId} onChange={(v) => patch('vehicleId', v)} error={errors.vehicleId} />
        {f.vehicleId && <Link className="link" to={`/vehicules/${f.vehicleId}`}>Voir la fiche du véhicule</Link>}

        <Field label="Date et heure *" error={errors.startAt}>
          <input type="datetime-local" value={f.startAt} onChange={txt('startAt')} />
        </Field>
        <Field label="Type">
          <select value={f.type} onChange={(e) => patch('type', e.target.value as InterventionType)}>
            {INTERVENTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select value={f.statut} onChange={(e) => patch('statut', e.target.value as Statut)}>
            {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        </div>

        <div className="panel">
        <h3><Icon name="wrench" size={18} /> Travaux</h3>
        <Field label="Travaux effectués / description">
          <textarea rows={4} value={f.description} onChange={txt('description')} />
        </Field>
        <div className="row2">
          <Field label="Kilométrage" error={errors.km} hint="Met à jour le véhicule si l'intervention est terminée">
            <input type="number" inputMode="numeric" min={0} value={f.km} onChange={txt('km')} />
          </Field>
          <Field label="Durée" error={errors.duree}>
            <div className="row2">
              <input type="number" inputMode="numeric" min={0} placeholder="h" aria-label="Heures" value={f.heures} onChange={txt('heures')} />
              <input type="number" inputMode="numeric" min={0} max={59} placeholder="min" aria-label="Minutes" value={f.minutes} onChange={txt('minutes')} />
            </div>
          </Field>
        </div>

        </div>

        <div className="panel">
        <div className="section-inline">
          <h3><Icon name="file" size={18} /> Pièces ({parsed.pieces.length})</h3>
          <button type="button" className="btn soft" disabled={f.pieces.length >= MAX_PIECES} onClick={() => patch('pieces', [...f.pieces, emptyPiece()])}>+ Ajouter une pièce</button>
        </div>
        {f.pieces.map((p, idx) => (
          <div className="piece" key={idx}>
            <input placeholder="Désignation (ex. Filtre à huile)" aria-label={`Désignation pièce ${idx + 1}`} value={p.designation} onChange={(e) => setPiece(idx, 'designation', e.target.value)} />
            <div className="piece-grid">
              <input placeholder="Référence" aria-label={`Référence pièce ${idx + 1}`} value={p.reference} onChange={(e) => setPiece(idx, 'reference', e.target.value)} />
              <input placeholder="Quantité" inputMode="decimal" aria-label={`Quantité pièce ${idx + 1}`} value={p.quantite} onChange={(e) => setPiece(idx, 'quantite', e.target.value)} />
              <button type="button" className="btn danger" style={{ margin: 0 }} onClick={() => patch('pieces', f.pieces.filter((_, i) => i !== idx))}>Retirer</button>
            </div>
            <div className="row2">
              <input placeholder="Prix d'achat unit. (€)" inputMode="decimal" aria-label={`Prix d'achat pièce ${idx + 1}`} value={p.achat} onChange={(e) => setPiece(idx, 'achat', e.target.value)} />
              <input placeholder="Prix de vente unit. (€)" inputMode="decimal" aria-label={`Prix de vente pièce ${idx + 1}`} value={p.vente} onChange={(e) => setPiece(idx, 'vente', e.target.value)} />
            </div>
            {errors[`piece${idx}`] && <span className="error" role="alert">{errors[`piece${idx}`]}</span>}
          </div>
        ))}

        </div>

        <div className="panel">
        <h3><Icon name="clock" size={18} /> Main d'œuvre et total</h3>
        <Field label="Main d'œuvre (prix en €)" error={errors.mainOeuvre} hint="Saisie libre, indépendante de la durée">
          <input inputMode="decimal" value={f.mainOeuvre} onChange={txt('mainOeuvre')} />
        </Field>

        <div className="totals" aria-label="Totaux">
          <div><span>Pièces (vente)</span><span>{formatEuros(totals.piecesVenteCts)}</span></div>
          <div><span className="muted">Pièces (achat)</span><span className="muted">{formatEuros(totals.piecesAchatCts)}</span></div>
          <div><span className="muted">Marge sur pièces</span><span className="muted">{formatEuros(totals.margePiecesCts)}</span></div>
          <div><span>Main d'œuvre</span><span>{formatEuros(totals.mainOeuvreCts)}</span></div>
          <div className="grand"><span>Total</span><span>{formatEuros(totals.totalCts)}</span></div>
        </div>

        </div>

        <div className="panel">
        <Field label="Notes internes">
          <textarea rows={2} value={f.notes} onChange={txt('notes')} />
        </Field>
        </div>
        {Object.keys(errors).length > 0 && <p className="error" role="alert">Corrigez les champs signalés avant d'enregistrer.</p>}
        <button className="btn primary big" type="submit">Enregistrer</button>
        {!existing && (
          <button className="btn big" type="button" onClick={() => void save(true)}>
            Enregistrer et ajouter des photos
          </button>
        )}
      </form>

      {existing && reminder && !reminder.leave && <NextReminderPrompt intervention={reminder.row} onDone={() => setReminder(null)} />}
      {existing ? (
        <>
          <h2>Photos</h2>
          <PhotoGallery interventionId={existing.id} />
          <button className="btn danger" type="button" onClick={archive}>Archiver cette intervention</button>
        </>
      ) : (
        <p className="muted">Les photos s'ajoutent une fois l'intervention enregistrée : utilisez « Enregistrer et ajouter des photos ».</p>
      )}
    </>
  )
}
