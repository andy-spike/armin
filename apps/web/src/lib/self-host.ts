/**
 * Built as a self-hosted personal instance (`VITE_SELF_HOSTED=true`, set by
 * the selfhost/ Docker build). See docs/self-hosting.md.
 */
export const selfHosted = import.meta.env.VITE_SELF_HOSTED === "true";
