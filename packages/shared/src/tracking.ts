export const TRACKING_PROVIDERS = ["facebook", "google_analytics", "google_tag_manager", "custom"] as const;
export type TrackingProvider = (typeof TRACKING_PROVIDERS)[number];

export const TRACKING_PROVIDER_LABEL: Record<TrackingProvider, string> = {
  facebook: "Facebook Pixel",
  google_analytics: "Google Analytics 4",
  google_tag_manager: "Google Tag Manager",
  custom: "Custom snippet",
};

export type TrackingPixel = {
  id: string;
  name: string;
  provider: TrackingProvider;
  /** Pixel ID, measurement ID, container ID, or a vendor snippet for custom. */
  value: string;
  enabled: boolean;
};

const FACEBOOK_ID = /^\d{5,20}$/;
const GA_ID = /^G-[A-Z0-9]{4,20}$/;
const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/;

export function isTrackingProvider(value: string): value is TrackingProvider {
  return (TRACKING_PROVIDERS as readonly string[]).includes(value);
}

/** Validate an admin-entered ID or snippet. Throws a short message on failure. */
export function parseTrackingValue(provider: TrackingProvider, raw: string): string {
  const value = String(raw || "").replaceAll("\0", "").trim();
  if (!value) throw new Error("Enter a pixel ID or snippet.");
  if (provider === "facebook") {
    if (!FACEBOOK_ID.test(value)) {
      throw new Error("Facebook Pixel ID should be digits only, from Events Manager.");
    }
    return value;
  }
  if (provider === "google_analytics") {
    const id = value.toUpperCase();
    if (!GA_ID.test(id)) throw new Error("Google Analytics ID should look like G-XXXXXXXX.");
    return id;
  }
  if (provider === "google_tag_manager") {
    const id = value.toUpperCase();
    if (!GTM_ID.test(id)) throw new Error("Google Tag Manager ID should look like GTM-XXXX.");
    return id;
  }
  if (value.length > 20000) throw new Error("Custom snippet is too long (20,000 characters max).");
  if (/<\s*(html|head|body)\b/i.test(value)) {
    throw new Error("Paste only the vendor snippet, not a full HTML page.");
  }
  return value;
}

export function normalizeTracking(raw: unknown): TrackingPixel[] {
  if (!Array.isArray(raw)) return [];
  const out: TrackingPixel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const provider = String(row.provider || "");
    if (!isTrackingProvider(provider)) continue;
    let value = "";
    try {
      value = parseTrackingValue(provider, String(row.value || ""));
    } catch {
      continue;
    }
    const id = String(row.id || "").trim().slice(0, 40);
    if (!id) continue;
    const name = String(row.name || "").trim().slice(0, 80) || TRACKING_PROVIDER_LABEL[provider];
    out.push({
      id,
      name,
      provider,
      value,
      enabled: row.enabled !== false && row.enabled !== 0 && row.enabled !== "0",
    });
  }
  return out.slice(0, 20);
}

export function renderTrackingHead(entries: TrackingPixel[] | undefined): string {
  const enabled = (entries || []).filter((entry) => entry.enabled);
  const parts: string[] = [];

  const facebook = enabled.filter((entry) => entry.provider === "facebook" && FACEBOOK_ID.test(entry.value));
  if (facebook.length) {
    const inits = facebook.map((entry) => `fbq('init', '${entry.value}');`).join("\n");
    parts.push(`<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
${inits}
fbq('track', 'PageView');
</script>`);
    for (const entry of facebook) {
      parts.push(
        `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${entry.value}&amp;ev=PageView&amp;noscript=1" /></noscript>`,
      );
    }
  }

  const analytics = enabled.filter((entry) => entry.provider === "google_analytics" && GA_ID.test(entry.value));
  if (analytics.length) {
    const configs = analytics.map((entry) => `gtag('config', '${entry.value}');`).join("\n");
    parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${analytics[0]!.value}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs}
</script>`);
  }

  for (const entry of enabled) {
    if (entry.provider === "google_tag_manager" && GTM_ID.test(entry.value)) {
      parts.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${entry.value}');</script>`);
    }
  }

  for (const entry of enabled) {
    if (entry.provider !== "custom") continue;
    try {
      parts.push(parseTrackingValue("custom", entry.value));
    } catch {
      /* skip invalid stored snippets */
    }
  }

  return parts.join("\n");
}

export function renderTrackingBody(entries: TrackingPixel[] | undefined): string {
  const enabled = (entries || []).filter((entry) => entry.enabled && entry.provider === "google_tag_manager");
  return enabled
    .filter((entry) => GTM_ID.test(entry.value))
    .map(
      (entry) =>
        `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${entry.value}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe></noscript>`,
    )
    .join("\n");
}
