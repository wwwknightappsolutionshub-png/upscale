export const adminCss = /* css */ `
@font-face {
  font-family: "Anek Sans";
  src: url("/fonts/anek-sans-extrabold.ttf") format("truetype");
  font-weight: 800;
  font-display: swap;
}
@font-face {
  font-family: "Anek Sans";
  src: url("/fonts/anek-sans-bold.ttf") format("truetype");
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: "Anek Sans";
  src: url("/fonts/anek-sans-regular.ttf") format("truetype");
  font-weight: 400;
  font-display: swap;
}
:root {
  --blue: #1f5eff;
  --blue-soft: #e8efff;
  --red: #e31c24;
  --red-soft: #fdebec;
  --ink: #111111;
  --muted: #5c5c5c;
  --line: #d8d4cd;
  --paper: #f7f5f2;
  --white: #ffffff;
  --side: 15rem;
}
* { box-sizing: border-box; }
html, body { margin: 0; overflow-x: hidden; }
body {
  font-family: "Anek Sans", sans-serif;
  background: var(--paper);
  color: var(--ink);
  min-height: 100vh;
}
a { color: var(--blue); }
code {
  font-size: 0.86em;
  background: #f0ede8;
  padding: 0.12rem 0.35rem;
  border-radius: 2px;
}
.shell {
  display: grid;
  grid-template-columns: var(--side) minmax(0, 1fr);
  min-height: 100vh;
}
.side {
  background: var(--ink);
  color: #fff;
  padding: 1.35rem 1rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.side a {
  color: rgba(255, 255, 255, 0.78);
  text-decoration: none;
  padding: 0.45rem 0.65rem;
  border-radius: 4px;
  font-weight: 700;
  font-size: 0.92rem;
}
.side a:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.side a.is-active {
  color: #fff;
  background: var(--blue);
}
.brand {
  font-weight: 800;
  letter-spacing: 0.1em;
  font-size: 0.82rem;
  text-transform: uppercase;
  margin-bottom: 1.25rem;
  padding: 0 0.35rem;
}
.brand span { color: #ff8a8e; }
.nav-group {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.nav-label {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.45;
  padding: 0 0.65rem 0.35rem;
  font-weight: 700;
}
main.pad {
  padding: 2rem 2.4rem 4rem;
  max-width: 72rem;
  width: 100%;
  min-width: 0;
}
.page-head { margin-bottom: 1.5rem; }
.page-head .kicker {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--blue);
  font-weight: 800;
  margin: 0 0 0.35rem;
}
.page-head h1 {
  font-weight: 800;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  margin: 0 0 0.35rem;
  letter-spacing: -0.03em;
}
.lede { color: var(--muted); max-width: 42rem; margin: 0; line-height: 1.5; }
.who {
  margin-top: auto;
  font-size: 0.78rem;
  opacity: 0.55;
  padding: 0.65rem;
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding: 0;
  list-style: none;
}
.stats li {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 0.95rem 1rem;
}
.stats .num {
  display: block;
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
  margin-bottom: 0.25rem;
}
.stats .label {
  font-size: 0.82rem;
  color: var(--muted);
  font-weight: 700;
}
.split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.25rem;
}
.panel {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 1rem 1.1rem 1.1rem;
  overflow-x: auto;
  max-width: 100%;
}
.panel h2 {
  font-weight: 800;
  font-size: 1rem;
  margin: 0 0 0.85rem;
  letter-spacing: -0.02em;
}
.table-wrap { overflow-x: auto; }
table {
  width: 100%;
  border-collapse: collapse;
  background: var(--white);
}
.panel table { background: transparent; }
th, td {
  text-align: left;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}
th {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 800;
}
tbody tr:last-child td { border-bottom: 0; }
.sub { color: var(--muted); font-size: 0.8rem; line-height: 1.4; }
.badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.2rem 0.45rem;
  border-radius: 3px;
  background: #eee;
  color: var(--ink);
}
.badge.registered { background: var(--blue-soft); color: var(--blue); }
.badge.evidence_submitted { background: #fff4df; color: #9a6200; }
.badge.enrolled { background: #e7f7eb; color: #187a34; }
.badge.rejected { background: var(--red-soft); color: var(--red); }
.badge.waitlist { background: #f0f0f0; color: #555; }
.badge.verified { background: #e7f7eb; color: #187a34; }
.badge.pending { background: #fff4df; color: #9a6200; }
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}
.toolbar select {
  min-width: 11rem;
}
.text-link {
  font-weight: 700;
  text-decoration: none;
}
.text-link:hover { text-decoration: underline; }
form.stack, .stack {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}
input, textarea, select {
  font: inherit;
  font-weight: 400;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--line);
  background: var(--white);
  border-radius: 2px;
  width: 100%;
  max-width: 100%;
}
input:focus, textarea:focus, select:focus {
  outline: 2px solid var(--blue);
  outline-offset: 1px;
  border-color: var(--blue);
}
.check { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
button {
  font: inherit;
  font-weight: 800;
  background: var(--ink);
  color: #fff;
  border: 0;
  padding: 0.72rem 1.1rem;
  cursor: pointer;
  width: fit-content;
  border-radius: 2px;
}
button:hover { background: var(--blue); }
button.danger { background: var(--red); }
button.ghost {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
button.ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.cardish {
  background: var(--white);
  padding: 1.15rem;
  border: 1px solid var(--line);
}
.instructor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}
.instructor-card h2 {
  margin: 0 0 0.15rem;
  font-size: 1.05rem;
}
.instructor-card .slug {
  font-size: 0.78rem;
  color: var(--muted);
  margin-bottom: 0.85rem;
}
.instructor-card .avatar {
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  object-fit: cover;
}
.instructor-card img.avatar { padding: 0; background: var(--line); }
.instructor-card .avatar.blue { background: var(--blue); }
.instructor-card .avatar.red { background: var(--red); }
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.85rem;
  padding: 0;
  list-style: none;
  margin: 0;
}
.course-grid a {
  display: block;
  background: var(--white);
  border: 1px solid var(--line);
  padding: 1rem 1.05rem;
  text-decoration: none;
  color: var(--ink);
  font-weight: 800;
  font-size: 1.05rem;
}
.course-grid a:hover {
  border-color: var(--blue);
  color: var(--blue);
}
.cohort-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 1rem;
}
.cohort-grid h2 {
  margin: 0 0 0.15rem;
  font-size: 1rem;
  text-transform: capitalize;
}
.cohort-grid .course-name {
  color: var(--muted);
  font-size: 0.82rem;
  margin-bottom: 0.85rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.form-grid .full { grid-column: 1 / -1; }
.evidence-card {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 1rem;
  margin-bottom: 0.85rem;
}
.evidence-card header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.inline, .reject {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
  flex-wrap: wrap;
}
.reject input { flex: 1; min-width: 12rem; }
.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
.facts dt {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 800;
}
.facts dd { margin: 0; font-weight: 700; }
.err { color: var(--red); font-weight: 700; }
.banner {
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  margin-bottom: 1rem;
}
.banner.ok {
  background: #e7f7eb;
  border-color: #187a34;
  color: #187a34;
  font-weight: 700;
}
.banner.bad {
  background: var(--red-soft);
  border-color: var(--red);
  color: var(--red);
  font-weight: 700;
}
.form-actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  margin-top: 0.5rem;
  padding: 0.85rem 0 0.15rem;
  background: linear-gradient(180deg, rgba(247, 245, 242, 0), var(--paper) 28%);
}
.panel .form-actions {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 28%);
  border-top: 1px solid var(--line);
  padding: 0.9rem 0 0.1rem;
  margin-top: 0.75rem;
}
.form-actions .hint { margin: 0; max-width: 28rem; }
.form-actions button { flex: 0 0 auto; }
.topbar {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--ink);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 30;
}
.topbar .brand { margin: 0; }
.nav-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  padding: 0.45rem 0.7rem;
  width: auto;
  font-size: 0.82rem;
}
.nav-toggle:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.side-scrim {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(17, 17, 17, 0.45);
  z-index: 35;
  border: 0;
  padding: 0;
  width: auto;
  cursor: pointer;
}
.login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: #fff;
}
.login form {
  background: var(--white);
  color: var(--ink);
  padding: 2rem;
  width: min(24rem, 92vw);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  border-radius: 4px;
}
.login h1 { font-size: 1.6rem; margin: 0; }
.file-row {
  background: var(--white);
  padding: 0.85rem;
  border: 1px solid var(--line);
  margin-bottom: 0.5rem;
}
.badge.super_admin { background: #ede8ff; color: #4a2fbf; }
.badge.admin { background: var(--blue-soft); color: var(--blue); }
.badge.editor { background: #f0f0f0; color: #555; }
.role-pill {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.18rem 0.4rem;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  margin-left: 0.35rem;
}
.panel h3 { margin: 0 0 0.35rem; font-size: 0.95rem; }
.hint { color: var(--muted); font-size: 0.82rem; margin: 0.25rem 0 0; line-height: 1.4; }
.email-editor .stack { gap: 1.1rem; }
.email-editor-split {
  display: grid;
  grid-template-columns: 1fr 16rem;
  gap: 1rem;
  align-items: start;
}
.email-html-source { min-height: 520px; font-family: ui-monospace, monospace; font-size: 12px; }
.email-side {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.85rem;
  position: sticky;
  top: 1rem;
}
.email-side h3 { margin: 0 0 0.35rem; font-size: 0.88rem; }
.email-side h3:not(:first-child) { margin-top: 1rem; }
.merge-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tag-btn {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  cursor: pointer;
}
.tag-btn:hover {
  background: var(--blue-soft);
  border-color: var(--blue);
  color: var(--blue);
}
.email-text-fallback {
  width: 100%;
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  line-height: 1.45;
  min-height: 12rem;
}
.email-actions { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; }
.btn-link { display: inline-flex; align-items: center; padding: 0.55rem 0.85rem; text-decoration: none; font-weight: 700; }
.email-preview-wrap { background: #f5f0e8; padding: 1.5rem; border: 1px solid var(--line); border-radius: var(--radius); }
.email-preview-meta { margin-bottom: 1rem; font-size: 0.9rem; color: var(--muted); }
.email-preview-frame { width: 100%; min-height: 640px; border: 1px solid var(--line); background: #fff; }
.tox-tinymce { border-radius: var(--radius) !important; border-color: var(--line) !important; }
.outline-editor { display: grid; gap: 1rem; }
.outline-editor-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}
.outline-editor-head h3 { margin: 0 0 0.25rem; font-size: 1rem; }
.outline-weeks { display: grid; gap: 0.85rem; }
.outline-week { padding: 1rem; }
.outline-week-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.outline-week-head h4 {
  margin: 0;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.outline-week-num { width: 4.5rem; }
@media (max-width: 960px) {
  .email-editor-split { grid-template-columns: 1fr; }
  .email-side { position: static; }
}
@media (max-width: 900px) {
  .topbar { display: flex; }
  .shell { grid-template-columns: 1fr; }
  .side {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 40;
    width: min(18rem, 86vw);
    height: 100dvh;
    transform: translateX(-105%);
    transition: transform 0.22s ease;
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 0.15rem;
  }
  body.nav-open .side { transform: translateX(0); }
  body.nav-open .side-scrim { display: block; }
  .nav-group { display: block; }
  .split, .facts, .form-grid { grid-template-columns: 1fr; }
  .form-grid .full { grid-column: auto; }
  main.pad { padding: 1.15rem 1rem 5rem; max-width: none; }
  .panel { padding: 0.9rem; }
  .instructor-grid,
  .cohort-grid,
  .course-grid {
    grid-template-columns: 1fr;
  }
  .form-actions {
    position: sticky;
    bottom: 0;
    margin-left: -1rem;
    margin-right: -1rem;
    padding: 0.85rem 1rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
    background: #fff;
    border-top: 1px solid var(--line);
    box-shadow: 0 -8px 24px rgba(17, 17, 17, 0.06);
  }
  .form-actions button { width: 100%; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar button { width: 100%; }
}
@media (max-width: 640px) {
  .side { padding: 1rem 0.85rem 1.2rem; }
  .side a { font-size: 0.9rem; padding: 0.55rem 0.65rem; }
  .brand { width: auto; margin-bottom: 1rem; }
  main.pad { padding: 1rem 0.85rem 5.5rem; }
  .page-head { margin-bottom: 1.1rem; }
  .page-head h1 { font-size: 1.55rem; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  table { font-size: 0.84rem; }
  th, td { padding: 0.55rem 0.5rem; }
  button, .ghost { max-width: 100%; }
  .evidence-card header { flex-direction: column; }
  .login form { padding: 1.35rem 1.15rem; width: min(24rem, 94vw); }
}
@media (min-width: 901px) {
  body.nav-open .side-scrim { display: none; }
}
`;

