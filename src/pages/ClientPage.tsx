import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { validateEmail, validatePhone } from '../../shared/phone'
import { db, type Row } from '../db'
import { archiveClient, findDuplicateClients, fullName, saveClient, type ClientInput } from '../repo'
import { Icon } from '../components/Icon'
import { Avatar, EmptyState, Field, StaleBanner, VehicleCard } from '../components/ui'
import { useToast } from '../components/Toast'
import { useGoBack } from '../useGoBack'
import { useStaleGuard } from '../useStaleGuard'
import type { Client } from '../../shared/types'

export function ClientPage() {
  const { id } = useParams()
  const loaded = useLiveQuery(async () => ({ c: id ? await db.clients.get(id) : undefined }), [id])
  if (id && !loaded) return <p className="empty">Chargement…</p>
  if (id && !loaded?.c) return <p className="empty">Client introuvable. <Link to="/clients">Retour</Link></p>
  // `key` : si l'enregistrement change (synchro), le formulaire repart de la nouvelle version.
  return <ClientForm key={loaded?.c?.id ?? 'new'} existing={loaded?.c} />
}

const toForm = (c?: Client): ClientInput => ({
  nom: c?.nom ?? '',
  prenom: c?.prenom ?? '',
  telephone: c?.telephone ?? '',
  email: c?.email ?? '',
  notes: c?.notes ?? '',
  rappelsEmail: c?.rappelsEmail ?? true,
})

function ClientForm({ existing }: { existing?: Row<Client> }) {
  const nav = useNavigate()
  const goBack = useGoBack('/clients')
  const toast = useToast()
  const [f, setF] = useState<ClientInput>(() => toForm(existing))
  const guard = useStaleGuard(existing, (c) => {
    setF(toForm(c))
    setErrors({})
    setDupes([])
  })
  const [errors, setErrors] = useState<Partial<Record<keyof ClientInput, string>>>({})
  const [dupes, setDupes] = useState<Row<Client>[]>([])
  const vehicles = useLiveQuery(
    () => (existing ? db.vehicles.where('clientId').equals(existing.id).filter((v) => !v.deletedAt).toArray() : []),
    [existing?.id],
    [],
  )
  const set = (k: keyof ClientInput) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }))
    guard.markTouched()
    setDupes([])
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!f.nom.trim()) errs.nom = 'Le nom est obligatoire.'
    if (!f.prenom.trim()) errs.prenom = 'Le prénom est obligatoire.'
    const ph = validatePhone(f.telephone)
    if (!ph.ok) errs.telephone = ph.error
    if (f.email.trim() && !validateEmail(f.email)) errs.email = 'Adresse email invalide.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (dupes.length === 0) {
      const found = await findDuplicateClients(f, existing?.id)
      if (found.length) {
        setDupes(found)
        return
      }
    }
    const id = await saveClient(f, existing)
    if (existing) guard.saved((await db.clients.get(id))!.updatedAt)
    toast('Client enregistré')
    goBack() // toujours la page précédente
  }

  async function archive() {
    if (!existing) return
    const n = vehicles.length
    const msg = n
      ? `Archiver ${fullName(existing)} et ses ${n} véhicule(s) ? (récupérable depuis la corbeille)`
      : `Archiver ${fullName(existing)} ? (récupérable depuis la corbeille)`
    if (!window.confirm(msg)) return
    await archiveClient(existing.id)
    nav('/clients', { replace: true })
  }

  const form = (
    <form onSubmit={submit} noValidate className="form">
      <div className="panel">
        <h3><Icon name="users" size={18} /> Informations</h3>
        <Field label="Nom *" error={errors.nom}>
          <input value={f.nom} onChange={set('nom')} autoComplete="family-name" autoFocus={!existing} />
        </Field>
        <Field label="Prénom *" error={errors.prenom}>
          <input value={f.prenom} onChange={set('prenom')} autoComplete="given-name" />
        </Field>
        <Field label="Téléphone *" error={errors.telephone} hint="Ex. +352 621 123 456 ou 06 12 34 56 78">
          <input type="tel" value={f.telephone} onChange={set('telephone')} autoComplete="tel" />
        </Field>
        <Field label="Email (facultatif)" error={errors.email}>
          <input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
        </Field>
        {f.email.trim() && (
          <label className="check">
            <input type="checkbox" checked={f.rappelsEmail !== false} onChange={(e) => { setF((p) => ({ ...p, rappelsEmail: e.target.checked })); guard.markTouched() }} />
            Envoyer des rappels par email à ce client (rendez-vous, contrôle technique, vidange…)
          </label>
        )}
        <Field label="Notes">
          <textarea rows={3} value={f.notes} onChange={set('notes')} />
        </Field>
      </div>

      {dupes.length > 0 && (
        <div className="warning" role="alert">
          <strong>Ce client existe peut-être déjà :</strong>
          <ul>
            {dupes.map((d) => (
              <li key={d.id}>
                <Link to={`/clients/${d.id}`}>{fullName(d)}</Link> · {d.telephone}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn primary big" type="submit">
        {dupes.length > 0 ? 'Enregistrer quand même' : 'Enregistrer'}
      </button>
    </form>
  )

  if (!existing) {
    return (
      <>
        <h1>Nouveau client</h1>
        {form}
      </>
    )
  }

  return (
    <>
      <div className="hero">
        <Avatar name={fullName(existing)} large />
        <div className="hero-main">
          <h1>{fullName(existing)}</h1>
          <span className="sub">{existing.telephone}{existing.email ? ` · ${existing.email}` : ''}</span>
        </div>
      </div>
      <div className="actions fill">
        <a className="btn primary" href={`tel:${existing.telephone}`}><Icon name="phone" size={18} /> Appeler</a>
        {existing.email && <a className="btn" href={`mailto:${existing.email}`}><Icon name="mail" size={18} /> Écrire</a>}
      </div>
      {guard.stale && <StaleBanner onReload={guard.reloadNow} onKeep={guard.keepMine} />}

      <div className="section-head">
        <h2>Véhicules<span className="count">{vehicles.length}</span></h2>
        <Link className="btn soft" to={`/vehicules/nouveau?client=${existing.id}`}>+ Ajouter un véhicule</Link>
      </div>
      {vehicles.map((v) => (
        <VehicleCard key={v.id} vehicle={v} owner={existing} onClick={() => nav(`/vehicules/${v.id}`)} />
      ))}
      {vehicles.length === 0 && <EmptyState icon="car">Aucun véhicule pour ce client.</EmptyState>}

      <h2>Modifier la fiche</h2>
      {form}
      <button className="btn danger" type="button" onClick={archive}>Archiver ce client</button>
    </>
  )
}
