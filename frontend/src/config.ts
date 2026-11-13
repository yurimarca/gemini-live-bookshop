/** Build-time configuration. Everything comes from Vite env vars; nothing is hard-coded. */
const env = import.meta.env

export const config = {
  firebase: env.VITE_FIREBASE_API_KEY
    ? {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      }
    : null,
  recaptchaSiteKey: env.VITE_RECAPTCHA_SITE_KEY || null,
  apiBase: (env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  wsUrl: env.VITE_GATEWAY_WS_URL || null,
}

/** The live WebSocket URL: explicit in production, same-origin (Vite proxy) in development. */
export function liveSocketUrl(): string {
  if (config.wsUrl) return config.wsUrl
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws/live`
}
