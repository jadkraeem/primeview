// =========================================================
// PrimeView — رسم المحتوى والحركات
// =========================================================
import { DEFAULT_CONTENT } from './content.js';
import { fetchSiteContent, mergeContent } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

// الحماية من XSS: كل نص يمرّ عبر esc قبل وضعه في الصفحة
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const safeHref = (u) => (/^(https:\/\/|assets\/|demo\/)/.test(String(u || '')) ? String(u) : '');
const digits = (n) => String(n || '').replace(/[^\d]/g, '');

// ---------------------------------------------------------
// المحتوى: يظهر فوراً (آخر نسخة محفوظة على الجهاز أو content.js)
// ثم يتحدّث بهدوء عند وصول أحدث نسخة من صفحة الإعدادات.
// (قبل ذلك كانت الصفحة فارغة على الجوال حتى يصل رد السيرفر)
// ---------------------------------------------------------
const CACHE_KEY = 'pv-content-cache';
function cachedContent() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* تجاهل */ }
}

let current = null;     // المحتوى المعروض الآن
let billing = 'monthly';

// ---------------------------------------------------------
// رسم الأقسام (يعيد رسم القسم فقط إذا تغيّرت بياناته)
// ---------------------------------------------------------
function render(c, prev = null) {
  const changed = (k) => !prev || JSON.stringify(prev[k]) !== JSON.stringify(c[k]);

  if (changed('brand')) {
    $$('[data-bind]').forEach((el) => {
      const v = el.dataset.bind.split('.').reduce((o, k) => o?.[k], c);
      el.textContent = v ?? '';
    });
    splitWords($('.hero-title'));
  }

  if (changed('stats')) $('#stats').innerHTML = c.stats.map((s, i) => `
    <div class="stat reveal" style="--d:${i * 0.08}s">
      <b><span class="count" data-to="${Number(s.value) || 0}">0</span>${esc(s.suffix)}</b>
      <span>${esc(s.label)}</span>
    </div>`).join('');

  if (changed('services')) {
    const words = [...c.services.map((s) => s.title), 'معايير عالمية', 'PrimeView'];
    const row = words.map((w) => `<span>${esc(w)}</span>`).join('');
    $('.marquee-track').innerHTML = row + row;
    $('.services-grid').innerHTML = c.services.map((s, i) => card(s, i)).join('');
  }
  if (changed('why')) $('.why-grid').innerHTML = c.why.map((s, i) => card(s, i)).join('');

  if (changed('work')) $('.work-list').innerHTML = c.work.map((w) => {
    const link = safeHref(w.link);
    return `
    <article class="work">
      <div class="work-media mask-reveal">
        <div class="wm-fallback">${esc(w.title)}</div>
        ${mediaTag(w)}
      </div>
      <div class="work-copy reveal">
        <span class="work-tag">${esc(w.tag)}</span>
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.text)}</p>
        ${link ? `<a class="btn btn-ghost magnetic" href="${esc(link)}" ${link.startsWith('demo/') ? '' : 'target="_blank" rel="noopener"'}>جرّب النظام مباشرة <span aria-hidden="true">←</span></a>` : ''}
      </div>
    </article>`;
  }).join('');

  if (changed('plans')) {
    renderPlans(c.plans, billing);
    if (prev) $$('.plan').forEach((p) => p.classList.add('is-in'));
    $('.plans-note').textContent = c.plans.note || '';
  }
  if (changed('extras')) $('.extras').innerHTML = (c.extras || []).map((e) => `<div class="extra">${esc(e.title)} <span>${esc(e.price)}</span></div>`).join('');

  if (changed('steps')) {
    $$('.steps .step').forEach((li) => li.remove());
    $('.steps').insertAdjacentHTML('beforeend', c.steps.map((s, i) => `
      <li class="step reveal" style="--d:${i * 0.15}s"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join(''));
  }

  if (changed('testimonials')) {
    const t = (c.testimonials || []).filter((q) => q && q.text);
    $('#testimonials').classList.toggle('hidden', !t.length);
    $('.quotes').innerHTML = t.map((q, i) => `
      <figure class="card quote reveal" style="--d:${i * 0.1}s"><p>${esc(q.text)}</p>
      <figcaption><b>${esc(q.name)}</b> <span class="muted">· ${esc(q.role)}</span></figcaption></figure>`).join('');
  }

  if (changed('contact')) renderContact(c.contact);
  $('#year').textContent = new Date().getFullYear();
  current = c;
}

function card(s, i) {
  return `<article class="card reveal" style="--d:${(i % 3) * 0.1}s">
    <div class="card-icon" aria-hidden="true">${esc(s.icon)}</div>
    <h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></article>`;
}

// على الجوال: نسخة أخف من فيديوهات أعمالنا المحلية (assets/work/x.mp4 ← x-m.mp4)
const SMALL = matchMedia('(max-width: 760px)').matches;
const light = (u) => (SMALL && /^assets\/work\/[\w-]+\.(mp4|jpg)$/.test(u) && !/-m\.\w+$/.test(u) ? u.replace(/\.(\w+)$/, '-m.$1') : u);

function mediaTag(w) {
  const src = light(safeHref(w.media));
  if (!src) return '';
  const poster = light(safeHref(w.poster));
  if (/\.(mp4|webm)$/i.test(src)) {
    return `<video muted loop playsinline preload="none" ${poster ? `poster="${esc(poster)}"` : ''} aria-label="${esc(w.title)}">
      <source src="${esc(src)}" type="video/${src.endsWith('webm') ? 'webm' : 'mp4'}"></video>`;
  }
  return `<img src="${esc(src)}" alt="${esc(w.title)}" loading="lazy">`;
}

function renderPlans(p, billing) {
  const yearly = billing === 'yearly';
  $('.plans').innerHTML = p.items.map((it, i) => {
    const amount = yearly ? Number(it.monthly) * 10 : Number(it.monthly);
    return `<article class="card plan reveal ${it.featured ? 'featured' : ''}" style="--d:${i * 0.12}s">
      ${it.featured ? '<span class="plan-badge">الأكثر طلباً</span>' : ''}
      <h3>${esc(it.name)}</h3>
      <div class="price"><small>${yearly ? '/ سنة' : '/ شهر'}</small><b>${esc(p.currency)}${esc(amount)}</b></div>
      <p class="setup">تجهيز لمرة واحدة: ${esc(p.currency)}${esc(it.setup)}</p>
      <ul>${it.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <a class="btn ${it.featured ? 'btn-primary' : 'btn-ghost'} magnetic" href="#contact" data-plan="${esc(it.name)}">اطلب هذه الباقة</a>
    </article>`;
  }).join('');
}

function renderContact(ct) {
  const phones = (ct.phones || []).filter((p) => digits(p.number));
  $('.phones').innerHTML = phones.map((p) => {
    const d = digits(p.number);
    const href = p.whatsapp ? `https://wa.me/${d}` : `tel:+${d}`;
    return `<a class="phone" href="${href}" ${p.whatsapp ? 'target="_blank" rel="noopener"' : ''}>
      <i aria-hidden="true">${p.whatsapp ? '💬' : '📞'}</i>
      <span><small>${esc(p.label)}</small><b>${esc(p.number)}</b></span></a>`;
  }).join('');
  const soc = Object.entries(ct.social || {}).filter(([, u]) => safeHref(u));
  const NAMES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok' };
  $('.socials').innerHTML = soc.filter(([k]) => NAMES[k]).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${NAMES[k]}</a>`).join('')
    + (ct.email ? `<a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a>` : '');

  const wa = phones.find((p) => p.whatsapp);
  const float = $('#waFloat');
  if (wa) float.href = `https://wa.me/${digits(wa.number)}`;
  float.classList.toggle('hidden', !wa);
  return wa;
}

// ---------------------------------------------------------
// الحركات
// ---------------------------------------------------------
function splitWords(el) {
  if (!el) return;
  const words = el.textContent.trim().split(/\s+/);
  el.innerHTML = words.map((w, i) => `<span class="w" style="animation-delay:${0.25 + i * 0.09}s">${esc(w)}</span>`).join(' ');
}

function rotator(words) {
  const el = $('.rotator');
  if (!el || !words?.length) return;
  if (reduced) { el.textContent = words[0]; return; }
  let wi = 0, ci = 0, del = false;
  const hero = $('.hero');
  const tick = () => {
    if (hero.classList.contains('offscreen') || document.hidden) return setTimeout(tick, 600);
    const w = words[wi];
    el.textContent = w.slice(0, ci);
    if (!del && ci === w.length) { del = true; return setTimeout(tick, 1700); }
    if (del && ci === 0) { del = false; wi = (wi + 1) % words.length; return setTimeout(tick, 300); }
    ci += del ? -1 : 1;
    setTimeout(tick, del ? 45 : 95);
  };
  tick();
}

// المراقبون يُنشؤون مرة واحدة، و observeReveals تراقب فقط العناصر الجديدة
// (تُستدعى مرة عند البداية ومرة بعد أي إعادة رسم)
let revealIO = null;
let videoIO = null;
function observeReveals() {
  revealIO ||= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      // صندوق العمل مخفي بالكامل قبل ظهوره، فنراقب السطر كله بدلاً منه
      e.target.querySelector(':scope > .mask-reveal')?.classList.add('is-in');
      if (e.target.classList.contains('stat')) countUp(e.target.querySelector('.count'));
      revealIO.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal, .work, .steps').forEach((el) => {
    if (el.dataset.obs || el.classList.contains('is-in')) return;
    el.dataset.obs = '1';
    revealIO.observe(el);
  });

  // الفيديو يشتغل فقط وهو ظاهر على الشاشة لتوفير البطارية والإنترنت
  videoIO ||= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
    });
  }, { threshold: SMALL ? 0.6 : 0.3 });
  $$('.work-media video:not([data-obs])').forEach((v) => {
    v.dataset.obs = '1';
    v.addEventListener('loadeddata', () => v.parentElement.querySelector('.wm-fallback')?.remove(), { once: true });
    v.addEventListener('error', () => v.remove(), true);
    if (reduced) return;
    videoIO.observe(v);
  });
  $$('.work-media img:not([data-obs])').forEach((img) => {
    img.dataset.obs = '1';
    img.addEventListener('load', () => img.parentElement.querySelector('.wm-fallback')?.remove(), { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
  });
}

// إيقاف الحركات اللانهائية للأقسام غير الظاهرة على الشاشة
function pauseOffscreen() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('offscreen', !e.isIntersecting));
  }, { rootMargin: '100px 0px' });
  $$('.hero, .marquee, .contact-box').forEach((el) => io.observe(el));
}

