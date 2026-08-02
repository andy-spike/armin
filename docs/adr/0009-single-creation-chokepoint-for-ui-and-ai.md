# All flashcard creation funnels through one service chokepoint

Flashcard creation — from the UI and from AI-assisted authoring alike — goes
through a single shared service function that validates content, normalizes it
(e.g. explicit cloze cluster numbering), and generates review units. AI card
generation drafts content that the User edits before saving, and that saved
creation routes through the same service the UI uses, instead of reimplementing
inserts.

We chose this because content invariants must hold identically no matter who
authors a flashcard, and "AI-assisted creation" is a core principle — the AI
authoring path is the one we can least afford to let drift. A duplicate creation
path means every future invariant has to be hand-duplicated or the AI silently
produces lower-integrity data. One chokepoint enforces each rule once.

Consequence: AI generation gives up some freedom to optimize its own write path; in
exchange the UI↔AI contract for creating flashcards is guaranteed identical.
