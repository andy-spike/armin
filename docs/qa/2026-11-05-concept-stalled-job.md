# Stalled concept generation job walkthrough (2026-11-05)

Local worktree deployment, desktop Chromium via agent-browser (1440×960
viewport), sample account `test@example.com` with complimentary Pro (local
deployment, removed at the end). Variants come from the generator's fake
provider, which takes about 3 s per batch; no model was called.

A real stall takes 10 minutes (the longest a Convex action runs) and needs an
action that never reports back. To reach the same state, the watchdog
`concepts:expireGeneration` was run by hand with `convex run` while the fake
job was still running. That is the same function the scheduler runs, with the
same arguments. State was read with `convex data`.

1. Before: the month's allowance row read `used: 70, reserved: 0`.
2. Deck → **Add card** → **Concept**, brief "Dividing two-digit numbers by
   one-digit numbers with no remainder." Right after saving, the card's pool
   read job 1 `generating`, and the allowance `reserved: 10` (the batch held
   for the job).
3. The scheduler held a pending `concepts:expireGeneration` for job 1, created
   at 14:07:52 and due at 14:17:52: every job gets its own watchdog 10 minutes
   out.
4. Running that watchdog during the job marked the pool `failed` with "Generating
   variants took too long." and released the reservation (`reserved: 0, used:
   70`).
5. The fake job then reported back about 3 s in. Its result was dropped: no
   variants were stored and nothing was charged (`used` stayed 70).
6. The card editor showed "Generating variants failed. Generating variants took
   too long." with **Retry**
   ([screenshot](2026-11-05-concept-stalled-job/pool-failed-retry.png)).
   **Retry** started job 2, which stored 10 variants: "10 variants ready"
   ([screenshot](2026-11-05-concept-stalled-job/pool-ready-after-retry.png)),
   allowance `used: 80, reserved: 0`.
7. Running the watchdogs for job 1 and job 2 again against the now-ready pool
   changed nothing: the pool stayed job 2 `ready`, and the allowance stayed at
   80 used, 0 reserved. A watchdog after the job has stored, failed, or been
   superseded is a no-op.

Cleanup: deleted the QA card, which removed its 10 variants. The sample
library is back to 4 cards, and complimentary Pro is off.