function countUp(el) {
  if (!el) return;
  const to = Number(el.dataset.to) || 0;
  if (reduced || to === 0) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 1600;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function tiltAndGlow() {
  if (!finePointer || reduced) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--gx', `${x * 100}%`);
    card.style.setProperty('--gy', `${y * 100}%`);
    card.style.setProperty('--rx', `${(0.5 - y) * 6}deg`);
    card.style.setProperty('--ry', `${(x - 0.5) * 8}deg`);
  });
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest?.('.card');
    if (card && !card.contains(e.relatedTarget)) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
  });

  const device = $('.device');
  const hero = $('.hero');
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    device.style.transform = `rotateY(${-14 + x * 16}deg) rotateX(${6 - y * 12}deg)`;
  });
  hero.addEventListener('pointerleave', () => { device.style.transform = ''; });

  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest?.('.magnetic');
    $$('.magnetic').forEach((m) => { if (m !== b) { m.style.setProperty('--mx', '0px'); m.style.setProperty('--my', '0px'); } });
    if (!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--mx', `${(e.clientX - r.left - r.width / 2) * 0.25}px`);
    b.style.setProperty('--my', `${(e.clientY - r.top - r.height / 2) * 0.35}px`);
  });
}

function scrollEffects() {
  const bar = $('.progress'), nav = $('.nav');
  const links = $$('.nav-links a[href^="#"]');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  let lastY = scrollY, ticking = false;
  const update = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    const menuOpen = $('.nav-links').classList.contains('is-open');
    nav.classList.toggle('is-hidden', y > lastY && y > 300 && !menuOpen);
    lastY = y;
    let current = null;
    sections.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = s.id; });
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${current}`));
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// ---------------------------------------------------------
// التفاعل
// ---------------------------------------------------------
function setupBilling() {
  const box = $('.billing'), pill = $('.billing-pill');
  const place = () => {
    const on = $('.billing .is-on');
    pill.style.insetInlineStart = `${box.getBoundingClientRect().right - on.getBoundingClientRect().right}px`;
    pill.style.width = `${on.offsetWidth}px`;
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('is-on')) return;
    $$('.billing button').forEach((x) => x.classList.toggle('is-on', x === b));
    place();
    billing = b.dataset.billing;
    renderPlans(current.plans, billing);
    $$('.plan').forEach((p) => p.classList.add('is-in'));
    $$('.price b').forEach((p) => p.classList.add('flip'));
  });
  place();
  addEventListener('resize', place);
  document.fonts?.ready.then(place);
}

// رقم واتساب الحالي (قد يتحدّث بعد وصول أحدث نسخة من الإعدادات)
const currentWa = () => (current?.contact?.phones || []).find((p) => p.whatsapp && digits(p.number));

function setupForm() {
  const form = $('#contactForm');
  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-plan]');
    if (p) form.msg.value = `مهتم بباقة: ${p.dataset.plan}`;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('.form-error');
    err.textContent = '';
    let ok = true;
    [form.name, form.phone].forEach((f) => {
      f.classList.remove('is-bad');
      if (!f.value.trim()) { void f.offsetWidth; f.classList.add('is-bad'); ok = false; }
    });
    if (!ok) { err.textContent = 'اكتب اسمك ورقم جوالك حتى نقدر نرد عليك.'; return; }
    const wa = currentWa();
    if (!wa) { err.textContent = 'رقم التواصل غير متاح حالياً.'; return; }
    const text = `مرحباً PrimeView 👋\nالاسم: ${form.name.value.trim()}\nالجوال: ${form.phone.value.trim()}\nنوع المشروع: ${form.type.value}\n${form.msg.value.trim()}`;
    window.open(`https://wa.me/${digits(wa.number)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  });
}

function setupNav() {
  const btn = $('#menuBtn'), links = $('.nav-links');
  btn.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) { links.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }
  });
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pv-theme', next); } catch (e) { /* تجاهل */ }
    $('meta[name="theme-color"]').content = next === 'dark' ? '#0c1719' : '#f6efe3';
  });
}

// ---------------------------------------------------------
(function start() {
  // 1) نرسم فوراً بدون انتظار الشبكة
  const c = mergeContent(DEFAULT_CONTENT, cachedContent());
  render(c);
  setupNav();
  setupBilling();
  setupForm();
  observeReveals();
  pauseOffscreen();
  scrollEffects();
  tiltAndGlow();
  rotator(c.brand.words);

  // 2) أحدث نسخة من صفحة الإعدادات: نحدّث ما تغيّر فقط، ونحفظها للزيارة القادمة
  fetchSiteContent().then((saved) => {
    if (!saved) return;
    saveCache(saved);
    const fresh = mergeContent(DEFAULT_CONTENT, saved);
    if (JSON.stringify(fresh) === JSON.stringify(current)) return;
    render(fresh, current);
    observeReveals();
  });
})();
