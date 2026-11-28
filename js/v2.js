// =========================================================
// PrimeView على قالب PrimeView (v2)
// نفس المحتوى ونفس صفحة الإعدادات: content.js احتياط + pv_content من القاعدة.
// الحركة والدرجات من قالب المواقع؛ الأسعار معروضة كفواتير (توقيعنا).
// =========================================================
import { DEFAULT_CONTENT } from './content.js';
import { fetchSiteContent, mergeContent } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeHref = (u) => (/^(https:\/\/|assets\/|demo\/)/.test(String(u || '')) ? String(u) : '');
const digits = (n) => String(n || '').replace(/[^\d]/g, '');
const CACHE_KEY = 'pv-content-cache';
const cached = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };

// ---------- الدرجات من لون واحد (نفس معادلة قالب المواقع) ----------
function palette(brand) {
  const m = brand.replace('#', ''); const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) { s = l > .5 ? d / (2 - max - min) : d / (max + min); h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  h = Math.round(h); s = Math.min(Math.round(s * 100), 70); const sd = s * .62;
  const c = (sat, lig) => `hsl(${h} ${Math.round(sat)}% ${lig}%)`;
  const v = { '--night': c(sd, 12), '--night-2': c(sd * .9, 18), '--deep': c(sd, 8), '--deepest': c(sd, 5), '--glow': c(Math.min(s, 55), 26),
    '--pearl-1': c(Math.min(s, 45), 38), '--pearl-2': c(Math.min(s, 50), 20), '--pearl-3': c(Math.min(s, 50), 10), '--ink': c(Math.min(s, 30), 8), '--ink-2': c(Math.min(s, 10), 38) };
  Object.entries(v).forEach(([k, val]) => document.documentElement.style.setProperty(k, val));
  $('meta[name="theme-color"]').content = v['--night'];
}

// ---------- أيقونات الخدمات (خطّية، بدل الإيموجي) ----------
const ICON = {
  web: '<rect x="8" y="12" width="48" height="38" rx="4"/><path d="M8 22h48"/><circle cx="14" cy="17" r="1.5"/><circle cx="20" cy="17" r="1.5"/><path d="M18 34h14M18 40h22"/>',
  phone: '<rect x="20" y="6" width="24" height="52" rx="5"/><path d="M28 50h8"/><path d="M26 16h12M26 22h12M26 28h8"/>',
  cafe: '<path d="M14 24h30v12a14 14 0 0 1-14 14h-2a14 14 0 0 1-14-14z"/><path d="M44 28h4a6 6 0 0 1 0 12h-4"/><path d="M12 54h38"/><path d="M24 12c-2 3 2 5 0 8M31 12c-2 3 2 5 0 8"/>',
  brand: '<circle cx="32" cy="32" r="22"/><circle cx="24" cy="26" r="4"/><circle cx="38" cy="22" r="4"/><circle cx="42" cy="36" r="4"/><path d="M28 46a6 6 0 0 1-6-6"/>',
  nfc: '<rect x="12" y="20" width="40" height="28" rx="4"/><path d="M26 30a6 6 0 0 1 0 8M31 27a11 11 0 0 1 0 14M36 24a16 16 0 0 1 0 20"/>',
  loyalty: '<rect x="10" y="14" width="44" height="36" rx="3"/><circle cx="22" cy="28" r="4"/><circle cx="34" cy="28" r="4"/><circle cx="22" cy="40" r="4"/><circle cx="34" cy="40" r="4" stroke-dasharray="2 2"/><path d="M44 26v16"/>',
  spark: '<path d="M32 10l5 13 13 5-13 5-5 13-5-13-13-5 13-5z"/>'
};
// كل نوع خدمة إلو لون (من عيلة ألوان PrimeView)
const COLOR = { web: '#0e9f6e', phone: '#1f8fc4', cafe: '#c9822b', brand: '#7c5ce0', nfc: '#2bb3a3', loyalty: '#e0604a', spark: '#0e9f6e' };
function iconFor(title) {
  const t = String(title);
  const k = /موقع|مواقع/.test(t) ? 'web' : /تطبيق/.test(t) ? 'phone' : /مطاعم|مقاه|مقه|كافي/.test(t) ? 'cafe' : /هوية|شعار/.test(t) ? 'brand' : /NFC/i.test(t) ? 'nfc' : /ولاء/.test(t) ? 'loyalty' : 'spark';
  return `<span class="ic" style="--c:${COLOR[k]}"><svg viewBox="0 0 64 64" aria-hidden="true">${ICON[k]}</svg></span>`;
}

