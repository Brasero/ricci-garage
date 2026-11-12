import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { SETTINGS_ID, withDefaults } from '../../shared/settings'
import { validateEmail } from '../../shared/phone'
import type { Settings } from '../../shared/types'
import { db } from '../db'
import { saveSettings } from '../repo'
import { syncNow, useSyncState } from '../sync'
import { Field } from './ui'

const toList = (s: string, scale: number): number[] | null => {
  const parts = s.split(/[,;\s]+/).filter(Boolean)
  const nums = parts.map((p) => Number(p.replace(',', '.')))
  if (!parts.length || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 365)) return null
  return [...new Set(nums.map((n) => Math.round(n * scale)))].sort((a, b) => b - a).slice(0, 6)
}

interface MailStatus {
  configured: boolean
  lastRun: { at: number; sent: number; failed: number; error?: string } | null
  recent: { sent_at: number; to_addr: string; subject: string }[]
}

function Status() {
  const [st, setSt] = useState<MailStatus | 'offline' | null>(null)
  const [test, setTest] = useState('')
  const load = () =>
    fetch('/api/mail/status')
      .then((r) => (r.ok ? (r.json() as Promise<MailStatus>) : Promise.reject(r.status)))
      .then(setSt)
      .catch(() => setSt('offline'))
  useEffect(() => void load(), [])

  async function sendTest() {
    setTest('Envoi…')
    try {
      const r = await fetch('/api/mail/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = (await r.json()) as { ok?: boolean; error?: string; detail?: string }
      setTest(j.ok ? '✓ Email de test envoyé : vérifiez la boîte de réception (et les indésirables).' : j.error === 'smtp_not_configured' ? "L'envoi n'est pas configuré sur le serveur (voir le README : secrets SMTP_USER et SMTP_PASSWORD)." : `Échec : ${j.detail ?? j.error}`)
    } catch {
      setTest('Pas de connexion.')
    }
    void load()
  }

  return (
    <div className="panel">
      <h3>Envoi des emails</h3>
      {st === null && <p className="muted">Chargement…</p>}
      {st === 'offline' && <p className="muted">Indisponible hors connexion.</p>}
      {st && st !== 'offline' && (
        <>
          <p>{st.configured ? '✓ Serveur d\'envoi configuré.' : <span className="warn-text">Envoi non configuré sur le serveur : aucun email ne partira (voir le README).</span>}</p>
          {st.lastRun && (
            <p className="muted">
              Dernière vérification : {new Date(st.lastRun.at).toLocaleString('fr-FR')} — {st.lastRun.sent} envoyé(s){st.lastRun.failed ? `, ${st.lastRun.failed} échec(s)` : ''}.
              {st.lastRun.error && <span className="error"> {st.lastRun.error}</span>}
            </p>
          )}
          {st.recent.length > 0 && (
            <ul className="plain muted">{st.recent.map((r, i) => <li key={i}>{new Date(r.sent_at).toLocaleString('fr-FR')} → {r.to_addr} : {r.subject}</li>)}</ul>
          )}
          <div className="actions"><button type="button" className="btn" onClick={() => void sendTest()} disabled={!st.configured}>✉️ Envoyer un email de test</button></div>
          {test && <p role="status">{test}</p>}
        </>
      )}
    </div>
  )
}

interface GcalStatus {
  configured: boolean
  serviceAccountEmail: string | null
  calendarId: string
  synced: number
  lastRun: { at: number; saved: number; removed: number; failed: number; remaining: number; error?: string } | null
}

function GoogleStatus({ localCalendarId }: { localCalendarId: string }) {
  const [st, setSt] = useState<GcalStatus | 'offline' | null>(null)
  const { lastSync } = useSyncState()
  const [busy, setBusy] = useState(false)
  const load = () =>
    fetch('/api/gcal/status')
      .then((r) => (r.ok ? (r.json() as Promise<GcalStatus>) : Promise.reject(r.status)))
      .then(setSt)
      .catch(() => setSt('offline'))
  // Rechargé au chargement, puis à chaque synchronisation de l'application (ex. l'identifiant d'agenda vient d'arriver sur le serveur).
  useEffect(() => void load(), [lastSync])

  async function syncGoogle() {
    setBusy(true)
    try {
      await syncNow() // envoie d'abord les réglages enregistrés (identifiant d'agenda) au serveur
      await fetch('/api/gcal/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    } finally {
      setBusy(false)
      void load()
    }
  }

  return (
    <div className="panel">
      <h3>Google Agenda (sens unique : application → Google)</h3>
      {st === null && <p className="muted">Chargement…</p>}
      {st === 'offline' && <p className="muted">Indisponible hors connexion.</p>}
      {st && st !== 'offline' && (
        <>
          {!st.configured ? (
            <p className="warn-text">Clé du compte de service absente sur le serveur : la synchronisation est inactive (voir le README, section Google Agenda).</p>
          ) : (
            <p>
              ✓ Compte de service configuré. Partagez votre agenda Google avec <strong>{st.serviceAccountEmail}</strong> (permission « Apporter des modifications aux événements »).
            </p>
          )}
          {st.configured && !localCalendarId && <p className="muted">Renseignez l'identifiant de l'agenda ci-dessus pour activer la synchronisation.</p>}
          <p className="muted">Pour être alerté sur le téléphone : dans Google Agenda (compte de la personne concernée) → Paramètres de l'agenda → <em>Notifications des événements</em> (et <em>…toute la journée</em>) → ajouter les alertes voulues. Les rappels ne se règlent pas depuis l'application : dans Google, ils sont propres à chaque utilisateur.</p>
          {st.lastRun && (
            <p className="muted">
              Dernière synchronisation : {new Date(st.lastRun.at).toLocaleString('fr-FR')} — {st.lastRun.saved} envoyé(s), {st.lastRun.removed} supprimé(s){st.lastRun.failed ? `, ${st.lastRun.failed} échec(s)` : ''}
              {st.lastRun.remaining ? `, ${st.lastRun.remaining} restant(s) (prochain passage dans 15 min)` : ''}. {st.synced} élément(s) dans Google Agenda.
              {st.lastRun.error && <span className="error"> {st.lastRun.error}</span>}
            </p>
          )}
          <div className="actions">
            <button type="button" className="btn" disabled={busy || !st.configured || !localCalendarId} onClick={() => void syncGoogle()}>
              🔄 {busy ? 'Synchronisation…' : 'Synchroniser Google Agenda'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Form({ initial }: { initial: Settings }) {
  const [f, setF] = useState(() => ({
    ...initial,
    rdvH: initial.delaisRdvMin.map((m) => String(m / 60).replace('.', ',')).join(', '),
    echJ: initial.delaisEcheanceJours.join(', '),
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    setSaved(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!f.garageNom.trim()) errs.garageNom = 'Le nom du garage est obligatoire.'
    if (f.garageEmail.trim() && !validateEmail(f.garageEmail)) errs.garageEmail = 'Adresse invalide.'
    if (!validateEmail(f.emailRecap)) errs.emailRecap = 'Adresse invalide.'
    const rdv = toList(f.rdvH, 60)
    const ech = toList(f.echJ, 1)
    if (!rdv) errs.rdvH = 'Indiquez des heures séparées par des virgules (ex. 24, 1).'
    if (!ech) errs.echJ = 'Indiquez des jours séparés par des virgules (ex. 30, 7).'
    setErrors(errs)
    if (Object.keys(errs).length) return
    await saveSettings({
      garageNom: f.garageNom.trim(), garageAdresse: f.garageAdresse.trim(), garageTelephone: f.garageTelephone.trim(), garageEmail: f.garageEmail.trim(), signature: f.signature.trim(),
      emailRecap: f.emailRecap.trim(), heureEnvoi: f.heureEnvoi, recapActif: f.recapActif, rappelsClientActifs: f.rappelsClientActifs, rappelsRdvPereActifs: f.rappelsRdvPereActifs,
      delaisRdvMin: rdv!, delaisEcheanceJours: ech!, googleCalendarId: f.googleCalendarId.trim(),
    })
    setSaved(true)
  }

  const text = (k: 'googleCalendarId' | 'garageNom' | 'garageAdresse' | 'garageTelephone' | 'garageEmail' | 'signature' | 'emailRecap' | 'rdvH' | 'echJ') => (e: { target: { value: string } }) => set(k, e.target.value)
  const check = (k: 'recapActif' | 'rappelsClientActifs' | 'rappelsRdvPereActifs', label: string) => (
    <label className="check"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>
  )

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="panel">
      <h3>Coordonnées du garage (affichées dans les emails)</h3>
      <Field label="Nom *" error={errors.garageNom}><input value={f.garageNom} onChange={text('garageNom')} /></Field>
      <Field label="Adresse"><input value={f.garageAdresse} onChange={text('garageAdresse')} autoComplete="street-address" /></Field>
      <Field label="Téléphone"><input type="tel" value={f.garageTelephone} onChange={text('garageTelephone')} /></Field>
      <Field label="Email de contact" error={errors.garageEmail} hint="Les clients qui répondent à un rappel écrivent à cette adresse"><input type="email" value={f.garageEmail} onChange={text('garageEmail')} /></Field>
      <Field label="Mention en bas des emails"><textarea rows={2} value={f.signature} onChange={text('signature')} /></Field>

      </div>

      <div className="panel">
      <h3>Rappels par email</h3>
      {check('rappelsClientActifs', 'Envoyer des rappels aux clients (rendez-vous, échéances) — uniquement ceux qui ont un email')}
      {check('rappelsRdvPereActifs', 'Recevoir aussi les rappels de rendez-vous')}
      {check('recapActif', 'Recevoir un récapitulatif quotidien (rendez-vous, échéances en retard ou proches)')}
      <Field label="Adresse de réception *" error={errors.emailRecap}><input type="email" value={f.emailRecap} onChange={text('emailRecap')} /></Field>
      <Field label="Heure d'envoi (récapitulatif et rappels d'échéance)">
        <select value={f.heureEnvoi} onChange={(e) => set('heureEnvoi', Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')} h 00</option>)}
        </select>
      </Field>
      <Field label="Rappels de rendez-vous : combien d'heures avant ?" error={errors.rdvH} hint="Par défaut 24, 1 (la veille et 1 h avant)"><input value={f.rdvH} onChange={text('rdvH')} inputMode="decimal" /></Field>
      <Field label="Rappels d'échéance : combien de jours avant ?" error={errors.echJ} hint="Par défaut 30, 7 ; 0 = le jour même"><input value={f.echJ} onChange={text('echJ')} inputMode="numeric" /></Field>
      </div>

      <div className="panel">
      <h3>Google Agenda</h3>
      <Field label="Identifiant de l'agenda Google" hint="Google Agenda → Paramètres de l'agenda → Intégrer l'agenda → ID de l'agenda (souvent l'adresse Gmail). Vide = désactivé">
        <input value={f.googleCalendarId} onChange={text('googleCalendarId')} autoCapitalize="none" />
      </Field>
      </div>
      <button className="btn primary big" type="submit">Enregistrer les réglages</button>
      {saved && <p className="ok-msg" role="status">✓ Enregistré (appliqué à tous les appareils après synchronisation)</p>}
    </form>
  )
}

export function ReminderSettings() {
  const rec = useLiveQuery(async () => ({ s: await db.settings.get(SETTINGS_ID) }), [])
  if (!rec) return null
  const s = withDefaults(rec.s && !rec.s.deletedAt ? rec.s : undefined)
  return (
    <>
      <h2>Garage et rappels</h2>
      {/* Pas de `key` sur updatedAt : le formulaire ne doit pas se recréer (et perdre son message « Enregistré ») à chaque sauvegarde. */}
      <Form initial={s} />
      <div className="form" style={{ marginTop: 14 }}>
        <Status />
        <GoogleStatus localCalendarId={s.googleCalendarId} />
      </div>
    </>
  )
}
