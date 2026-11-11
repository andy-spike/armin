# Armin mobile

Expo SDK 57, React Native, and TypeScript. The app runs in Expo Go on Android and iOS, imports study logic from `@armin/core`, and calls the same Convex backend as the web app through `@armin/backend/api`.

It is a small smoke path, not the finished product: email/password sign-in, the deck list, one review at a time with rating and undo, and private images. Authoring, browsing, settings, and Google sign-in aren't built yet.

## Run on a phone

From the repository root (install the Vite+ CLI first; see the root README):

```bash
pnpm install --frozen-lockfile
pnpm --filter ./apps/mobile start
```

1. Install [Expo Go](https://expo.dev/go) on your phone. It must support SDK 57.
2. Put the phone and computer on the same Wi-Fi network.
3. Scan the terminal's QR code in Expo Go.

Expo Router builds navigation from `src/app/`; `src/app/index.tsx` renders the smoke path.

The LAN server uses TCP port 8081. If the phone can't connect, check for a VPN, firewall, or Wi-Fi client isolation, or use `pnpm --filter ./apps/mobile start:tunnel`. Clear a stale Metro cache with `pnpm --filter ./apps/mobile start --clear`. An iOS simulator requires macOS; Linux can serve the app to a physical iPhone.

## Run on an Android emulator

Install the [Android command-line tools](https://developer.android.com/studio#command-tools), then use `sdkmanager` to install `platform-tools`, `emulator`, and `system-images;android-36;google_apis;x86_64`. Create a device with `avdmanager` and install the agent CLI with `pnpm add -g agent-device`. On Linux, `emulator -accel-check` should report KVM as usable. See [Expo's agent-device guide](https://docs.expo.dev/agents/agent-device/).

Boot the device, wait until it's ready, then start Expo and keep it running:

```bash
agent-device boot --platform android --device Armin_Pixel_7_API_36
pnpm --filter ./apps/mobile android
```

Add `--headless` to the boot command for terminal-only use. The emulator reaches the host at `10.0.2.2`. If LAN access fails, run `pnpm --filter ./apps/mobile start --localhost`. If Metro listens only on IPv6 (`[::1]:8081`), forward the port and open the localhost URL:

```bash
adb -s emulator-5554 reverse tcp:8081 tcp:8081
agent-device open host.exp.exponent exp://localhost:8081 --platform android --session armin
```

An agent can inspect and control the app from another terminal:

```bash
agent-device help workflow
agent-device open host.exp.exponent exp://10.0.2.2:8081 \
  --platform android --device Armin_Pixel_7_API_36 --session armin
agent-device snapshot --session armin
agent-device screenshot /tmp/armin-android.png --session armin
```

Tap with refs from the latest snapshot, such as `agent-device press @e12 --settle --session armin`. Close the session with `agent-device close --session armin`. Shut down the device with `adb -s emulator-5554 emu kill` (confirm the serial in `adb devices`).

In T3, enable device support and agent device access in the environment's device settings before starting the agent session. The agent opens the emulator in the Device panel with `device_list` and `device_open`, then uses the returned `agent-device` command and target arguments on every later command.

In agent worktrees, use the root `pnpm worktree:setup` and `pnpm dev:mobile`. Checkouts share one SecureStore session slot per device, so sign in again after switching bundles. See the `setting-up-worktrees` skill.

## Connect to the local Convex deployment

`pnpm dev:setup` writes `apps/mobile/.env.local` with this checkout's Convex URLs on the machine's LAN IPv4 address:

```bash
EXPO_PUBLIC_CONVEX_URL=http://192.168.1.20:3210
EXPO_PUBLIC_CONVEX_SITE_URL=http://192.168.1.20:3211
```

The local backend listens on all interfaces, so a phone on the same network and the emulator both reach it. Keep `pnpm dev` running. If the address changes, rerun `pnpm --filter @armin/backend dev:clients` or set `ARMIN_DEV_HOST=<address>`. Where LAN traffic is blocked, set `ARMIN_DEV_HOST=127.0.0.1` and `adb reverse` the Expo and both Convex ports. A phone that can't reach this machine needs a cloud deployment.

Better Auth talks to the deployment's site (HTTP actions) origin and stores the session in `expo-secure-store`. The deployment must trust the app's origin: the backend defaults to `armin://`, and dev setup sets `MOBILE_TRUSTED_ORIGINS=armin://,exp://,exp://**` for Expo Go (see [the backend README](../../packages/backend/README.md#deployment-environment-variables)). Sign in with `test@example.com` / `armin1234`, or an account that has verified its email and opened the web app once.

Private images load with an `Authorization: Bearer <Convex token>` header and show from the downloaded bytes. Android's `Image` drops custom headers, so don't pass the token to `Image` directly.

Google sign-in needs `<site URL>/api/auth/callback/google` registered as a redirect URI on the Google OAuth client.

## Verify changes

```bash
pnpm check
pnpm --filter ./apps/mobile check:expo
pnpm --filter ./apps/mobile check:bundle
```

`check:expo` runs Expo Doctor. `check:bundle` exports Android and iOS bundles to the ignored `apps/mobile/dist/`. These checks verify compilation and module resolution only; confirm runtime behavior on a phone.

## Native boundaries

- Metro detects the pnpm workspace and compiles `@armin/core` directly. Add no custom resolver overrides until needed.
- `index.ts` loads `src/polyfills.ts` first, which supplies `crypto.randomUUID()` through `expo-crypto` when Hermes lacks it.
- Mobile and web share one React version. The `expo.install.exclude` entry for `react` stops Expo from pinning its own; revisit it when upgrading Expo or web React.
- Import only `@armin/core`, `@armin/backend/api`, and `@armin/backend/types`. Keep Node APIs and server code out of React Native.
- Expo generates the git-ignored `android/` and `ios/` directories. Keep configuration in `app.json` and config plugins.
- Expo Go supports only its bundled native modules. Switch to a development build for other native dependencies.
