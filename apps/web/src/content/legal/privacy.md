# Armin Privacy Policy

_Last updated: 11 November 2026_

This policy explains what personal data Armin handles, why, how long we keep it,
and what you can do about it. It covers all of Armin: the web app at
[armincards.app](https://armincards.app), the mobile app, the Armin MCP server
that study-assistant plugins and coding agents connect to, and the plugins that
connect them.

**Armin** is a spaced-repetition flashcard service operated by an individual
developer based in Colombia ("we", "us"). There is no corporation involved. If
the law in your country calls the person responsible a "data controller", that
person is us. Contact: **support@armincards.app**.

## The short version

- Your flashcards are yours. We host them, we don't look at them, mine them,
  share them, or sell them. We don't use them to train AI.
- We collect the minimum needed to run a study service: an account (an email),
  the study data you create, and the technical logs our hosting providers keep.
  If you buy Pro, Polar handles the payment; we only keep your plan's status.
- The web app asks before it sets an analytics cookie. Allow it and PostHog
  links your visits; decline and visits are only counted, without a cookie.
  Card content is never sent to analytics. No advertising trackers, no
  profiling, no cookies for marketing.
- Connecting an AI app (Claude, ChatGPT, Codex, Claude Code) is a choice you
  make. Your assistant, not Armin, decides what it sends to the AI provider.
  You can revoke access at any time.
- Deleting your account ends access immediately and removes your data shortly
  after. You can also export everything as a ZIP, whenever you like.

## What we handle, and why

### 1. Your account

To use Armin you create an account. Depending on how you sign up we handle:

| Data                                                                        | Why                                                                                                          | Used by                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Email address                                                               | Your login, email verification (writes require a verified email), password resets, essential service notices | Stored in our database; **Resend** delivers our transactional email |
| Password                                                                    | Only if you sign up with email (hash of it, never the password itself)                                       | Stored in our database                                              |
| Your name and, if you sign in with Google, the profile basics Google shares | So we can create and identify your account                                                                   | From **Google**'s sign-in, into our database                        |

We ask for email verification because card writes and exports are
account-specific and a wrong address means an unrecoverable account.

### 2. Your study content

Cards, decks, libraries, review records, review schedules, prerequisite links,
and any images you upload. This is the whole point of the service: we store it
so you can study on the web and on your phone, and so a connected assistant can
help you author or review cards if you allow that.

We treat study content as confidential. Humans at Armin do not read it except
to run the service (handling backups, recovery, tracing a bug you reported) or if the law
requires it.

### 3. Agent and assistant connections

When you connect Claude, ChatGPT, Codex or Claude Code, we create and handle:

- An authorization grant: which app is connected to which library, when you
  approved it, and what it can do. You can see and revoke this in your account.
- The tokens issued to that app, and technical records of the token and tool
  calls made under it (needed for access control and abuse prevention).

That consent is entirely different from the AI itself. Here is precisely how it
works: your assistant reads content **you choose there** (e.g. the notes in your
chat) and calls Armin's tools to create or review cards. Nothing in your Armin
account flows to Anthropic or OpenAI unless your assistant sends it as part of
your request. **Apart from concept cards (§7), we do not send anything to AI
providers, and we never sell to them.** See the _Provided by others_ section
below.

### 4. Technical logs

Our providers keep short-lived request logs (for example IP address, response
code, timestamps) to keep the service secure and fast.

### 5. Payments, if you buy Pro

Pro is sold through **Polar**, our merchant of record (see "Provided by
others"). When you upgrade, we send Polar your account email and an internal
account ID so your purchase is linked to your account. Polar collects your
payment details, billing name, and country or address to charge you and
handle tax. From Polar we keep only your subscription's status: the plan,
billing interval, price, renewal or end date, and whether it's cancelled. We
use that to apply your plan's limits and show it in Settings → Billing.

### 6. Analytics and error reports

The web app uses **PostHog** to count visits and to report errors so we can fix
them. The mobile app and the MCP server don't use it. The first time you visit,
a banner asks whether to allow an analytics cookie. You can change your answer
any time in Settings → Account → Privacy.

- **If you allow it**, PostHog stores a random ID in a cookie and in your
  browser's local storage so visits link up. Once you're signed in, we tie that
  ID to your internal Armin account ID, never to your email or name.
- **If you decline**, nothing is stored in your browser. PostHog still counts
  page views and errors without a cookie, using a hash it computes on its
  servers that changes every day, so visits can't be linked to you over time.
- **Until you answer**, nothing is sent.

Either way, PostHog receives the page address without its query string,
coarse browser and device details, the position of what you click, and the
technical details of errors. It never receives the text on the page, the
contents of fields, or your cards. Session recording is off.

When one of our backend functions fails, our hosting provider reports the error
and its stack trace to PostHog, tagged with your internal account ID. We use
these reports only to find and fix bugs.

### 7. Concept cards, if you use them

Concept cards are a Pro feature that writes new exercises for a concept. To
generate them, we send that concept card's brief, its example, and the
exercises it already has to **Vercel AI Gateway**, which passes them to
**Anthropic**'s Claude model. Nothing else from your library is sent, and only
when you generate exercises for a concept card.

### 8. What we never have

We never have your card number or other payment-card data — Polar and its
payment processor handle those — and we don't process advertising data at all.

## Provided by others

We rely on a small number of companies to run Armin. They process on our
instructions, and we choose them for contractual limits aligned with this
policy. Today's list:

- **Convex** — application and database hosting for our backend, including the
  MCP endpoint (`*.convex.site`).
- **Cloudflare** — serving the web app and the domain `armincards.app`.
- **Resend** — sending our verification and password-reset email.
- **Polar** — selling Pro as merchant of record: checkout, payment processing
  (through Stripe), sales tax, receipts, invoices, and the subscription
  management portal. Polar is the seller of record for your purchase, so it
  also processes your payment data under its own privacy policy and keeps
  transaction records as tax law requires. Only if you buy Pro.
- **Google** — only if you use Google sign-in (see §1 above).
- **PostHog** (United States) — web analytics and error reports, as described
  in §6.
- **Vercel AI Gateway** and **Anthropic** — generating exercises for concept
  cards. They receive the concept card's brief, its example, and its earlier
  exercises. Only if you have Pro and use concept cards (see §7).

Two points we want on the record:

- **We do not sell or share your personal data for advertising**, and we do not
  use your content or account records to train machine-learning models.
- Apart from concept cards (§7), **Apple, Google, Anthropic, and OpenAI**,
  etc. process only what you send them directly by using their apps/assistants. For example, if you attach a
  lesson PDF to a ChatGPT conversation and ask it to make cards, ChatGPT's own
  privacy rules govern that PDF — Armin never touches it (Armin's MCP server
  only watches the tool calls, and keeps only their inputs as part of the card
  you asked it to create). Read those services' privacy policies to decide what
  you're comfortable sending them.

## Keeping data

We keep your data while your account exists. When you delete your account:

1. Access ends immediately. Any app connected through the MCP server loses its
   grants the same instant; the account is unusable from that moment.
2. Content (cards, images, reviews, account records) is removed shortly after,
   in cleanup batches the system runs automatically.
3. Hosting-provider access logs expire on their own schedule, typically within
   a few weeks.
4. If you had Pro, any active subscription is cancelled. We keep a small
   billing record — the internal account ID and the fact that the account was
   deleted, without your email or study data — so that a payment still in
   progress can't restart a subscription for a deleted account. Polar keeps
   its own transaction records for as long as tax law requires.

We keep a copy of a cancellation/notice act where a law requires it
(e.g. a dispute, an investigation) for as long as that law says, and nothing
more.

## Your rights

Wherever you live, you can:

- **Export.** Download your whole library as a ZIP from your account page.
- **See and edit.** All content is editable in the app, and the app is the
  place to correct what's wrong.
- **Delete.** Delete individual items, or your whole account.
- **Revoke.** Disconnect any assistant or agent you connected.

If you're in the EU, the UK, or Colombia, you additionally have statutory data
rights (access, correction, erasure, objecting to processing, portability,
withdrawing consent — and, in Colombia, rights under Law 1581 of 2012 "habeas
data"). We honor all of them. Write to **support@armincards.app** and we'll
answer within 30 days.

If you are unhappy with our answer, you can complain to your local data-protection
authority; in Colombia, to the Superintendencia de Industria y Comercio.

## Security

Everything moves over HTTPS. Accounts are isolated from one another at the
application level, and agent access is re-checked on every call. We can't promise
absolute security. If a breach ever affects you, you'll hear it from us first.

## Children

Armin is for people 13 and over (16 where your country requires that for consent
to personal-data processing, including most of the EU/UK). It is a consumer
service: **we don't provide accounts to schools or manage classroom accounts**.
If you learn that someone under those ages has an account, either delete it or
write to **support@armincards.app** and we'll delete it.

## Changes

If we make a material change to this policy, we tell you by email to your
account address at least 14 days before it takes effect, and we post it here
with a new date. What applied when an action happened does not change
retroactively. If you disagree with a change, delete your account — that always
remains available.

## Contact

**support@armincards.app** — one mailbox, read by the developer who built and
operates Armin.
