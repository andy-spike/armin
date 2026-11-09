# Card editor layout setting walkthrough (2026-11-09)

Local worktree deployment, desktop Chromium via agent-browser (1440×900
viewport), sample account `test@example.com`, which had no saved preference.

1. Deck page → **Add card** with no saved preference: the editor opened full
   page, 1440 px wide ([screenshot](2026-11-09-card-editor-layout-setting/01-default-full-page.png)).
2. Settings → Appearance shows **Card editor → Open as** with **Full page**
   and **Dialog** ([screenshot](2026-11-09-card-editor-layout-setting/02-settings.png)).
   Chose **Dialog**, then reloaded the page: **Dialog** was still selected,
   so the choice was saved to the account.
3. Deck page → **Add card**: the editor opened as the 560 px dialog
   ([screenshot](2026-11-09-card-editor-layout-setting/03-preference-dialog.png)).
4. Opened an existing card (**Edit flashcard**): also the 560 px dialog.
5. Switched the setting back to **Full page**. **Add card** opened at 1440 px
   again, and the account was left on the default.

Validation: `pnpm check`, `pnpm --filter @armin/web build`,
`pnpm --filter @armin/mobile check:bundle`.

## Default changed to Dialog

The default changed after this walkthrough: an account with no saved choice
now gets the dialog, and Settings lists **Dialog** first. Steps 1 and 5 above
show the earlier full-page default.

6. The test account still had **Full page** saved from step 5. Chose
   **Dialog** and reloaded: **Dialog** stayed selected
   ([screenshot](2026-11-09-card-editor-layout-setting/04-settings-dialog-default.png)).
7. **Add card** opened as the 560 px dialog. The corner **Full page** button
   expanded it to 1440 px. Closing and opening **Add card** again went back
   to the 560 px dialog.

This account has a saved value, so this walkthrough didn't exercise the
fallback for an account with nothing saved. The server and both client
fallbacks now read `"dialog"`.
