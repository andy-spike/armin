import { config } from "virtual:nimbus/config";
import { renderSiteCard } from "./og/_card";

export const prerender = true;

export async function GET() {
  return new Response(await renderSiteCard({ title: config.description || config.title }), {
    headers: { "Content-Type": "image/png" },
  });
}
