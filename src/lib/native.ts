import { Capacitor } from '@capacitor/core'

// Runs once at startup. No-ops on the web (PWA) build; only does native work
// inside the Capacitor Android app. Keeps the same codebase running everywhere.
export async function initNative() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    // dark icons over the light (day) app chrome
    await StatusBar.setStyle({ style: Style.Light })
  } catch {
    /* plugin not present */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch {
    /* ignore */
  }
  void initPush()
}

// Register for FCM push and hand the device token to the API so the backend can
// deliver notifications even when the app is closed. The token is tied to the
// signed-in user server-side (registerDevice uses the auth token).
async function initPush() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return

    // High-importance channel so alerts pop with sound + vibration even when
    // backgrounded. Drop a res/raw/<name>.wav and set `sound` for a custom chime.
    try {
      await PushNotifications.createChannel({
        id: 'grynx_default',
        name: 'GRYNX Alerts',
        description: 'Job, PPC and maintenance notifications',
        importance: 5,
        visibility: 1,
        vibration: true,
        // sound: 'chime', // ← add android/app/src/main/res/raw/chime.wav then enable
      })
    } catch {
      /* channels are Android-only */
    }

    PushNotifications.addListener('registration', async (token) => {
      try {
        const { registerDevice, isAuthed } = await import('./api')
        if (isAuthed()) await registerDevice(token.value)
      } catch {
        /* will retry on next launch */
      }
    })
    PushNotifications.addListener('registrationError', () => {
      /* surfaced in native logs */
    })
    await PushNotifications.register()
  } catch {
    /* push plugin unavailable */
  }
}

/** Re-send the push token after a fresh sign-in (token may have arrived first). */
export async function syncPushAfterLogin() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.register() // fires 'registration' again with the token
  } catch {
    /* ignore */
  }
}