// ---------- الرسم ----------
let current = null, billing = 'monthly';
function render(c) {
  $$('[data-bind]').forEach((el) => { el.textContent = el.dataset.bind.split('.').reduce((o, k) => o?.[k], c) ?? ''; });
  // العنوان: آخر كلمتين بخط اليد
  const words = String(c.brand.tagline || '').trim().split(/\s+/);
  const hand = words.length > 3 ? words.splice(-2).join(' ') : '';
  const half = Math.ceil(words.length / 2);
  $('#h-title').innerHTML = esc(words.slice(0, half).join(' ')) + '<br>' + esc(words.slice(half).join(' '));
  $('#h-hand').textContent = hand;

  $('#infobar').innerHTML = (c.stats || []).slice(0, 4).map((s) =>
    `<div><span class="decode" data-v="${esc(String(s.value) + (s.suffix || ''))}">${esc(String(s.value) + (s.suffix || ''))}</span><br>${esc(s.label)}</div>`).join('');

  const tapeWords = [...(c.services || []).map((s) => s.title), 'معايير عالمية', 'PrimeView'];
  const tapeRow = tapeWords.map((w) => `<span>${esc(w)}</span>`).join('');
  $('#tape').innerHTML = tapeRow + tapeRow;

  $('#svc').innerHTML = (c.services || []).map((s, i) => `
    <article class="svc"><span class="idx">${String(i + 1).padStart(2, '0')}</span>${iconFor(s.title)}<div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></article>`).join('');

  $('#works').innerHTML = (c.work || []).map((w, i) => {
    const src = safeHref(w.media), poster = safeHref(w.poster), link = safeHref(w.link);
    const media = /\.(mp4|webm)$/i.test(src)
      ? `<video muted loop playsinline preload="none" ${poster ? `poster="${esc(poster)}"` : ''} aria-label="${esc(w.title)}"><source src="${esc(src)}" type="video/mp4"></video>`
      : src ? `<img src="${esc(src)}" alt="${esc(w.title)}" loading="lazy">` : '';
    return `<article class="wk"><div class="wk-media"><div class="fallback">${esc(w.title)}</div>${media}</div>
      <div><span class="tag">// ${String(i + 1).padStart(2, '0')} · ${esc(w.tag)}</span><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p>
      ${link ? `<a class="btn-try" href="${esc(link)}"><i class="live" aria-hidden="true"></i>جرّب النظام مباشرة<span class="arr" aria-hidden="true">←</span></a>` : ''}</div></article>`;
  }).join('');

  $('#steps').innerHTML = (c.steps || []).map((s, i) => `<div><span class="n">${String(i + 1).padStart(2, '0')}</span><span><b>${esc(s.title)}</b><p>${esc(s.text)}</p></span></div>`).join('');
  buildRing((c.steps || []).map((s) => s.title));

  $('#why').innerHTML = (c.why || []).map((s, i) => `<div><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>`).join('');

  renderPlans(c.plans);
  $('#plans-note').textContent = c.plans?.note || '';
  $('#extras').innerHTML = (c.extras || []).map((e) => `<span>${esc(e.title)}<b>${esc(e.price)}</b></span>`).join('');

  const t = (c.testimonials || []).filter((q) => q && q.text);
  $('#testimonials').hidden = !t.length;
  $('#quotes').innerHTML = t.map((q) => `<figure><p>${esc(q.text)}</p><figcaption><b>${esc(q.name)}</b> · ${esc(q.role)}</figcaption></figure>`).join('');

  renderContact(c.contact || {});
  $('#year').textContent = new Date().getFullYear();
  current = c;
  observe();
}

