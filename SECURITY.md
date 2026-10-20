# Security policy

Armin has web and Expo mobile clients backed by Convex and Better Auth.
Study data and uploaded images belong to an authenticated account's library.

## Reporting a vulnerability

**Please do not report security issues through public GitHub issues.**

Report privately through either channel:

- **Preferred — GitHub Private Vulnerability Reporting.** Open the repository's
  [Security tab](https://github.com/andy-spike/armin/security) and use
  _"Report a vulnerability."_ This keeps the report private and lets us coordinate
  a fix and advisory.
- **Email fallback.** If you would rather not use GitHub, email
  **ansanabria12@gmail.com** with details.

Please include, as far as you can:

- A description of the issue and its impact.
- Steps to reproduce, or a proof of concept.
- The Armin version and your operating system.
- Whether it involves authentication, library ownership, uploaded media, or exports.

## What to expect

This is a solo, best-effort project. I'll acknowledge reports as soon as I
reasonably can, keep you updated on the fix, and credit you in the release notes
unless you prefer to stay anonymous. Please give a reasonable window to address the
issue before any public disclosure.

## Scope notes

Areas of particular interest:

- Authentication and session handling in the web and mobile clients.
- Access to another account's library, reviews, images, or exports.
- Content injection through flashcards or uploaded media.
- Exposure of deployment secrets or private user data.
