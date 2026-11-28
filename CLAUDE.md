# PrimeView — برايم فيو

Website of PrimeView, our website and app design company (global-company standards). Live at https://jadkraeem.github.io/primeview/ (GitHub Pages, repo jadkraeem/primeview).

## Working with the owner
- Beginner: explain in simple Arabic, work in phases, ask before anything destructive.
- The Mr Black cafe system (repo jadkraeem/mr-black-cafe, folder Desktop/cafeteria) is a live client system. Never break or delete it from here.

## Stack
- Static site, no build step. **Homepage = the PrimeView template design** (2026-11-28): [index.html](index.html) + [css/pv-template.css](css/pv-template.css) + [css/pv-receipt.css](css/pv-receipt.css) (copies of the internal template CSS) + [css/v2.css](css/v2.css) + [js/v2.js](js/v2.js). Content still comes from `pv_content` (live prices) with [js/content.js](js/content.js) as fallback. The previous homepage is kept as [index-old.html](index-old.html) (noindex) for rollback; it uses [css/site.css](css/site.css) and [js/site.js](js/site.js), which the settings page also uses.
- Never publish `templates/` (internal: package prices, client branding like Enjoy, trial photos with a non-commercial licence). It lives only on the owner's PC.
- All content (services, prices, phones, work, testimonials) lives in one object: [js/content.js](js/content.js). Phase 2 loads it from Supabase (`pv_` tables in the Mr Black project) and keeps content.js as fallback.
- Live demo of the cafe system: [demo/](demo/) (landing page) + [demo/app/](demo/app/) (copy of Mr Black's pages). The copy is made by `node tools/demo/sync.js` from Desktop/cafeteria; never edit demo/app/js or css by hand, re-run sync instead. The only demo-specific file is [demo/app/vendor/demo-backend.js](demo/app/vendor/demo-backend.js): a fake in-browser Supabase (localStorage + BroadcastChannel) that ports the SQL functions/RLS. When Mr Black adds an RPC or table, port it there too. Demo accounts manager/cashier/kitchen@demo.cafe, password demo1234; `?as=manager` auto-logs in.
- Work videos are made by [tools/video/](tools/video/) from test-account screenshots only (never real client data).
- Escape every value with `esc()` before inserting HTML; links go through `safeHref()`.

## Design
- Colors: beige background, sky blue, emerald. Only via CSS variables in site.css; light + dark themes must both look right.
- Fonts: Readex Pro (headings), IBM Plex Sans Arabic (text). Arabic, RTL, mobile-first; use logical properties.
- Animation on everything (reveal on scroll, counters, tilt, magnetic buttons), but always respect `prefers-reduced-motion`.
- Never publish fake testimonials or invented client quotes.
