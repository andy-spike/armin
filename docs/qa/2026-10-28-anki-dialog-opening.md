# Anki dialog opening

Changed both entry points to import the dialog directly, removing the lazy boundary and hover preloading. The SQLite worker still starts only after choosing a file.

Validation: pnpm check, web production build, and mobile iOS/Android bundle exports passed.

Running walkthrough: agent-browser with desktop Chromium against the isolated local development app. Signed into the seeded account, opened Decks, and clicked Import from Anki for the first time. The immediately following snapshot contained the dialog heading, Choose file, and Close controls. Clicked Close; an immediate attempted reopen was blocked by the closing overlay animation, so repeated opening was not verified. No file was selected or imported. This was a desktop browser check, not a real mobile device check.
