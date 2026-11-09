export function isSelfHosted() {
  return process.env.SELF_HOSTED === "true";
}
