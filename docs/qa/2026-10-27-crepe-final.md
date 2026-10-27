# Milkdown Crepe migration: final validation

Date: 2026-10-27. Branch: `t3/evaluate-tiptap-alternatives`.
Local app: `http://armin-e10076973e.localhost:12872`.

The initial implementation and fixes were exercised by DeepSeek V4.1 Flash
subagents with the `max` variant. See the interaction, interaction recheck,
fidelity, and fidelity recheck reports dated 2026-10-27 in this directory.
Those reports describe intermediate builds; the two residual findings in the
last fidelity recheck were addressed afterward:

- Any currency-looking `$` followed by a digit selects source mode, even when
  the field also contains valid math. Owner verified the existing mixed currency
  and real-math fixture opens in the source textarea with its original text.
- Empty visual paragraphs are omitted by the paragraph serializer rather than
  represented as raw HTML. Owner opened Add card, pressed Enter in the empty
  Front, typed `x`, then clicked Edit source. Source contained `x` with no
  `<br />`. Draft discarded; no sample card modified.

Owner checks used agent-browser Chromium in a separate `crepe-owner` session on
Linux. Earlier delegated narrow-screen checks used emulated viewports, not a
physical phone. The browser session was closed after checking.

Validation: root `pnpm check`, web production build, and Expo iOS/Android bundle
export passed. No new automated test suite was added, per project instructions.

## Deliberate behavior and limits

- Rich edits can normalize Markdown punctuation/table padding. Opening and saving
  an unedited field preserves its original source; initialization is not an edit.
- Raw HTML/comments, legacy math, fenced LaTeX, nested display math, and currency
  use source mode to prevent unsupported conversions. Standalone display math is
  edited as a LaTeX code block; the card renderer shows the rendered equation.
- Image widths keep Armin's `w=<px>` title metadata, with original alt/caption.
  The editor offers a width slider and image preview.
- Saving and switching to source wait for pending uploads. Closing a draft during
  upload prevents late callbacks from modifying another draft; uploaded files
  can remain unreferenced in the local media library.
- No physical-device, native-editor, screen-reader, IME, or production deployment
  verification was performed. Local fidelity fixtures remain in the sample library
  as documented by the delegated tester; they are not production data.
