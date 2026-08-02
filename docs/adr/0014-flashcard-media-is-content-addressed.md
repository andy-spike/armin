# Flashcard media is study-space-scoped content-addressed objects

Flashcard media lives in a Study Space as content-addressed image objects named
`<sha256>.<ext>` in Vercel Blob, and flashcard content references them with
`armin-media:<sha256>.<ext>` identifiers. This replaces inline image data in
flashcard content while preserving the Study Space as the unit that owns its
media.

The renderer displays media through a constrained app-controlled URL rather than
persisting filesystem paths. New write paths must import image bytes into Flashcard
media first; legacy inline data URLs are only an upgrade input, not a supported
storage or authoring format.
