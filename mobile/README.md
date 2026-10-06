# Walk — iPhone app (Expo)

The website, as a native iPhone app: the same screens, words, colours and type
(Space Grotesk and Inter), and the same flow — choose a city, say what you want,
pick a start, and a custom tour is built and narrated as you walk. Map-first,
with one sheet that slides over it; the controls that float over the map are
Liquid Glass on iOS 26.

It talks to the website's own `/api` routes (`apiBaseUrl` in `app.json` →
`extra`, the production site by default), so every key stays on the server.
The guide's voice is saved on the phone as it is made, so a stop already heard
replays without signal.

## Try it on your iPhone (no Xcode needed)

1. Install **Expo Go** from the App Store.
2. In this folder: `npm install`, then `npx expo start`.
3. Scan the QR code with the iPhone camera. Phone and Mac on the same Wi-Fi.

### This folder lives in iCloud

`node_modules` is a link to `node_modules.nosync`, because iCloud does not offload
folders ending in `.nosync`; without it, a Mac short on space moves the packages
to the cloud and Expo stalls reading them. `npm install` replaces the link with a
real folder, so after installing a package:

```sh
rm -rf node_modules.nosync && mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules
```

## What works in Expo Go, and what needs the app's own build

| | Expo Go | Own build (`eas build` or Xcode) |
|---|---|---|
| Build a tour, map, narration, directions, ask anything | ✅ | ✅ |
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
