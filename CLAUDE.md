# PrimeView — برايم فيو

Website of PrimeView, our website and app design company (global-company standards). Live at https://jadkraeem.github.io/primeview/ (GitHub Pages, repo jadkraeem/primeview).

## Working with the owner
- Beginner: explain in simple Arabic, work in phases, ask before anything destructive.
- The Mr Black cafe system (repo jadkraeem/mr-black-cafe, folder Desktop/cafeteria) is a live client system. Never break or delete it from here.

## Stack
- Static site, no build step: [index.html](index.html), [css/site.css](css/site.css), [js/site.js](js/site.js).
- All content (services, prices, phones, work, testimonials) lives in one object: [js/content.js](js/content.js). Phase 2 loads it from Supabase (`pv_` tables in the Mr Black project) and keeps content.js as fallback.
- Work videos are made by [tools/video/](tools/video/) from test-account screenshots only (never real client data).
- Escape every value with `esc()` before inserting HTML; links go through `safeHref()`.

## Design
- Colors: beige background, sky blue, emerald. Only via CSS variables in site.css; light + dark themes must both look right.
- Fonts: Readex Pro (headings), IBM Plex Sans Arabic (text). Arabic, RTL, mobile-first; use logical properties.
- Animation on everything (reveal on scroll, counters, tilt, magnetic buttons), but always respect `prefers-reduced-motion`.
- Never publish fake testimonials or invented client quotes.
