# Armin Privacy Policy

_Last updated: 25 October 2026_

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
- No analytics tools, no advertising trackers, no profiling, no cookies for
  marketing. If that ever changes, this page changes first.
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
your request. **We do not send, sell, or transmit anything to AI providers.**
See the _Provided by others_ section below.

### 4. Technical logs

Our providers keep short-lived request logs (for example IP address, response
code, timestamps) to keep the service secure and fast. We don't buy or install
analytics on top of them, so we can't show you a dashboard of your visits —
nobody's watching in that sense.

### 5. What we never have

We never have credit-card data (Armin is free) and we don't process analytics
or advertising data at all.

## Provided by others

We rely on a small number of companies to run Armin. They process on our
instructions, and we choose them for contractual limits aligned with this
policy. Today's list:

- **Convex** — application and database hosting for our backend, including the
  MCP endpoint (`*.convex.site`).
- **Cloudflare** — serving the web app and the domain `armincards.app`.
- **Resend** — sending our verification and password-reset email.
- **Google** — only if you use Google sign-in (see §1 above).

Two points we want on the record:

- **We do not sell or share your personal data for advertising**, and we do not
  use your content or account records to train machine-learning models.
- **Apple, Google, Anthropic, and OpenAI**, etc. process only what you send
  them directly by using their apps/assistants. For example, if you attach a
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
