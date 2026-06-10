import type { CapacitorConfig } from '@capacitor/cli'

// GRYNX Android (Capacitor). Bundles the Vite build (dist/) as an offline shell;
// the app still calls the API over the network via VITE_API_BASE baked into the
// build. appId matches public/.well-known/assetlinks.json.
const config: CapacitorConfig = {
  appId: 'in.dlyft.grynx',
  appName: 'GRYNX',
  webDir: 'dist',
  android: {
    // production build is bundled; flip to a server.url here only for live-reload dev
  },
  plugins: {
    PushNotifications: {
      // foreground presentation; channels + sounds are configured natively
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      backgroundColor: '#000000',
      launchShowDuration: 600,
      showSpinner: false,
    },
  },
}

export default config
