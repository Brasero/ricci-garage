import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Logo } from './Icon'
import { checkVerifier, createVerifier, loadVerifier, storeVerifier, unlockNow } from '../lock'
import { login } from '../sync'

/** Écran affiché à la place de TOUT le contenu tant que le code n'a pas été saisi. */
export function LockScreen() {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [fails, setFails] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [, tick] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const hasVerifier = !!loadVerifier()

  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    if (waitUntil <= Date.now()) return
    const t = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [waitUntil])
  const wait = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || wait > 0 || !code) return
    setBusy(true)
    setMsg('')
    try {
      const ver = loadVerifier()
      if (ver && (await checkVerifier(code, ver))) {
        // Code connu de l'appareil : on déverrouille tout de suite (marche hors connexion), puis on rafraîchit la session en douce.
        unlockNow()
        if (navigator.onLine) void login(code)
        return
      }
      // Code inconnu de l'appareil (première utilisation, ou code changé sur le serveur) : le serveur tranche.
      const r = await login(code)
      if (r === 'ok') {
        storeVerifier(await createVerifier(code))
        unlockNow()
        return
      }
      if (r === 'offline') setMsg(ver ? 'Code incorrect.' : 'Première utilisation de cet appareil : une connexion internet est nécessaire.')
      else if (r === 'locked') setMsg('Trop d\'essais. Réessayez dans 15 minutes.')
      else setMsg('Code incorrect.')
      if (r !== 'offline' || ver) {
        const n = fails + 1
        setFails(n)
        if (n >= 3) setWaitUntil(Date.now() + Math.min(60, 2 ** (n - 2)) * 1000)
      }
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="lock">
      <form onSubmit={submit} className="lock-card">
        <Logo size={56} />
        <h1>Mitch depann</h1>
        <p className="muted">{hasVerifier ? 'Saisissez le code pour accéder à l\'application.' : 'Saisissez le code pour connecter cet appareil.'}</p>
        <input
          ref={input}
          className="search"
          type="password"
          autoComplete="current-password"
          placeholder="Code d'accès"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Code d'accès"
        />
        {msg && <p className="error" role="alert">{msg}</p>}
        {wait > 0 && <p className="muted" role="status">Patientez {wait} s avant de réessayer.</p>}
        <button className="btn primary big" disabled={busy || wait > 0 || !code}>{busy ? 'Vérification…' : 'Déverrouiller'}</button>
      </form>
    </main>
  )
}
