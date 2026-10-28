> Historical study glossary. Profile describes the retired desktop storage model.
> The current clients use an account-owned library in Convex.

# Armin

Armin is a local-first study context for retaining knowledge through flashcards,
decks, reviews, and prerequisite relationships.

## Language

**Profile**:
A fully isolated local study space backed by its own database. Decks, flashcards,
schedule, and settings are never shared across profiles; a profile is a folder you
can copy, move, or delete. Multiple profiles can be open at once.
_Avoid_: Account, user, login

**Deck**:
A named, isolated study space for a set of flashcards and their prerequisite
relationships. A flashcard's prerequisites and dependents belong to the same
deck.
_Avoid_: Course, folder, set, label

**Flashcard**:
The authored unit a user creates and edits. It owns the content, tags,
prerequisite edges, graph position, and lock state, and generates one or more
review units. The unit that participates in the prerequisite graph.
_Avoid_: Note, item, entry, fact

**Flashcard media**:
User-provided image files referenced by flashcard content. Flashcard media belongs
to exactly one Profile and is part of that Profile's local study data.
_Avoid_: Assets, uploads, attachments

**Review unit**:
A generated review item belonging to a flashcard. It carries the FSRS scheduling
state and is the unit that appears in a review session. One flashcard can
generate several review units (e.g. forward and reverse, or one per cloze
deletion).
_Avoid_: Card, review item

**Prerequisite**:
A flashcard that must be learned before another flashcard should be studied.
_Avoid_: Parent, dependency

**Dependent flashcard**:
A flashcard that relies on one or more prerequisite flashcards.
_Avoid_: Child, subcard

**Prerequisite graph**:
The directed knowledge structure formed by prerequisite relationships between
flashcards within a deck.
_Avoid_: Tree

**Frontier**:
The brand-new review units introduced into study each day, drawn after due
reviews and limited by a single daily cap shared across every deck. The learner's
daily capacity for new material, with the chosen deck able to use the remaining
capacity.
_Avoid_: Backlog, new queue

**Daily review cap**:
The account-wide maximum number of review units admitted by the queue in one
study day, due reviews first and then new units. Reviews already answered today
count against it. It is an admission budget, not a limit on answering a card
already in the session; unlimited is the default.
_Avoid_: Review limit, daily quota

**Bury**:
A reversible action that hides every review unit of one flashcard until the start
of the next study day in the account time zone. The schedule is unchanged, the
units reappear automatically, and Undo reverses the bury.
_Avoid_: Suspend, snooze, postpone

**Secured**:
The bar a prerequisite flashcard must clear to initially unlock its dependents:
every review unit it generates is in FSRS Review state with stability at or above
the configured floor. A flashcard secures only when all of its review units (e.g.
both directions of a reversed flashcard) are secured.
_Avoid_: Learned, mastered, done

**Earned access**:
A flashcard's permanent eligibility after its prerequisite gate has opened or
study has begun. Later prerequisite lapses do not revoke earned access.
_Avoid_: Currently secured, temporarily unlocked

**Locked flashcard**:
A flashcard without earned access that is not yet ready to study because at
least one active prerequisite is not secured. Its review units are excluded
from review while locked.
_Avoid_: Disabled flashcard, blocked flashcard

**Archived flashcard**:
A flashcard the learner has reversibly set aside: excluded from review and inert
in the prerequisite graph, but still visible in browse and with all content and
history preserved. The reversible counterpart to deletion.
_Avoid_: Suspended, trashed, hidden
