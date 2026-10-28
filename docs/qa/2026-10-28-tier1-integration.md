# Tier 1 Anki-parity integration walkthrough (2026-10-28)

Run against this worktree's local deployment (`pnpm dev`, sample account) in
desktop Chromium via agent-browser at 1280×900, after merging cram, stats, and
review-limit/bury/card-info branches. Feature-level walkthroughs are in the
other 2026-10-28 records; this one checks the features together.

| Step | Result |
| --- | --- |
| Review a typed-answer card, rate Good | Rated; due count fell. |
| Bury the next card from the card menu | Card hidden, due count fell to 1, Undo enabled. |
| Card info from review and from a Browse tile | Shows relative due, stability (days), difficulty (/10), retrievability, history row. New units show "—" instead of zeros. |
| Cram dialog | All four states checked by default; "Forgotten recently" reveals its day input when switched on; 0 matches disables Start. |
| Cram session | No interval previews; Again re-queued the card; Bury not offered; completion panel shown; deck due count unchanged. |
| Stats | Heatmap fills the panel and counts scheduled + cram answers; forecast excludes never-studied cards; retention empty state; cards-by-state totals match the deck. |
| Settings | "Reviews per day" sits beside the new-unit limit, empty = unlimited. |

Screenshots: `2026-10-28-tier1-integration/`.
Not covered: dark mode, real mobile devices, a full day rollover for bury expiry.
