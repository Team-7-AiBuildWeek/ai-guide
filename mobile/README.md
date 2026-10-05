# Walk — iPhone app (Expo)

Recorded tours that download once and play offline: a map, the stops in order,
and each stop's story starting by itself when you arrive.

It talks only to the web app's `/api/mobile/*` routes (`apiBaseUrl` in
`app.json` → `extra`, the production site by default). The backend's address
and every key stay on the server.

## Try it on your iPhone (no Xcode needed)

1. Install **Expo Go** from the App Store.
2. In this folder: `npm install`, then `npx expo start`.
3. Scan the QR code with the iPhone camera. Phone and Mac on the same Wi-Fi.

Outside a city the backend covers, the home screen offers Bratislava, so it can
be tried from anywhere: download a tour, open it, and press *Play now* on a stop.

## What works in Expo Go, and what needs the app's own build

| | Expo Go | Own build (`eas build` or Xcode) |
|---|---|---|
| Tours near you, download for offline, map, playback | ✅ | ✅ |
| Lock-screen controls, playback with the screen locked | not guaranteed | ✅ (`enableBackgroundPlayback`) |
| Stop starts on arrival with the app open | ✅ | ✅ |
| Stop starts on arrival with the phone in a pocket | ❌ | needs background location (next step) |
| App Store purchases | ❌ | ✅ |

## Checks

```sh
npx tsc --noEmit
npx expo lint
npx expo-doctor        # one known warning: the web app's React in the parent folder (harmless, see below)
npx expo export --platform ios   # builds the iPhone JavaScript bundle without Xcode
```

`expo-doctor` reports a duplicate React because the web app's `node_modules`
sits one folder up. Every package here resolves to `mobile/node_modules` first,
so the iPhone bundle uses this app's own React.
