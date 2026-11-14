/** Firebase mode: a reload must reuse the persisted anonymous user, so the cart is read and not orphaned. */
import { beforeEach, expect, it, vi } from 'vitest'

const auth: { currentUser: { getIdToken: () => Promise<string> } | null; authStateReady: () => Promise<void> } = {
  currentUser: null,
  authStateReady: vi.fn(async () => {
    auth.currentUser = { getIdToken: async () => 'restored-token' } // Firebase restores the user from IndexedDB here
  }),
}
const signInAnonymously = vi.fn(async () => {
  auth.currentUser = { getIdToken: async () => 'new-token' } // like Firebase, the new user becomes current
  return { user: auth.currentUser }
})

vi.mock('../config', () => ({ config: { firebase: { apiKey: 'test' }, recaptchaSiteKey: null } }))
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({ getAuth: () => auth, signInAnonymously }))

const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
})

beforeEach(() => {
  vi.resetModules()
  storage.clear()
  auth.currentUser = null
  signInAnonymously.mockClear()
})

it('has no identity on a first visit', async () => {
  const { hasIdentity } = await import('./firebase')
  expect(hasIdentity()).toBe(false)
})

it('treats a returning browser as signed in and reuses the restored user', async () => {
  localStorage.setItem('bookshop.signedIn', '1')
  const { hasIdentity, idToken } = await import('./firebase')
  expect(hasIdentity()).toBe(true)
  expect(await idToken()).toBe('restored-token')
  expect(signInAnonymously).not.toHaveBeenCalled()
})

it('signs in anonymously when nothing is restored, and remembers it', async () => {
  auth.authStateReady = vi.fn(async () => {})
  const { idToken } = await import('./firebase')
  await idToken()
  expect(signInAnonymously).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('bookshop.signedIn')).toBe('1')
})
