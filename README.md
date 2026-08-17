# UPSCALE

**learn today, build tomorrow**

Virtual training institute for people switching career path, entering the IT space, or upscaling skills they already use. Four live-online tracks: Graphic Design, Front-End Development, Backend Development, Full Stack Development.

This repo is independent. It is not part of any other product.

## Stack

- **Public site:** Astro (static HTML, Nexa, Split Horizon layout)
- **API + staff desk:** Hono on Node (SQLite via libSQL)
- **Flow:** register → bank transfer → upload payment evidence → staff approve

## Run locally

Needs Node 20+.

```bash
cd UPSCALE
copy .env.example .env
npm install
npm run dev
```

- Site: http://localhost:4321
- API: http://localhost:8787/health
- Staff desk: http://localhost:8787/admin

Default desk login (change in `.env`):

- Email: `leo.a@example.org`
- Password: `ChangeMe_UPSCALE1`

Bank details, prices, outlines, instructors, and landing copy are edited in the desk. The public site reads the API in `astro dev`. A production static build snapshots the catalog (falls back to seed content if the API is down at build time).

Emails are written to `apps/api/data/mail.log` in development. Payment files land in `apps/api/uploads/` (not public).

## Fonts

The site self-hosts **Nexa** (Heavy, Bold, Regular, Light) from `apps/web/public/fonts`. Keep a valid webfont licence for production.

## Brand

Mark: `apps/web/public/brand/upscale-mark.png`  
Blue `#1F5EFF` · Red `#E31C24` · Ink `#111111`

## Production sketch

1. Put the API on a small Node host with a persistent disk for SQLite (or switch `DATABASE_URL` to libSQL/Postgres later).
2. Set `WEB_ORIGIN`, `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, `SESSION_SECRET`, and `BUILD_TOKEN`.
3. Build the Astro app (`npm run build`) and serve `apps/web/dist` on a CDN.
4. Point the desk at `https://api.your-domain/admin` and do not index it.
