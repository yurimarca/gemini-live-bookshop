/**
 * Identity for a public anonymous demo: Firebase anonymous sign-in, started only when the visitor
 * first uses the microphone or the cart. With no Firebase config (local development) the page
 * sends a dev token, which the gateway accepts only when it runs with AUTH_MODE=dev.
 * The Firebase SDK is loaded on demand, so a visitor who only browses never downloads it.
 */
import { config } from '../config'

const DEV_KEY = 'bookshop.devUid'
/** Set once Firebase has signed this browser in. Firebase keeps the user itself in IndexedDB; this is only a hint to restore it on load. */
const SIGNED_IN_KEY = 'bookshop.signedIn'
let ready: Promise<{ token: () => Promise<string>; appCheck: () => Promise<string | undefined> }> | null = null

export const usingDevAuth = config.firebase === null

function devUid(): string {
  let uid: string | null = null
  try { uid = localStorage.getItem(DEV_KEY) } catch { /* ignore */ }
  if (!uid) {
    uid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
    try { localStorage.setItem(DEV_KEY, uid) } catch { /* ignore */ }
  }
  return uid
}

async function init() {
  if (!config.firebase) {
    const token = `dev:${devUid()}`
    return { token: async () => token, appCheck: async () => undefined }
  }
  const [{ initializeApp }, { getAuth, signInAnonymously }] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  const app = initializeApp(config.firebase)
  const auth = getAuth(app)
  let appCheck: () => Promise<string | undefined> = async () => undefined
  if (config.recaptchaSiteKey) {
    const { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } = await import('firebase/app-check')
    const instance = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.recaptchaSiteKey), isTokenAutoRefreshEnabled: true })
    appCheck = async () => (await getToken(instance)).token
  }
  // Wait for Firebase to restore a persisted user; signing in before that would create a new uid and orphan the cart.
  await auth.authStateReady()
  if (!auth.currentUser) await signInAnonymously(auth)
  try { localStorage.setItem(SIGNED_IN_KEY, '1') } catch { /* ignore */ }
  return {
    token: async () => {
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user
      return user.getIdToken()
    },
    appCheck,
  }
}

function session() {
  ready ??= init().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

/** A fresh ID token. Signs in anonymously on first use. */
export async function idToken(): Promise<string> {
  return (await session()).token()
}

export async function appCheckToken(): Promise<string | undefined> {
  try {
    return await (await session()).appCheck()
  } catch {
    return undefined // the gateway decides whether a missing token is fatal
  }
}

/** True once this browser has an identity, so the cart can be read without forcing a sign-in. */
export function hasIdentity(): boolean {
  try {
    if (!usingDevAuth) return ready !== null || localStorage.getItem(SIGNED_IN_KEY) !== null
    return localStorage.getItem(DEV_KEY) !== null
  } catch {
    return !usingDevAuth && ready !== null
  }
}
