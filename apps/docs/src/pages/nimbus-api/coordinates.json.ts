import { getCoordinatesManifest } from "@cloudflare/nimbus-docs/runtime";

export const prerender = true;

export async function GET() {
  const manifest = await getCoordinatesManifest();
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
