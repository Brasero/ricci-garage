import { describe, expect, it } from 'vitest'
import { checkVerifier, createVerifier } from '../src/lock'
import { loginPage } from '../worker/loginPage'

describe('empreinte du code (vérification hors connexion)', () => {
  it('accepte le bon code et refuse les autres', async () => {
    const v = await createVerifier('un-code-solide')
    expect(await checkVerifier('un-code-solide', v)).toBe(true)
    expect(await checkVerifier('un-code-solid', v)).toBe(false)
    expect(await checkVerifier('', v)).toBe(false)
  })
  it("ne contient jamais le code et change à chaque création (sel)", async () => {
    const a = await createVerifier('abc12345')
    const b = await createVerifier('abc12345')
    expect(JSON.stringify(a)).not.toContain('abc12345')
    expect(a.s).not.toBe(b.s)
    expect(a.h).not.toBe(b.h)
  })
})

describe('page de code (seule page servie sans session)', () => {
  const html = loginPage('NONCE')
  it("n'embarque aucune ressource de l'application", () => {
    expect(html).not.toMatch(/\ssrc=|<link|\/assets\//)
    expect(html).toContain('nonce="NONCE"')
  })
  it('utilise les mêmes paramètres que src/lock.ts', async () => {
    const { PBKDF2_ITERATIONS } = await import('../src/lock')
    expect(html).toContain(`iter=${PBKDF2_ITERATIONS}`)
    expect(html).toContain("'rg_verifier'")
    expect(html).toContain("'rg_unlocked'")
  })
})
