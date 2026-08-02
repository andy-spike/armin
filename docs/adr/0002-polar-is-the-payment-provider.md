# Polar.sh is the payment provider

Armin takes payments through **Polar.sh**, not Stripe. Stripe is unavailable in
Colombia, where the owner is based; Polar is a payments platform for
developers/open-source projects that supports subscription billing and is
reachable from Colombia.

Consequences: billing code (checkout, subscription lifecycle, webhooks) is built
against Polar's API. A future migration to another provider would touch the
payment integration only; the domain concepts (Subscription, Plan) and the
entitlement checks that consume them stay provider-agnostic.