import type { AdminRole } from "../lib/roles.ts";
import { ADMIN_ROLE_LABEL, navAllowed } from "../lib/roles.ts";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Desk" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/evidence", label: "Evidence" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/instructors", label: "Instructors" },
  { href: "/admin/cohorts", label: "Cohorts" },
  { href: "/admin/landing", label: "Landing" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/audit", label: "Audit" },
];

export function roleLabel(role: AdminRole) {
  return ADMIN_ROLE_LABEL[role] || role;
}

export function pageHead(title: string, lede = "") {
  return `<header class="page-head">
    <p class="kicker">UPSCALE desk</p>
    <h1>${title}</h1>
    ${lede ? `<p class="lede">${lede}</p>` : ""}
  </header>`;
}

export function layout(title: string, who: string, body: string, active = "/admin", role: AdminRole = "super_admin") {
  const links = NAV.filter((item) => navAllowed(item.href, role))
    .map((item) => `<a href="${item.href}" class="${item.href === active ? "is-active" : ""}">${item.label}</a>`)
    .join("");
  const roleBadge = `<span class="role-pill">${roleLabel(role)}</span>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${title} · UPSCALE desk</title>
  <link rel="stylesheet" href="/admin/css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">UPSCALE <span>desk</span></div>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-controls="side-nav" aria-expanded="false">Menu</button>
  </header>
  <button type="button" class="side-scrim" id="side-scrim" hidden aria-label="Close menu"></button>
  <div class="shell">
    <aside class="side" id="side-nav">
      <div class="brand">UPSCALE <span>desk</span></div>
      ${links}
      <form method="post" action="/admin/logout" style="margin-top:auto">
        <button class="ghost" type="submit">Log out</button>
      </form>
      <div class="who">${who}${roleBadge}</div>
    </aside>
    <main class="pad">${body}</main>
  </div>
  <script>
    (function () {
      var toggle = document.getElementById("nav-toggle");
      var scrim = document.getElementById("side-scrim");
      var desktop = window.matchMedia("(min-width: 901px)");
      function setOpen(open) {
        if (desktop.matches) {
          document.body.classList.remove("nav-open");
          if (toggle) toggle.setAttribute("aria-expanded", "false");
          if (scrim) scrim.hidden = true;
          return;
        }
        document.body.classList.toggle("nav-open", open);
        if (toggle) toggle.setAttribute("aria-expanded", String(open));
        if (scrim) scrim.hidden = !open;
      }
      toggle && toggle.addEventListener("click", function () {
        setOpen(!document.body.classList.contains("nav-open"));
      });
      scrim && scrim.addEventListener("click", function () { setOpen(false); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setOpen(false);
      });
      desktop.addEventListener("change", function () { setOpen(false); });
      setOpen(false);
    })();
  </script>
</body>
</html>`;
}

export function loginPage(error = "") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Sign in · UPSCALE desk</title>
  <link rel="stylesheet" href="/admin/css" />
</head>
<body>
  <div class="login">
    <form method="post" action="/admin/login">
      <h1>UPSCALE desk</h1>
      <p class="lede">Staff only. The public site is elsewhere.</p>
      ${error ? `<p class="err">${error}</p>` : ""}
      <label>Email<input type="email" name="email" required autocomplete="username" /></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password" /></label>
      <button type="submit">Enter</button>
    </form>
  </div>
</body>
</html>`;
}
