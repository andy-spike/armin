# Armin

Armin is a hosted, multi-user spaced-repetition web app for building durable,
hierarchical knowledge through flashcards, decks, reviews, and prerequisite
relationships.

## Language

**User**:
The authenticated person who owns a study space and is the billing entity.
_Avoid_: Account (see below), profile, login

**Study space**:
The single collection of study data owned by exactly one User: decks,
flashcards, schedule, settings, and media. The counterpart of the old local
"Profile" concept, now hosted and always accessible.
_Avoid_: Profile, library, workspace

**Subscription**:
The paid relationship between a User and Armin. One User, one subscription; it
grants access to the paid plan's features. There are no organizations, seats,
invitations, or shared study spaces. Billing runs through Polar.sh.
_Avoid_: Plan (the offering, not the relationship), account, membership

**Plan**:
A named product offering a User can subscribe to. There are exactly two: a free
tier and one paid plan ($5/month). All study features are free on both; the free
tier is bounded only by a media-storage quota, and the paid plan adds AI
capabilities. Distinct from the Subscription, which is the User's live
relationship to a Plan.
_Avoid_: Tier, package

**AI feature**:
Any capability of the paid plan powered by a large language model. The paid plan
adds AI features and nothing else; the free tier keeps every study feature.
_Avoid_: Copilot, assistant, magic

**AI allowance**:
The monthly quota of AI operations included in a paid Subscription. Consumed per
AI feature use (a generation, an explanation, an improvement), not per token.
There is no unlimited-AI promise.
_Avoid_: Credits, tokens, usage

**Card generation**:
An AI feature that drafts flashcards or a whole deck from a prompt or pasted
source material. The User edits the result before saving.
_Avoid_: Autopilot, magic import

**AI explanation**:
An AI feature that answers "explain this to me" on demand — during review, on a
flashcard, or while browsing — to give context around the material being studied.
_Avoid_: Tutor, hint

**Card improvement**:
An AI feature that suggests concrete edits to an existing flashcard: clearer
phrasing, better cloze deletions, or missing prerequisite relationships.
_Avoid_: Polish, review suggestions

## Study

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
to exactly one Study Space and is part of that Study Space's data.
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
daily capacity for new material, not a per-deck budget.
_Avoid_: Backlog, new queue

**Secured**:
The bar a prerequisite flashcard must clear before it unlocks its dependents:
every review unit it generates is in FSRS Review state with stability at or above
the configured floor. A flashcard secures only when all of its review units (e.g.
both directions of a reversed flashcard) are secured.
_Avoid_: Learned, mastered, done

**Locked flashcard**:
A flashcard that is not yet ready to study because at least one prerequisite is
not yet secured. Its review units are excluded from review while locked.
_Avoid_: Disabled flashcard, blocked flashcard

**Archived flashcard**:
A flashcard the learner has reversibly set aside: excluded from review and inert
in the prerequisite graph, but still visible in browse and with all content and
history preserved. The reversible counterpart to deletion.
_Avoid_: Suspended, trashed, hidden
