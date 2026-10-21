# Prerequisites grant permanent access

Prerequisites gate initial access to a flashcard. Once the gate opens, access is
permanent. Later prerequisite lapses, Undo, higher stability floors, content
changes, and added prerequisite links do not take it away. Forgotten prerequisites
continue through their own FSRS reviews. This favors stable progress over repeatedly
interrupting study after a lapse. The all-review-units securedness rule in ADR 0001
still determines when an unopened gate first qualifies.

The milestone belongs to the dependent flashcard, not to each prerequisite or
review unit. A newly authored card can still be locked by adding prerequisites
before its first review. An accepted review also earns access for a root card.
Archiving or removing a prerequisite can open the gate permanently, consistent
with the learner-controlled bypass accepted in ADR 0003. Undo restores a review's
schedule and log but does not reverse earned access. Content edits and deck moves
preserve the milestone; deleting and recreating a card creates a new identity.

Existing unlocked flashcards retain access. Existing locked flashcards with
surviving review history regain it. A legacy locked flashcard with no surviving
reviews has no reliable evidence of prior access and remains gated. A bounded,
idempotent deployment migration records these decisions without scanning lifetime
review logs.

New material retains a flexible account-wide daily budget. The chosen deck can
consume its remaining capacity; all-decks and deck-specific views may therefore
offer different new units. Per-deck reservations and an account-wide fixed
selection were rejected in favor of letting the learner choose what to study.
