> Research note. Researched on 2026-10-27 against each provider's own documentation.
> No application code, dependencies, accounts, or credentials were changed.
> Provider eligibility and fees change without notice: re-check the linked page
> before committing. This is not tax or legal advice.

# Payment options for Armin, sold by a Colombian individual

Armin is a free beta today: no plan, no price, no billing code. The only revenue
limits are the beta quotas in
[`packages/backend/convex/model/limits.ts`](../../packages/backend/convex/model/limits.ts)
(200 decks, 2,000 cards, 120 agent writes/hour per connection). The web client
runs on Cloudflare Workers, the backend on Convex, and the Expo client is not yet
in the App Store or Play Store.

The seller is one person: a **persona natural** in Colombia, no SAS, no US entity.
That single constraint removes the default answer for most SaaS projects.

## Short answer

1. **Stripe is not available to a Colombian account.** Colombia is not on
   [Stripe's global availability list](https://stripe.com/global), which covers 46
   countries ([Stripe's own wording](https://stripe.com/use-cases/global-businesses)).
   Stripe Billing, Stripe Tax, and Stripe Managed Payments all inherit that gate.
2. **Use a merchant of record (MoR) for the global product.** Paddle is the safest
   default (Colombia is not on
   [Paddle's unsupported-seller list](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle),
   individuals are explicitly supported, 200+ buyer countries, PayPal and local
   methods). Dodo is the value challenger with the broadest method list; Creem is
   cheaper but cards-and-wallets only; Polar and Lemon Squeezy are backups. The MoR
   is the legal seller: it charges the customer, handles VAT/GST/sales tax, refunds,
   and chargebacks, and pays you a net amount, so Armin never registers for tax in
   30 countries.
3. **Judge every option by global coverage, not by the headline fee.** A gateway
   that only settles in COP is useless when the buyers are in Berlin, São Paulo,
   and Seoul. What matters is which countries can pay, in which currency, with
   which local method, and who remits the tax.
4. **Do not build app-store billing yet.** The Expo app is not distributed; when it
   is, digital subscriptions must go through in-app purchase (15% under the Small
   Business Program) or the app can simply let an existing subscriber sign in.
5. **Bill yearly by default.** At a $5 monthly price, the fixed per-transaction fee
   eats 8–10% of revenue; yearly billing cuts the blended fee roughly in half.

## How the money would flow

```mermaid
flowchart LR
  U[Customer abroad] -->|card / local method| M[Merchant of record]
  M -->|tax| T[Tax authorities abroad]
  M -->|net payout, USD or COP| B[Your Colombian bank account]
  M -->|signed webhook| K[Convex HTTP action]
  K -->|plan + period| D[(Convex: entitlements)]
  U -->|signs in| W[Armin web / Expo]
  W -->|reads plan| D
```

The whole integration surface is: a hosted checkout redirect, one webhook endpoint,
one entitlements table, and a "manage subscription" link. Everything else (tax,
invoices, dunning, disputes) is the MoR's job.

## Option comparison for a global product

Fees are the published all-in rate for a card payment. MoRs charge on the gross
amount including tax, so a 19% VAT sale costs slightly more than the percentage
suggests, and international-card surcharges (where they exist) appear in the fee
table below. "Colombian individual" means a natural person with no registered
company, verified with a cedula/passport and a personal bank account.

| Option                                                     | Who is the seller | Colombian individual                                                                                                                                                                                                                                        | Buyer coverage                                                                           | Non-card / local methods                                                                                                                                                                                           | Price localization                                                       | Fee (published)                                                                                                     | Payout to Colombia                                              | Fit for a global launch                                                                                                                |
| ---------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Paddle**                                                 | Paddle            | Yes ([not on unsupported list](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle); [no business verification for individuals](https://www.paddle.com/help/start/account-verification/what-is-account-verification)) | [200+ countries](https://developer.paddle.com/concepts/sell/supported-countries-locales) | PayPal, iDEAL/Wero, Bancontact, BLIK, MB WAY, Pix, UPI, Alipay, WeChat, Korean wallets and cards, wire ([full list](https://developer.paddle.com/concepts/payment-methods))                                        | Country-specific prices plus automatic currency conversion, COP included | [5% + $0.50](https://www.paddle.com/pricing)                                                                        | Monthly, min $100, wire (USD, ~$15 SWIFT) or Payoneer           | **Best default**: widest method mix with the least tax work; one-month payout lag                                                      |
| **Dodo Payments**                                          | Dodo              | Yes ([accepted countries](https://docs.dodopayments.com/miscellaneous/accepted-countries-and-territories))                                                                                                                                                  | [220+ countries](https://docs.dodopayments.com/introduction)                             | [40+ methods](https://docs.dodopayments.com/features/payment-methods): iDEAL, Bancontact, BLIK, EPS, Multibanco, Pix, UPI, Klarna, Afterpay, Korean wallets, Alipay HK, GCash, stablecoins; PayPal temporarily off | Adaptive currency in 80+ currencies                                      | [4% + $0.40, +1.5% intl cards, +0.5% subscriptions](https://dodopayments.com/pricing)                               | Bi-monthly, $50 minimum                                         | **Value challenger**: cheapest broad-coverage option at low prices; youngest provider                                                  |
| **Creem**                                                  | Creem             | Yes ([Colombia listed, bank-partner restriction flagged](https://docs.creem.io/merchant-of-record/supported-countries))                                                                                                                                     | [190+ countries for tax](https://docs.creem.io/getting-started/introduction)             | Cards, Apple Pay, Google Pay only ([methods](https://docs.creem.io/merchant-of-record/finance/payment-methods)); PayPal "coming soon"                                                                              | Charged in the customer's currency                                       | [3.9% + $0.40](https://www.creem.io/pricing)                                                                        | 1st and 15th, min $50, bank transfer ($7 or 1%) or USDC         | Lowest fee, but cards-only checkout will cost conversions in Europe, Brazil, and India                                                 |
| **Polar**                                                  | Polar             | Yes ([Colombia on the payout list](https://polar.sh/docs/merchant-of-record/supported-countries))                                                                                                                                                           | Global except sanctioned countries                                                       | Cards, Apple/Google Pay, Link, Amazon Pay (US/DE), Cash App, WeChat, iDEAL, Bancontact, EPS, UPI, Korean wallets; **no PayPal** ([methods](https://polar.sh/docs/features/checkout/payment-methods))               | Per-product currency                                                     | [5% + $0.50 Starter, +1.5% non-US cards](https://polar.sh/docs/merchant-of-record/fees)                             | Stripe Connect Express, manual withdrawals                      | Good developer fit; no PayPal and thinner local coverage                                                                               |
| **Lemon Squeezy**                                          | Lemon Squeezy     | Yes ([COP bank payouts](https://docs.lemonsqueezy.com/help/getting-started/supported-countries))                                                                                                                                                            | Global except the unsupported list                                                       | 16 methods including PayPal ([fees](https://docs.lemonsqueezy.com/help/getting-started/fees))                                                                                                                      | 95 currencies                                                            | 5% + $0.50, +1.5% intl, +0.5% subscriptions                                                                         | Twice monthly, 13-day hold, $50 min                             | Solid today, but being absorbed into Stripe Managed Payments, which [excludes Colombia](https://www.lemonsqueezy.com/blog/2026-update) |
| **Gumroad**                                                | Gumroad           | Yes (COP payouts, min COP 140,000)                                                                                                                                                                                                                          | Global                                                                                   | Cards and PayPal                                                                                                                                                                                                   | Local payout currency only                                               | [10% + $0.50 plus card processing](https://gumroad.com/pricing)                                                     | Weekly-ish, per-market minimums                                 | ~25-29% on a $5 sale; only for a one-off supporter purchase                                                                            |
| **Apple / Google in-app purchase**                         | Apple / Google    | Yes ([Apple individual, $99/yr](https://developer.apple.com/help/account/membership/program-enrollment/); [Play merchant registration](https://support.google.com/googleplay/android-developer/answer/7161440))                                             | Worldwide storefronts                                                                    | Store wallets, carrier billing, local methods per storefront                                                                                                                                                       | Store price tiers per country                                            | 15% with the [Small Business Program](https://developer.apple.com/app-store/small-business-program/), 30% otherwise | Apple: COP bank, min $100, ~45 days. Google: USD wire, min $100 | Mandatory only for digital sales _inside_ a store-distributed app; not a web strategy                                                  |
| **Stripe via a US LLC**                                    | Your LLC          | Only by incorporating in the US                                                                                                                                                                                                                             | 195+ countries                                                                           | Stripe's full method catalogue                                                                                                                                                                                     | Full control                                                             | 2.9% + $0.30, plus Billing, Tax, and your own registrations                                                         | USD to a US business account                                    | Best coverage and DX, but you own worldwide VAT/GST/sales-tax registration and filing                                                  |
| **Colombian gateways** (Mercado Pago, Wompi, ePayco, PayU) | You               | Yes, persona natural                                                                                                                                                                                                                                        | Colombia only; Wompi accepts foreign cards but only in COP                               | PSE, Nequi, Daviplata, Efecty, Bancolombia button, cash                                                                                                                                                            | COP only                                                                 | 2.6-3.5% + COP 690-900 + IVA, plus retenciones at ePayco                                                            | COP, days                                                       | Not a global checkout; at most an add-on so Colombian customers can pay locally                                                        |
| **PayPal (standalone)**                                    | You               | Yes ([COP withdrawals COP 3,500](https://www.paypal.com/co/digital-wallet/paypal-consumer-fees))                                                                                                                                                            | 200+ markets                                                                             | PayPal balance, cards                                                                                                                                                                                              | Buyer's currency                                                         | ~3.4% + fixed, plus 3.5-4.5% conversion                                                                             | COP 3,500 per withdrawal                                        | Useful as an extra button, not as the billing system: no dunning, proration, or tax handling                                           |

### What "international" changes

- **Coverage is the first filter, not the fee.** Mercado Pago, Wompi, ePayco, and
  PayU can only charge in COP with Colombian rails, so they cannot serve the
  product's actual audience. They are an optional local add-on, not the checkout.
- **Local methods and PayPal are conversion features.** Cards-only is the most
  common reason a European or Brazilian buyer abandons. Paddle, Dodo, and Lemon
  Squeezy ship PayPal and local rails; Creem and Polar do not (yet).
- **Presentment currency matters.** Auto-converting a USD price to EUR, GBP, BRL,
  or INR measurably helps; all three broad MoRs do it, with country-level price
  overrides where you want them.
- **Tax registration drift is the real risk.** Selling worldwide without an MoR
  means EU OSS, UK VAT, and US state sales-tax registrations - the work grows with
  success, which is exactly when you have no time for it.
- **The MoR also absorbs EU withdrawal rights, B2B VAT invoices, and dunning.**
  Those are three small features that each cost a week of engineering otherwise.

## What the fee actually costs on this product

Assumes a $5/month price or a $48/year price, an international (non-US) card, and
no tax in the base. MoRs charge on the tax-inclusive amount, so add roughly the
customer's tax rate to the real cost.

| Provider                                          | Fee on $5 monthly | Effective | Fee on $48 yearly | Effective |
| ------------------------------------------------- | ----------------- | --------- | ----------------- | --------- |
| Creem                                             | $0.60             | 11.9%     | $2.27             | 4.7%      |
| Dodo (4% + 1.5% intl + 0.5% subscription + $0.40) | $0.70             | 14.0%     | $3.28             | 6.8%      |
| Paddle                                            | $0.75             | 15.0%     | $2.90             | 6.0%      |
| Polar Starter (+1.5% intl)                        | $0.83             | 16.5%     | $3.62             | 7.5%      |
| Lemon Squeezy (+1.5% intl, +0.5% subscriptions)   | $0.85             | 17.0%     | $3.86             | 8.0%      |
| Gumroad (10% + $0.50 + 2.9% + $0.30)              | $1.45             | 28.9%     | $6.99             | 14.6%     |
| Apple / Google (15%)                              | $0.75             | 15.0%     | $7.20             | 15.0%     |

A Colombian buyer paying in COP through a local gateway costs 7-10% at the same
ticket size, but you take on the seller role and the buyer has to be in Colombia.

Three conclusions:

- The spread between MoRs at this price point is about four points. The gap
  between offering PayPal and local methods and not offering them is larger than
  that, because it decides whether the sale happens at all.
- Yearly billing more than halves the percentage fee, and it matches how people use
  a spaced-repetition app: a semester, not a month.
- Cards-only providers can look cheapest per transaction and be the most expensive
  per customer.

### Pricing the international catalogue

- **USD is the base price.** Australian, Canadian, and most Asian buyers are used
  to seeing USD; the MoR converts the rest automatically.
- **Set explicit EUR and GBP prices** (for example 5 EUR and 4 GBP) instead of letting a
  straight conversion land on 4.63 EUR. Round numbers convert better and are
  expected in those markets.
- **Show tax-inclusive prices in the EU and UK**, tax-exclusive in the US and
  Canada. Both Paddle and Dodo resolve this from the billing address.
- **Discount for purchasing power where it matters** (Brazil, India, Turkey) with a
  country price rather than a coupon, so the checkout stays one click.
- **Anchor annual.** A 40-48 USD yearly price against 5-6 USD monthly keeps the
  fee under 7% and matches a semester of study.
- **Colombian buyers** pay USD at their card's exchange rate by default; a COP
  price only becomes worthwhile with a local gateway.

## Recommendation

**Primary: Paddle, with Dodo as the fee challenger and Creem only if you accept a
cards-only checkout.**

Reasons for Paddle over the others:

- It is a real MoR: no tax registrations abroad, buyer invoices, or chargeback
  defence for a one-person operation.
- Individuals are a supported account type, and business registration documents
  are explicitly not required for them.
- Colombia is not on the unsupported-seller list, and payouts reach Colombian
  banks by wire or Payoneer.
- It covers 200+ buyer countries with PayPal, iDEAL/Wero, Bancontact, BLIK, Pix,
  UPI, Alipay, WeChat, and the Korean wallets — the method mix that turns a global
  audience into paying customers.
- It auto-converts to local currencies and supports country-specific prices, so
  the same catalogue can show USD to a US buyer and EUR to a German one.
- Armin is consumer software, which fits Paddle's acceptable-use policy (no
  physical goods, no human services, no donations).

The trade-offs to accept: 5% + $0.50, monthly payouts with a one-month lag, and a
website that must show pricing, terms, privacy, and a refund policy before
approval. Armin already has [terms](../../apps/web/src/routes/terms.tsx) and
[privacy](../../apps/web/src/routes/privacy.tsx); a pricing page is missing.

**Run a two-week checkout comparison with Dodo if fee drag matters.** It is a
third cheaper than Paddle per transaction (4% + $0.40 versus 5% + $0.50), covers
220+ countries, carries the widest local-method list of any option here, and pays
out twice a month. The reason it is not the default is maturity: fewer years, a
smaller support surface, PayPal temporarily disabled. Because both Paddle and Dodo
are hosted-checkout MoRs, testing one and switching the other costs a webhook URL
and a product id, not a rewrite.

**Creem is the cheapest per transaction (3.9% + $0.40) but only if cards and
wallets are enough.** For a global launch they usually are not: no PayPal, and no
local rails in the markets where cards underperform.

**Do not build your own international checkout.** Any combination of Stripe (via
a US entity) plus your own VAT/sales-tax registration is a year-two problem, not a
beta problem: the compliance surface grows with revenue, exactly when engineering
time is scarcest.

**Add later, only if Colombia becomes a real segment: Mercado Pago.** Its
Subscriptions API gives you a COP plan with local methods and settles in days, and
a persona natural can open the account with a cédula and a Colombian bank account.
Do not add it in the first release: it doubles the webhook surface, the entitlement
states, and the reconciliation work, and it cannot serve buyers outside Colombia.

**Mobile: no in-app purchase until the app is in a store.** If and when it ships,
the cheapest compliant setup is:

- sell on the web (MoR), and let the app say "already subscribed? sign in" — allowed
  for multi-platform services, with no link out;
- if you do sell inside the app, enrol in the Small Business Program (15%) and
  expect a second, store-specific price catalogue.

**Do not pursue Stripe via a US LLC now.** Atlas plus a registered agent plus
annual US filings (Form 5472 with a $25,000 penalty for a missed filing) is more
fixed cost and admin than a free beta can justify. Revisit above roughly $10k/month
of revenue, when 3% versus 5% starts to matter and an accountant is already in
place.

## Colombian side: what the individual has to do

Not tax advice — the point is to know which questions to ask, and to see why the
MoR route is simpler than being the seller yourself.

| Item                  | What applies                                                                                                                                                                                                                                                                                           | Why it matters here                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| RUT                   | Register the economic activity (software/digital services CIIU) with your cédula                                                                                                                                                                                                                       | Every gateway and MoR payout asks for it; needed to invoice the MoR                     |
| Export of services    | Sales through an MoR are an export: exempt/0% VAT when the service is used exclusively abroad by a party with no business in Colombia (art. 481 lit. c E.T.)                                                                                                                                           | Avoids charging 19% VAT on a global SaaS; keep the MoR contract and invoices as support |
| Exporter registration | To claim the export treatment, the RUT needs the exporter-of-services fields (responsibility 48 + 19, customs user 10, export type "services", cross-border mode), per [Decreto 2223/2013 and DIAN Concepto 8660/2024](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_8660_2024.htm) | This is the step people miss; without it the 0% rate is contestable                     |
| VAT responsibility    | Not responsible below 3,500 UVT with the other art. 437 conditions met — 3,500 × COP 52,374 = **COP 183.3M** for 2026 ([UVT 2026](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000238%20de%2015-12-2025.pdf))                                                                   | At beta scale you likely stay under this; crossing it changes pricing and invoicing     |
| Electronic invoicing  | Required when VAT-responsible, in SIMPLE, or above 3,500 UVT ([DIAN](https://www.dian.gov.co/impuestos/factura-electronica/como-hacerlo/Paginas/ser-facturador-electronico.aspx))                                                                                                                      | In practice: invoice the MoR (export) rather than thousands of consumers                |
| Income tax            | Business income ("rentas no laborales"); annual return once thresholds are met (1,400 UVT ≈ COP 73.3M with the 2026 UVT)                                                                                                                                                                               | MoR payouts land as gross income, not profit; keep fee and FX records                   |
| SIMPLE vs ordinary    | SIMPLE group 3 (professional services) runs 5.9%–14.5% consolidated after [Sentencia C-540/2023](https://micrositios.dian.gov.co/regimen-simple-tributacion/preguntas-frecuentes/)                                                                                                                     | Worth modelling with an accountant once revenue is real; SIMPLE also forces invoicing   |
| FX and bank fees      | Payouts arrive in USD (wire) or are converted by the MoR; the 4×1,000 GMF applies to local movements                                                                                                                                                                                                   | A USD account at a Colombian bank or a Payoneer/Wise layer reduces conversion loss      |
| US tax form           | MoRs and Apple/Google ask for a W-8BEN as a foreign individual                                                                                                                                                                                                                                         | Straightforward; keep the treaty/residence answers consistent across providers          |

One more consequence of the MoR model: **your customers are the MoR's customers**.
You see net payouts and a subscription list, not card data, and refunds and
chargebacks are handled for you. That is the trade you are making for the 5%.

## Integration sketch for this codebase

Small enough to keep inside the existing architecture:

1. **Entitlements in Convex.** A `plans` row per account: provider, customer id,
   subscription id, status, `currentPeriodEnd`, and the plan key. Queries that
   already enforce beta quotas read it instead of the constants.
2. **One HTTP action** in `packages/backend/convex/http.ts` (it already registers
   the agent routes and media routes) for the webhook: verify the signature, dedupe
   on event id, then call a single mutation that upserts the entitlement. Portal and
   checkout URLs are created in an action, never in the client.
3. **Web:** a `/pricing` route, a "Manage subscription" link in Settings that opens
   the MoR customer portal, and a "restore purchase" path for the app.
4. **Mobile:** no store kit in the first pass; show plan status and a link-free
   "subscribe on the web" instruction (store policies differ per storefront, so
   check the current rules before adding any link).
5. **Gating:** reuse the existing limits. A sensible split is free = 5 decks /
   300 cards; paid = the current 200 / 2,000 caps plus higher agent write limits.
   Nothing in the schema needs to change to enforce this beyond reading the plan.
6. **Failure modes to design for:** webhook retries, out-of-order events, a lapsed
   subscription during a review session (grace period), and refunds that must not
   delete study data.

## What to verify before committing

Ask each provider these, in writing, before building:

- Does an individual (not a company) with a Colombian cédula pass KYC, and is the
  payout account required to be in my own name?
- Is a spaced-repetition study SaaS inside the acceptable-use policy (education /
  consumer software, no physical goods, no human services)?
- Which countries can buyers pay from, and which are blocked by sanctions or
  partner policy? (Ask for the API endpoint or page you can re-check later.)
- Which payment methods are actually shown per market — cards only, or PayPal,
  iDEAL/Wero, Bancontact, Pix, UPI, Alipay, Korean wallets?
- Can I set country-specific prices and presentment currencies, and does the
  checkout show tax-inclusive prices where local convention expects it?
- Which tax jurisdictions do you file and remit in, and what do I still owe the
  DIAN on an export of services?
- Which payout rails reach Colombia, in which currency, with which fee and minimum?
- What is the refund and chargeback policy, and who absorbs the loss? Do you handle
  the EU 14-day withdrawal right and B2B VAT invoices?
- What do you need on the website before approval (pricing page, refund policy,
  terms, contact)?
- Is there a sandbox with test cards, and does it emit the same webhook events as
  production?

## Sources

Stripe: [global availability](https://stripe.com/global), [46 countries](https://stripe.com/use-cases/global-businesses).
Paddle: [unsupported seller countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle), [individual verification](https://www.paddle.com/help/start/account-verification/what-is-account-verification), [pricing](https://www.paddle.com/pricing), [payouts](https://www.paddle.com/help/start/intro-to-paddle/when-and-how-do-i-get-paid), [accepted countries and currencies](https://developer.paddle.com/concepts/sell/supported-countries-locales).
Paddle methods: [payment methods](https://developer.paddle.com/concepts/payment-methods), [supported countries and currencies](https://developer.paddle.com/concepts/sell/supported-countries-locales).
Creem: [supported countries](https://docs.creem.io/merchant-of-record/supported-countries), [pricing](https://www.creem.io/pricing), [payouts](https://docs.creem.io/merchant-of-record/finance/payouts), [payment methods](https://docs.creem.io/merchant-of-record/finance/payment-methods).
Polar: [supported countries](https://polar.sh/docs/merchant-of-record/supported-countries), [fees](https://polar.sh/docs/merchant-of-record/fees), [payout accounts](https://polar.sh/docs/features/finance/accounts), [payment methods](https://polar.sh/docs/features/checkout/payment-methods).
Dodo: [accepted countries](https://docs.dodopayments.com/miscellaneous/accepted-countries-and-territories), [pricing](https://dodopayments.com/pricing), [payment methods](https://docs.dodopayments.com/features/payment-methods), [countries for buyers](https://docs.dodopayments.com/miscellaneous/list-of-countries-we-accept-payments-from).
Lemon Squeezy: [supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries), [fees](https://docs.lemonsqueezy.com/help/getting-started/fees), [2026 status update](https://www.lemonsqueezy.com/blog/2026-update).
Gumroad: [fees](https://gumroad.com/help/article/66-gumroads-fees), [payouts by country](https://gumroad.com/help/article/13-getting-paid).
Mercado Pago: [checkout fees](https://www.mercadopago.com.co/herramientas-para-vender/check-out), [subscriptions](https://www.mercadopago.com.co/developers/es/docs/subscriptions/overview).
Wompi: [plans and fees](https://www.wompi.com/es/co/planes-tarifas/), [account requirements](https://wompi.com/es/co/ayuda/como-crear-cuenta), [payment methods and recurring](https://docs.wompi.co/docs/colombia/metodos-de-pago/).
ePayco: [fees](https://epayco.com/tarifas/), [recurring billing](https://epayco.com/fonts/doc/recurrent_billing/).
PayU: [account and fees](https://ecommerce.payulatam.com/crear-cuenta/col/canales/adwords-display/index.html).
PayPal: [consumer fees, Colombia](https://www.paypal.com/co/digital-wallet/paypal-consumer-fees).
Apple: [individual enrollment](https://developer.apple.com/help/account/membership/program-enrollment/), [Small Business Program](https://developer.apple.com/app-store/small-business-program/), [minimum payment thresholds](https://developer.apple.com/help/app-store-connect/reference/minimum-payment-threshold/), [EU payment options](https://developer.apple.com/support/payment-options-on-the-app-store-in-the-eu/).
Google: [supported locations](https://support.google.com/googleplay/android-developer/answer/9306917), [Colombia merchant bank details](https://support.google.com/googleplay/android-developer/answer/7161440), [wire payouts](https://support.google.com/googleplay/android-developer/answer/2700656).
DIAN: [UVT 2026](https://www.dian.gov.co/normatividad/Normatividad/Resoluci%C3%B3n%20000238%20de%2015-12-2025.pdf), [electronic invoicing](https://www.dian.gov.co/impuestos/factura-electronica/como-hacerlo/Paginas/ser-facturador-electronico.aspx), [VAT responsibility thresholds](https://www.dian.gov.co/atencionciudadano/contactenos/Annimos%20PQRS/Respuesta-2026DP000161206-2026.pdf), [exporter-of-services RUT registration](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_8660_2024.htm), [SIMPLE rates](https://micrositios.dian.gov.co/regimen-simple-tributacion/tarifas-rst/).
