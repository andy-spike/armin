# Complimentary Pro walkthrough (2026-11-04)

Local worktree deployment, desktop Chromium via agent-browser, sample account
`test@example.com`, Polar sandbox billing enabled.

1. `convex run billing:setComplimentaryPro '{"email":"test@example.com","enabled":true}'`
   returned `plan: "pro"`.
2. Settings → Billing showed **Pro · Complimentary**, "No subscription needed.
   Up to 100,000 cards…", with no Upgrade or Manage subscription controls
   ([screenshot](2026-11-04-complimentary-pro/billing-complimentary.png)).
3. Running it with `"enabled":false` returned `plan: "free"`; the live page
   switched to **Free** with **Upgrade to Pro**
   ([screenshot](2026-11-04-complimentary-pro/billing-revoked.png)).
4. An unknown email failed with "No account uses nobody@example.com. Sign in
   once first." and changed nothing.
