import type { Messaging } from 'firebase-admin/messaging'

// Lazy, optional Firebase Admin init. Stays a no-op until credentials are set
// (FIREBASE_SERVICE_ACCOUNT = the service-account JSON as a string, or
// GOOGLE_APPLICATION_CREDENTIALS = path to it). So the API runs fine without FCM.
let messaging: Messaging | null | undefined // undefined = not tried yet

async function getMessaging(): Promise<Messaging | null> {
  if (messaging !== undefined) return messaging
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      messaging = null
      return null
    }
    const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app')
    const { getMessaging: gm } = await import('firebase-admin/messaging')
    if (getApps().length === 0) {
      initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault() })
    }
    messaging = gm()
  } catch {
    messaging = null
  }
  return messaging
}

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
}

// Send to many device tokens. Returns the tokens that are dead (so the caller
// can prune them). No-op (returns []) when FCM isn't configured.
export async function sendPush(tokens: string[], payload: PushPayload): Promise<string[]> {
  const m = await getMessaging()
  if (!m || tokens.length === 0) return []
  try {
    const res = await m.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: 'high', notification: { channelId: 'grynx_default', sound: 'default' } },
    })
    const dead: string[] = []
    res.responses.forEach((r, i) => {
      const code = r.success ? '' : r.error?.code
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') dead.push(tokens[i])
    })
    return dead
  } catch {
    return []
  }
}
