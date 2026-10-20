/** Public Convex dev deployment URLs from `.env.local` (see `.env.example`). */
export const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";
export const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? "";

if (!convexUrl || !convexSiteUrl) {
  throw new Error(
    "Set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CONVEX_SITE_URL in apps/mobile/.env.local.",
  );
}
