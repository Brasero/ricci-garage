import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/ui'
import { login } from '../sync'

export function LoginPage() {
  const nav = useNavigate()
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await login(pwd)
    setBusy(false)
    if (r === 'ok') nav('/', { replace: true })
    else setMsg({ invalid: 'Mot de passe incorrect.', locked: 'Trop d\'essais. Réessayez dans 15 minutes.', offline: 'Pas de connexion. Réessayez plus tard.' }[r])
  }
  return (
    <>
      <h1>Connexion</h1>
      <p className="muted">La connexion sert uniquement à synchroniser vos données entre appareils. Vous pouvez travailler sans.</p>
      <form className="form" onSubmit={submit}>
        <Field label="Mot de passe" error={msg}>
          <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" autoFocus />
        </Field>
        <button className="btn primary big" disabled={busy || !pwd}>Se connecter</button>
      </form>
    </>
  )
}
