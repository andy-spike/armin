# Armin mobile

Expo SDK 57, React Native, and TypeScript. The app runs in Expo Go on Android
and iOS, imports the platform-independent study domain from `@armin/core`, and
calls the same Convex backend as the web app through `@armin/backend/api`.

The current app is a deliberately small authenticated smoke path, not the
finished mobile product: email/password sign-in, the account's deck list, one
review at a time with rating and undo, and private images loaded with the
session's token. Authoring, browsing, settings, and Google sign-in on mobile
are later work.

## Develop on an Android phone

Run these commands from the repository root:

```bash
# This repo pins Node 24 LTS through mise.toml and .nvmrc.
mise install
pnpm install --frozen-lockfile
pnpm --filter ./apps/mobile start
```

If you use nvm instead of mise, run `nvm install && nvm use`. Use the pnpm
version pinned in the root package.json.

1. Install or update [Expo Go](https://expo.dev/go) on your Android phone.
   This app needs an Expo Go version that supports SDK 57.
2. Connect the phone and computer to the same Wi-Fi network.
3. Scan the terminal's QR code inside Expo Go. The `start` script explicitly
   selects Expo Go and LAN networking.
4. Edit `apps/mobile/src/App.tsx`. Fast Refresh updates the phone as you save.

The LAN server uses TCP port 8081 by default. If the phone cannot connect,
check whether a VPN, firewall, or Wi-Fi client isolation blocks access. You can
also use the tunnel script, which includes its ngrok dependency locally:

```bash
pnpm --filter ./apps/mobile start:tunnel
```

For stale Metro caches, use `pnpm --filter ./apps/mobile start --clear`.
Stop the server with Ctrl+C. Expo Go on a physical phone requires no local
Android SDK, Java setup, or Expo account. An iOS simulator requires macOS;
Linux can serve the app to a physical iPhone running Expo Go.

## Develop on an Android emulator

An emulator lets both you and a coding agent inspect the native Android app.
It uses the same Expo Go and Fast Refresh workflow as a phone. Android Studio
is optional; the Android SDK command-line tools can install the emulator and
system image directly.

On this development machine, the SDK is installed in `~/Android/Sdk` and the
virtual device is `Armin_Pixel_7_API_36`, a Pixel 7 with an Android 16 Google
APIs x86_64 image. `agent-device` is installed globally through pnpm.
`~/.config/android/env.sh` sets `ANDROID_HOME` and adds the SDK tools to `PATH`;
the Bash startup files source it. In an existing shell, load it once:

```bash
source ~/.config/android/env.sh
```

In T3, enable device support and agent device access in the environment's
device settings. Enable agent access before starting the agent session; an
existing session can retain its previous access capabilities. The agent can
use `device_list` and `device_open` to open the emulator in the Device panel,
then use the returned `agent-device` command and target arguments. Keep those
arguments on subsequent commands so they control the displayed device.

To run locally without the Device panel, boot the virtual device first and
wait for the command to report that it is ready:

```bash
agent-device boot --platform android --device Armin_Pixel_7_API_36
pnpm --filter ./apps/mobile android
```

Keep the Expo command running. It installs a compatible Expo Go version when
needed and opens Armin. For terminal-only automation, add `--headless` to the
boot command. The emulator's `10.0.2.2` address points to the host computer;
if LAN access fails, run Metro with `--localhost` and open that address:

```bash
pnpm --filter ./apps/mobile start --localhost
```

From another terminal at the repository root, an agent can inspect and control
the running app. Read the installed CLI's workflow help first:

```bash
agent-device help workflow
agent-device open host.exp.exponent exp://10.0.2.2:8081 \
  --platform android --device Armin_Pixel_7_API_36 --session armin
agent-device snapshot --session armin
agent-device screenshot /tmp/armin-android.png --session armin
```

Use refs from the latest snapshot for taps, such as `agent-device press @e12
--settle --session armin` when `@e12` is the intended current element. Close
the automation session with `agent-device close --session armin`; this leaves
the emulator running. Stop Metro with Ctrl+C and shut down the virtual device
with `adb -s emulator-5554 emu kill` after confirming its serial in
`adb devices`. Future emulators may receive a different serial.

For another machine, install the [Android command-line tools](https://developer.android.com/studio#command-tools),
then use `sdkmanager` to install `platform-tools`, `emulator`, and
`system-images;android-36;google_apis;x86_64`. Create the virtual device with
`avdmanager`, and install the agent CLI with `pnpm add -g agent-device`.
Hardware acceleration must work; on Linux, `emulator -accel-check` should
report that KVM is usable. See [Expo's agent-device guide](https://docs.expo.dev/agents/agent-device/)
for the observation and interaction workflow.

For agent worktrees, use the root `pnpm worktree:setup` and `pnpm dev:mobile`
commands. Setup writes the worktree's backend URLs and the launcher selects its
allocated Metro port. SecureStore sessions are separated by Convex hostname.
See [worktree environments](../../docs/dev-worktrees.md).

## Connect to the Convex dev deployment

Create `apps/mobile/.env.local` from `.env.example` with the same deployment
URLs as `apps/web/.env.local`:

```bash
EXPO_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://<deployment>.convex.site
```

Better Auth talks to the deployment's `.convex.site` origin directly and stores
the session in `expo-secure-store`. The deployment must trust the app's origin:
the backend defaults to `armin://`, and the development deployment sets
`MOBILE_TRUSTED_ORIGINS=armin://,exp://,exp://**` for Expo Go (see
`packages/backend/README.md`). Sign in with an account that has verified its
email and opened the web app once, which creates its library.

Private images are fetched with an `Authorization: Bearer <Convex token>`
header and shown from the downloaded bytes. Android's `Image` component drops
custom request headers in this setup, so don't pass the token to `Image`
directly.

Google sign-in on mobile is not wired yet. It needs the deployment's
`https://<deployment>.convex.site/api/auth/callback/google` registered as an
additional redirect URI on the Google OAuth client.

If Metro only listens on IPv6 (`[::1]:8081`), the emulator's `10.0.2.2` alias
cannot reach it. Forward the port and open the localhost URL instead:

```bash
adb -s emulator-5554 reverse tcp:8081 tcp:8081
agent-device open host.exp.exponent exp://localhost:8081 --platform android --session armin
```

## Verify changes

```bash
pnpm typecheck
pnpm lint
pnpm --filter ./apps/mobile check:expo
pnpm --filter ./apps/mobile check:bundle
```

`check:expo` runs Expo Doctor. `check:bundle` exports Android and iOS bundles
to the ignored `apps/mobile/dist/` folder. CI checks both bundles, and the
mobile typecheck participates in the root Turborepo command. Bundle checks
verify compilation and module resolution; confirm runtime behavior on a phone.

## Workspace and native boundaries

- Expo's default Metro configuration detects the pnpm workspace and compiles
  `@armin/core` directly. Keep custom resolver overrides out until needed.
- `index.ts` loads `src/polyfills.ts` before the app. It supplies
  `crypto.randomUUID()` through `expo-crypto` when Hermes does not provide it;
  the app uses it for review request IDs.
- Mobile uses React 19.2.7, matching the web client.
  Expo's template specifies 19.2.3. The `expo.install.exclude` entry preserves
  the newer compatible patch and keeps one React version across the hoisted
  workspace. Revisit this entry when upgrading Expo or web React.
- Import portable study code from `@armin/core` and backend references from
  `@armin/backend/api` and `@armin/backend/types` only. Those entry points carry
  no server code. Keep Node APIs and server implementation code out of React Native.
- Native `android/` and `ios/` directories are generated by Expo and ignored.
  Keep configuration in `app.json` and config plugins.
- Expo Go supports its bundled native modules. Switch to a development build
  when the app needs a native dependency that Expo Go does not include.

References: [Expo monorepos](https://docs.expo.dev/guides/monorepos/),
[Expo environment setup](https://docs.expo.dev/get-started/set-up-your-environment/),
and [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/).