// الباقات كفواتير بتنطبع
function renderPlans(p) {
  if (!p) return;
  const yearly = billing === 'yearly';
  $('#plans').innerHTML = (p.items || []).map((it, i) => {
    const amount = yearly ? Number(it.monthly) * 10 : Number(it.monthly);
    return `<div class="rc-printer" style="--p:0" data-i="${i}"><div class="rc-slot"><article class="rc">
      <div class="rc-head"><span class="rc-logo">PrimeView</span><span>برايم فيو · عرض باقة</span></div>
      ${it.featured ? '<span class="rc-stamp">الأكثر طلبًا</span>' : ''}
      <div class="rc-row" style="margin-top:10px"><span>باقة #0${i + 1}</span><span>${yearly ? 'سنوي' : 'شهري'}</span></div>
      <p class="rc-title">${esc(it.name)}</p>
      <div class="rc-sep"></div>
      <ul class="rc-list">${(it.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="rc-sep"></div>
      <div class="rc-row"><span>تجهيز لمرة واحدة</span><b>${esc(p.currency)}${esc(it.setup)}</b></div>
      <div class="rc-row" style="margin-top:6px"><span>الاشتراك</span><span class="rc-big amount">${esc(p.currency)}${esc(amount)} <small>/ ${yearly ? 'سنة' : 'شهر'}</small></span></div>
      <button type="button" class="rc-btn" data-plan="${esc(it.name)}"><span>اطلب هذه الباقة</span><span>↖</span></button>
      <div class="rc-barcode" aria-hidden="true"></div>
      <div class="rc-foot">PV-${String(i + 1).padStart(3, '0')} · شكرًا لاختيارك برايم فيو</div>
    </article></div></div>`;
  }).join('');
  onScroll();
}

function renderContact(ct) {
  const phones = (ct.phones || []).filter((p) => digits(p.number));
  $('#phones').innerHTML = phones.map((p) => {
    const d = digits(p.number), href = p.whatsapp ? `https://wa.me/${d}` : `tel:+${d}`;
    return `<a href="${href}" ${p.whatsapp ? 'target="_blank" rel="noopener"' : ''}><small>${esc(p.label)}</small><b>${esc(p.number)}</b></a>`;
  }).join('');
  const NAMES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
  $('#socials').innerHTML = Object.entries(ct.social || {}).filter(([k, u]) => NAMES[k] && safeHref(u)).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${NAMES[k]}</a>`).join('')
    + (ct.email ? `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>` : '');
  const wa = phones.find((p) => p.whatsapp), fl = $('#waFloat');
  if (wa) fl.href = `https://wa.me/${digits(wa.number)}`;
  fl.hidden = !wa;
}

// ---------- الحركة ----------
const ring = $('#ring');
function buildRing(names) {
  ring.innerHTML = '';
  for (let i = 0; i < 60; i++) { const t = document.createElement('i'); t.className = 'tick' + (i % 5 === 0 ? ' big' : ''); t.style.transform = `rotate(${i * 6}deg) translate(-1px, calc(-1 * min(250px, 46vw) + 6px))`; ring.appendChild(t); }
  const step = 360 / Math.max(names.length, 1);
  names.forEach((n, k) => { const s = document.createElement('span'); s.className = 'bn'; s.textContent = n; s.dataset.a = k * step - 90; ring.appendChild(s); });
  onScroll();
}

function decode(el) {
  const v = el.dataset.v; let n = 0;
  const iv = setInterval(() => { n++; el.textContent = v.split('').map((c, i) => (/\d/.test(c) && i >= n / 2 ? String(Math.floor(Math.random() * 10)) : c)).join(''); if (n / 2 > v.length) { clearInterval(iv); el.textContent = v; } }, 45);
}
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  if (e.target.classList.contains('decode') && !reduce) decode(e.target);
  if (e.target.tagName === 'VIDEO' && !reduce) e.target.play().catch(() => {});
  io.unobserve(e.target);
}), { threshold: .3 });
function observe() { $$('.rise:not(.in), .decode, .wk-media video').forEach((el) => io.observe(el)); }

// جزيئات «بكسلات» بأعماق (بدل البن لأننا استوديو رقمي)
const st = $('#statement'), parts = [];
for (let j = 0; j < 22; j++) {
  const z = Math.random(), size = 6 + z * 22, p = document.createElement('i');
  p.className = 'particle pixel'; p.style.width = p.style.height = size + 'px';
  p.style.right = Math.random() * 100 + '%'; p.style.top = Math.random() * 100 + '%'; p.style.opacity = .3 + z * .6;
  if (z < .3) p.style.filter = 'blur(2px)';
  st.appendChild(p); parts.push({ el: p, z, r: Math.round(Math.random() * 90) });
}

