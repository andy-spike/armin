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
