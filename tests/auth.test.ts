import { describe, expect, it } from 'vitest'
import { createSession, safeEqual, verifySession } from '../worker/auth'

const secret = 'a-long-random-secret-for-tests-0123456789'

describe('sessions signées', () => {
  it('accepte un jeton valide', async () => {
    expect(await verifySession(secret, await createSession(secret))).toBe(true)
  })
  it('refuse un jeton expiré', async () => {
    const old = await createSession(secret, Date.now() - 100 * 24 * 3600 * 1000)
    expect(await verifySession(secret, old)).toBe(false)
  })
  it('refuse un jeton falsifié ou signé avec une autre clé', async () => {
    const t = await createSession(secret)
    const [exp, nonce, sig] = t.split('.')
    expect(await verifySession(secret, `${Number(exp) + 1000}.${nonce}.${sig}`)).toBe(false)
    expect(await verifySession('autre-cle', t)).toBe(false)
    expect(await verifySession(secret, undefined)).toBe(false)
    expect(await verifySession(secret, 'n-importe-quoi')).toBe(false)
  })
  it('comparaison de mots de passe', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})
