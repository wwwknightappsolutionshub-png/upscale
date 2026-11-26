import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin || "https://upscalecohort.com";
  const body = `User-agent: *
Allow: /
Disallow: /payment
Disallow: /register

Sitemap: ${origin}/sitemap-index.xml
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
