/**
 * A self-hosted personal instance (`SELF_HOSTED=true`, set by selfhost/setup.sh).
 * It has one owner account: no email service, no verification step, and
 * sign-up closes once that account exists. See docs/self-hosting.md.
 */
export function isSelfHosted() {
  return process.env.SELF_HOSTED === "true";
}
