export function siteOrigin() {
  return import.meta.env.PUBLIC_SITE_URL || "https://upscalecohort.com";
}

export function absoluteUrl(path: string, site = siteOrigin()) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, site.endsWith("/") ? site : `${site}/`).toString();
}

export function metaDescription(value: string, max = 160) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`;
}

type Crumb = { name: string; path: string };

export function breadcrumbList(crumbs: Crumb[], site = siteOrigin()) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path, site),
    })),
  };
}

export function jsonLdGraph(...nodes: unknown[]) {
  const graph: unknown[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    if (Array.isArray(record["@graph"])) {
      graph.push(...record["@graph"]);
      continue;
    }
    const { "@context": _context, ...rest } = record;
    graph.push(rest);
  }
  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