const stage = $('#stage'), cup = $('#cup');
if (!reduce) stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
  cup.style.transform = `rotateY(${(x * 18).toFixed(1)}deg) rotateX(${(-y * 14).toFixed(1)}deg)`;
});
stage.addEventListener('pointerleave', () => { cup.style.transform = ''; });

const prog = (el) => { const r = el.getBoundingClientRect(), h = innerHeight; return Math.min(1, Math.max(0, (h - r.top) / (h + r.height))); };
// لون الهيدر حسب القسم اللي تحته (كريمي على الغامق، حبر على الفاتح)
const navEl = $('.nav');
function navTone() {
  const y = navEl.getBoundingClientRect().bottom - 4;
  const under = $$('main > section, footer').find((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom > y; });
  navEl.classList.toggle('on-light', !!under?.classList.contains('light'));
  navEl.classList.toggle('scrolled', scrollY > 40);
}
function onScroll() {
  navTone();
  const rot = reduce ? 0 : prog($('#branches')) * 200 - 60;
  ring.style.transform = `rotate(${rot.toFixed(1)}deg)`;
  $$('.bn', ring).forEach((s) => { const a = +s.dataset.a; s.style.transform = `translate(-50%, -50%) rotate(${a}deg) translateX(min(190px, 34vw)) rotate(${-a - rot}deg)`; });
  if (reduce) { $$('.rc-printer').forEach((p) => p.style.setProperty('--p', 1)); return; }
  $('#brush').style.transform = `translateX(${(prog($('#services')) * -120).toFixed(1)}px)`;
  const ps = prog(st);
  parts.forEach((q) => { q.el.style.transform = `translateY(${((.5 - ps) * (60 + q.z * 420)).toFixed(1)}px) rotate(${q.r}deg)`; });
  // الفواتير بتنطبع وحدة ورا التانية مع التمرير
  const pp = prog($('#pricing'));
  $$('.rc-printer').forEach((p, i) => { const v = Math.min(1, Math.max(0, (pp - .12 - i * .06) / .3)); p.style.setProperty('--p', v.toFixed(3)); });
}
addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll);

// ---------- الدفع الشهري/السنوي + النموذج ----------
$$('.bill button').forEach((b) => b.addEventListener('click', () => {
  billing = b.dataset.bill;
  $$('.bill button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderPlans(current.plans);
  $$('.rc-printer').forEach((p) => p.style.setProperty('--p', 1));
}));
const form = $('#contactForm');
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-plan]');
  if (p) { form.msg.value = `مهتم بباقة: ${p.dataset.plan}`; $('#contact').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const err = $('.form-error'); err.textContent = ''; let ok = true;
  [form.name, form.phone].forEach((f) => { f.classList.toggle('is-bad', !f.value.trim()); if (!f.value.trim()) ok = false; });
  if (!ok) { err.textContent = 'اكتب اسمك ورقم جوالك حتى نقدر نرد عليك.'; return; }
  const wa = (current.contact?.phones || []).find((p) => p.whatsapp && digits(p.number));
  if (!wa) { err.textContent = 'رقم التواصل غير متاح حالياً.'; return; }
  const text = `مرحباً PrimeView 👋\nالاسم: ${form.name.value.trim()}\nالجوال: ${form.phone.value.trim()}\nنوع المشروع: ${form.type.value}\n${form.msg.value.trim()}`;
  window.open(`https://wa.me/${digits(wa.number)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
});

// ---------- التشغيل ----------
// موقعنا بياخد ألوان هوية PrimeView الأصلية من css/v2.css (بيج + زمردي + سماوي)، فما منحسب درجات هون.
// palette() بتضل جاهزة لمواقع العملاء.
void palette;
render(mergeContent(DEFAULT_CONTENT, cached()));
onScroll();
fetchSiteContent().then((saved) => {
  if (!saved) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(saved)); } catch { /* تجاهل */ }
  const fresh = mergeContent(DEFAULT_CONTENT, saved);
  if (JSON.stringify(fresh) !== JSON.stringify(current)) render(fresh);
});
