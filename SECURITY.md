# Security policy

Armin has web and Expo mobile clients backed by Convex and Better Auth. Study
data and uploaded images belong to an authenticated account's library.

## Reporting a vulnerability

**Don't report security issues through public GitHub issues.** Report privately:

- **Preferred:** GitHub Private Vulnerability Reporting. Open the repository's
  [Security tab](https://github.com/andy-spike/armin/security) and choose
  _Report a vulnerability_.
- **Email:** ansanabria12@gmail.com.

Include, as far as you can:

- The issue and its impact.
- Steps to reproduce, or a proof of concept.
- The Armin version and your operating system.
- Whether it involves authentication, library ownership, uploaded media, or exports.

## What to expect

This is a solo, best-effort project. I'll acknowledge reports as soon as I can,
keep you updated on the fix, and credit you in the release notes unless you
prefer to stay anonymous. Please allow a reasonable window to fix the issue
before disclosing it publicly.

## Areas of interest

- Authentication and session handling in the web and mobile clients.
- Access to another account's library, reviews, images, or exports.
- Content injection through flashcards or uploaded media.
- Exposure of deployment secrets or private user data.
