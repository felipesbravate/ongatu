# Ongatu mobile (Expo / React Native)

iOS first. Same backend as the web app: it calls the Vercel `/api/*` with the Supabase access token
(`Authorization: Bearer`), so the data stays server-side encrypted exactly as on the web.

## What is shared with the web
- `../src/tracker/model.js` and `../src/ui/format.js` (pure logic, imported directly; see `metro.config.js`).
- Design tokens: `src/theme/tokens.ts` is generated from `../tests/figma-tokens.json` (the Okara Figma snapshot):
  `npm run tokens`. Never edit it by hand. The root `npm test` fails if it is out of date.

## Run it on your iPhone (first time)
1. `cp .env.example .env.local` and fill in the three values (API origin = your Vercel URL; Supabase URL + anon key
   are in the web `.env.local` as SUPABASE_URL / SUPABASE_ANON_KEY).
2. `npm install`
3. Development build (needed: native modules, sheets, haptics; Expo Go is not enough):
   - with Xcode on this Mac: `npx expo run:ios --device`
   - or in the cloud: `npx eas-cli build --profile development --platform ios` (needs the Apple Developer account)
4. `npx expo start` and open the app on the phone.

## Structure
- `app/` screens (expo-router): `sign-in`, `(tabs)/index` (Home), `(tabs)/profile`, `add` (native sheet).
- `src/components/OkaraTabBar.tsx` custom bottom nav (DS 378:673), pill slides between tabs, haptics.
- `src/lib/` Supabase client (session in Keychain), API client, session/data provider.
