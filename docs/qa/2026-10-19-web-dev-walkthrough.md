# Web SaaS development walkthrough — 2026-10-19

Agent walkthrough of the web migration's development target: the local web app
connected to the Convex **development** deployment, plus the minimal Expo smoke
path. This is observed coverage, not an exhaustive guarantee. No production or
staging deployment exists yet.

## Environment

| Item | Value |
| --- | --- |
| Code | `master` at `cbf1e8e` plus the uncommitted web migration working tree |
| Backend | Convex dev deployment (`convex dev` watching `packages/backend`) |
| Web | `vite dev` on `http://localhost:3000`; production build checked with `vite preview` on port 3100 |
| Browser | Chromium 154 (Linux) through the T3 preview browser, default and incognito profiles |
| Phone layout | Same Chromium at a 390×844 viewport (iPhone 12 Pro preset). **Emulated viewport only — not iPhone Safari or Android Chrome.** |
| Native | Android 16 emulator (Pixel 7, `Armin_Pixel_7_API_36`) running Expo Go, Metro via `adb reverse` |
| Accounts | Dedicated `armin-qa-*@example.com` QA accounts and Resend's `delivered@resend.dev` test address |

Verification and reset links for `example.com` QA accounts were read from the
Resend component's stored message in the dev deployment (Resend refuses to
deliver `onboarding@resend.dev` mail to those addresses). The links are the
real Better Auth links; the app has no verification bypass.

## Results

Legend: ✅ observed working · ⚠️ works with a noted gap · ⛔ not verified (blocked)

### Accounts and sessions

| Check | Result |
| --- | --- |
| Email/password sign-up shows "check your email" | ✅ |
| Unverified sign-in refused, new link sent | ✅ "Verify your email first. We just sent you a new link." |
| Verification link signs in and provisions one empty library | ✅ library created with detected timezone |
| Resend accepts mail from `Armin <onboarding@resend.dev>` with the dev `RESEND_API_KEY` | ✅ status `sent` with a Resend ID for `delivered@resend.dev` |
| Real delivery to the Resend account owner's inbox, clicked by a human | ⛔ owner's inbox not available to the agent |
| Google OAuth start | ✅ Google shows "Sign in to continue to Armin" with redirect `http://localhost:3000/api/auth/callback/google`, scopes `openid email profile` |
| Google OAuth completion and linking Google to an existing password account | ⛔ requires the owner's Google login |
| Sign out ends access in every tab (other tab shows "You're signed out"; media returns 401) | ✅ |
| Forgot password: non-enumerating response; reset link sets a new password; old password rejected; new password reaches the same library | ✅ |
| Account deletion (password + "DELETE"): signs out, media 401, auth user removed, library and every library-scoped row removed by the batch job | ✅ |
| Account timezone change persists (`Asia/Tokyo`) | ✅ |

### Authoring, graph, and isolation

| Check | Result |
| --- | --- |
| Create deck, basic card with tag, cloze card (two review units) | ✅ |
| Edit cloze text keeps existing review units | ✅ |
| Two tabs edit the same card: first save wins; second shows "Not saved: changed elsewhere", keeps the draft open; tile behind it updates reactively | ✅ |
| Canvas connection creates a prerequisite edge and locks the dependent | ✅ (drag synthesized with pointer events) |
| Canvas refuses a cycle; server also rejects cycle, self-link, and cross-deck link | ✅ |
| Archived prerequisite is inert (dependent unlocks); unarchive relocks | ✅ |
| Move to another deck drops edges and unlocks; consequences query reports counts | ✅ |
| Deck delete removes cards, units, edges, and history; queue updates | ✅ |
| Repeated create with the same request ID returns the first deck | ✅ |
| Another account's flashcard, deck, graph, image, and export: reads return nothing; update/archive/move/link/create refused; deletes are no-ops; records unchanged | ✅ |
| Image occlusion authoring | ⚠️ not available in the editor, same as desktop; such cards can be reviewed and exported |

### Study

| Check | Result |
| --- | --- |
| Global queue spans decks; locked units excluded | ✅ |
| Rating previews computed on the server (fuzz enabled) | ✅ |
| Rate then undo restores New state and removes the log | ✅ |
| Editing a card while it is on screen invalidates the review instead of swapping the prompt | ✅ "This card was changed in another tab or device. Your answer wasn't saved." |
| Repeated rating with the same request ID returns the first result; a stale version is refused; double undo is refused | ✅ |
| Securing a prerequisite (Easy) unlocks dependents in the same mutation, and they join the session | ✅ |
| Offline signal shows the banner and disables rating; buttons return online | ✅ simulated with the browser `offline` event, not a real network drop |

### Images and export

| Check | Result |
| --- | --- |
| SVG renamed `.png` rejected by byte sniffing | ✅ "Use a PNG, JPG, GIF, WebP, BMP, or AVIF image." |
| PNG upload renders in editor and review; served `private, max-age=600` with a sandbox CSP | ✅ |
| Signed-out image request 401; another account's image 404; path traversal 404 | ✅ |
| Export from Settings → Data builds a ZIP; browser download completes | ✅ |
| ZIP contents: manifest SHA-256 checksums all match; cards→decks, units→cards, logs→units, edges→cards consistent; images included and referenced; no auth data | ✅ (twice, including after the checksum code change) |

### Layout

| Check | Result |
| --- | --- |
| 390px: review with image, browse, deck list — no horizontal overflow | ✅ emulated viewport |
| 390px graph route | ⚠️ renders the canvas; no "use a larger screen" notice (allowed by the plan) |
| Real iPhone Safari, Android Chrome, Firefox, desktop Safari | ⛔ not available in this environment |

### Expo (Android emulator, Expo Go)

| Check | Result |
| --- | --- |
| Email/password sign-in against the Convex site URL; session in SecureStore | ✅ |
| Deck list and review queue from the shared backend | ✅ |
| Rate "Good" writes a review log; Undo removes it | ✅ |
| Private image loads with the session's Convex token | ✅ after fixing Android dropping `Image` headers |
| Sign out returns to sign-in | ✅ |
| iOS | ⛔ no macOS host |
| Google sign-in on mobile | ⛔ not wired; needs the `.convex.site` callback registered |

## Static checks

| Command | Result |
| --- | --- |
| `pnpm typecheck` | ✅ all workspaces |
| `pnpm lint` | ✅ |
| `pnpm --filter @armin/web build` | ✅ |
| `pnpm --filter @armin/web start` equivalent (`vite preview`) | ✅ sign-in page 200, auth route 200, signed-out media 401 |
| `pnpm --filter ./apps/desktop test` | ✅ 15 files, 65 tests (retained desktop on the decoupled core) |
| `pnpm --filter ./apps/mobile check:bundle` | ✅ Android and iOS bundles |
| `pnpm --filter ./apps/mobile check:expo` | ⚠️ 20/21: Expo Doctor wants `expo` 57.0.30; the repository pins 57.0.28 |

## Evidence

- [Empty library, 1280px](2026-10-19-web-dev/web-empty-library-1280px.png)
- [Review with a private image, 390px viewport](2026-10-19-web-dev/web-review-private-image-390px.png)
- [Expo Go on Android, review with a private image](2026-10-19-web-dev/android-expo-go-review-private-image.png)

## Fixed during the walkthrough

- "1 decks", "1 review units", "1 flashcards" copy.
- Android `Image` ignored the `Authorization` header for private media; the
  mobile app now downloads the bytes with the token.
- `SafeAreaView` from React Native did not inset on Android; replaced with
  `react-native-safe-area-context`.
