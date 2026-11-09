import { getOgImagePages, getPageSection } from "@cloudflare/nimbus-docs/runtime";
import type { APIRoute, GetStaticPaths } from "astro";
import { renderPageCard } from "./_card";

export const prerender = true;

export const getStaticPaths = (async () =>
  Object.entries(await getOgImagePages()).map(([slug, page]) => ({
    params: { slug },
    props: { page },
  }))) satisfies GetStaticPaths;

type Page = Awaited<ReturnType<typeof getOgImagePages>>[string];

export const GET: APIRoute<{ page: Page }> = async ({ props: { page } }) =>
  new Response(await renderPageCard({ section: await getPageSection(page), title: page.title }), {
    headers: { "Content-Type": "image/png" },
  });
