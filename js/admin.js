// =========================================================
// PrimeView — صفحة الإعدادات
// كل قسم من الموقع له نموذج تعديل. الحفظ يكتب المحتوى كاملاً في pv_content.
// الحماية الحقيقية في قاعدة البيانات (RLS): فقط من في pv_admins يقدر يحفظ.
// =========================================================
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, MEDIA_BUCKET, mergeContent } from './config.js';
import { DEFAULT_CONTENT } from './content.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// ---------------------------------------------------------
// وصف الأقسام: كل حقل له مسار داخل المحتوى ونوع
// ---------------------------------------------------------
const F = (k, label, type = 'text', extra = {}) => ({ k, label, type, ...extra });

const SECTIONS = [
  {
    key: 'brand', icon: '✨', title: 'الواجهة الأولى',
    fields: [
      F('tagline', 'العنوان الكبير', 'text', { wide: true }),
      F('sub', 'الوصف تحت العنوان', 'textarea', { wide: true }),
      F('words', 'كلمات "نبني لك ..." المتبدّلة', 'lines', { hint: 'كل كلمة في سطر' }),
    ],
  },
  {
    key: 'stats', icon: '🔢', title: 'الأرقام',
    lists: [{ path: [], label: (i) => i.label, blank: { value: 0, suffix: '', label: '' }, fields: [
      F('value', 'الرقم', 'number'), F('suffix', 'بعد الرقم', 'text', { hint: 'مثل % أو +' }), F('label', 'الوصف'),
    ] }],
  },
  {
    key: 'services', icon: '🧩', title: 'الخدمات',
    lists: [{ path: [], label: (i) => i.title, blank: { icon: '⭐', title: '', text: '' }, fields: [
      F('icon', 'الأيقونة (إيموجي)'), F('title', 'اسم الخدمة'), F('text', 'الوصف', 'textarea', { wide: true }),
    ] }],
  },
  {
    key: 'work', icon: '🎬', title: 'أعمالنا',
    hint: 'ارفع فيديو قصير (mp4) أو صورة أو GIF لكل عمل. الفيديو يشتغل لوحده بدون صوت.',
    lists: [{ path: [], label: (i) => i.title, blank: { title: '', tag: '', text: '', media: '', poster: '', link: '' }, fields: [
      F('title', 'اسم العمل'), F('tag', 'التصنيف'),
      F('text', 'الوصف', 'textarea', { wide: true }),
      F('media', 'الفيديو أو الصورة', 'media', { wide: true, accept: 'video/mp4,video/webm,image/*' }),
      F('poster', 'صورة الغلاف (تظهر قبل تشغيل الفيديو)', 'media', { wide: true, accept: 'image/*' }),
      F('link', 'رابط التجربة (اختياري)', 'url', { wide: true, hint: 'اكتب demo/ لفتح النسخة التجريبية من نظام الكافيه' }),
    ] }],
  },
  {
    key: 'plans', icon: '💰', title: 'الأسعار والباقات',
    hint: 'السعر السنوي يُحسب تلقائياً = الشهري × 10 (توفير شهرين).',
    fields: [F('currency', 'رمز العملة'), F('note', 'ملاحظة تحت الباقات', 'textarea', { wide: true })],
    lists: [{ path: ['items'], title: 'الباقات', label: (i) => i.name, blank: { name: '', monthly: 0, setup: 0, featured: false, features: [] }, fields: [
      F('name', 'اسم الباقة'), F('monthly', 'السعر الشهري', 'number'), F('setup', 'سعر التجهيز (مرة واحدة)', 'number'),
      F('featured', 'باقة مميّزة (الأكثر طلباً)', 'check'),
      F('features', 'المميزات', 'lines', { wide: true, hint: 'كل ميزة في سطر' }),
    ] }],
  },
  {
    key: 'extras', icon: '➕', title: 'الإضافات',
    lists: [{ path: [], label: (i) => i.title, blank: { title: '', price: '' }, fields: [
      F('title', 'اسم الإضافة'), F('price', 'السعر', 'text', { hint: 'رقم أو "عند الطلب"' }),
    ] }],
  },
  {
    key: 'why', icon: '🏆', title: 'ليش PrimeView',
    lists: [{ path: [], label: (i) => i.title, blank: { icon: '⭐', title: '', text: '' }, fields: [
      F('icon', 'الأيقونة (إيموجي)'), F('title', 'العنوان'), F('text', 'الوصف', 'textarea', { wide: true }),
    ] }],
  },
  {
    key: 'steps', icon: '🪜', title: 'خطوات العمل',
    lists: [{ path: [], label: (i) => i.title, blank: { title: '', text: '' }, fields: [
      F('title', 'الخطوة'), F('text', 'الوصف', 'textarea', { wide: true }),
    ] }],
  },
  {
    key: 'testimonials', icon: '💬', title: 'آراء العملاء',
    hint: 'آراء حقيقية فقط من عملاء فعليين. القسم يختفي من الموقع إذا كانت القائمة فارغة.',
    lists: [{ path: [], label: (i) => i.name, blank: { name: '', role: '', text: '' }, fields: [
      F('name', 'اسم العميل'), F('role', 'نوع النشاط'), F('text', 'رأيه', 'textarea', { wide: true }),
    ] }],
  },
  {
    key: 'contact', icon: '📞', title: 'التواصل',
    fields: [
      F('email', 'البريد الإلكتروني', 'email'),
      F(['social', 'instagram'], 'رابط Instagram', 'url'),
      F(['social', 'facebook'], 'رابط Facebook', 'url'),
    ],
    lists: [{ path: ['phones'], title: 'أرقام التواصل', label: (i) => i.number || i.label, blank: { label: 'واتساب', number: '', whatsapp: true }, fields: [
      F('label', 'الوصف', 'text', { hint: 'مثل: واتساب، المبيعات، الدعم' }),
      F('number', 'الرقم مع رمز الدولة', 'tel', { hint: 'مثل +963 9xx xxx xxx' }),
      F('whatsapp', 'هذا الرقم عليه واتساب', 'check'),
    ] }],
  },
];

// ---------------------------------------------------------
// الحالة
// ---------------------------------------------------------
let state = null;       // المحتوى أثناء التعديل
let savedJSON = '';     // آخر نسخة محفوظة (لمعرفة إن كان هناك تغييرات)

const toPath = (p) => (Array.isArray(p) ? p : [p]);
const getAt = (obj, path) => path.reduce((o, k) => (o == null ? o : o[k]), obj);
function setAt(obj, path, val) {
  let o = obj;
  path.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[path[path.length - 1]] = val;
}

// ---------------------------------------------------------
// الرسم
// ---------------------------------------------------------
function fieldHTML(f, base) {
  const path = [...base, ...toPath(f.k)];
  const p = esc(JSON.stringify(path));
  const v = getAt(state, path);
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  const cls = `field${f.wide ? ' wide' : ''}`;
  switch (f.type) {
    case 'textarea':
      return `<label class="${cls}">${esc(f.label)}<textarea class="input" data-path="${p}" data-type="text">${esc(v)}</textarea>${hint}</label>`;
    case 'lines':
      return `<label class="${cls}">${esc(f.label)}<textarea class="input" data-path="${p}" data-type="lines" rows="4">${esc((v || []).join('\n'))}</textarea>${hint}</label>`;
    case 'check':
      return `<label class="check ${f.wide ? 'wide' : ''}"><input type="checkbox" data-path="${p}" data-type="check" ${v ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'number':
      return `<label class="${cls}">${esc(f.label)}<input class="input" type="number" min="0" step="any" inputmode="decimal" dir="ltr" data-path="${p}" data-type="number" value="${esc(v ?? 0)}">${hint}</label>`;
    case 'media': {
      const isVid = /\.(mp4|webm)(\?|$)/i.test(v || '');
      const prev = v ? (isVid ? `<video class="media-preview" src="${esc(v)}" muted loop autoplay playsinline></video>` : `<img class="media-preview" src="${esc(v)}" alt="">`) : '';
      return `<div class="${cls} media-field">${esc(f.label)}
        <div class="media-row">
          <input class="input" dir="ltr" placeholder="https://..." data-path="${p}" data-type="text" value="${esc(v)}">
          <label class="btn btn-ghost btn-sm upload">⬆ رفع ملف<input type="file" accept="${esc(f.accept)}" data-upload="${p}"></label>
        </div>${prev}${hint}</div>`;
    }
    default:
      return `<label class="${cls}">${esc(f.label)}<input class="input" type="${f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}" ${['url', 'tel', 'email'].includes(f.type) ? 'dir="ltr"' : ''} data-path="${p}" data-type="text" value="${esc(v)}">${hint}</label>`;
  }
}

function listHTML(sec, list) {
  const lp = [sec.key, ...list.path];
  const arr = getAt(state, lp) || [];
  const lpj = esc(JSON.stringify(lp));
  return `<div class="list-block">
    ${list.title ? `<h3 class="list-title">${esc(list.title)}</h3>` : ''}
    <div class="items">${arr.map((it, i) => `
      <div class="item">
        <div class="item-head">
          <b>${esc(list.label(it) || 'عنصر جديد')}</b>
          <button class="mini" type="button" title="لأعلى" data-act="up" data-list="${lpj}" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini" type="button" title="لأسفل" data-act="down" data-list="${lpj}" data-i="${i}" ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini danger" type="button" title="حذف" data-act="del" data-list="${lpj}" data-i="${i}">🗑</button>
        </div>
        <div class="fields">${list.fields.map((f) => fieldHTML(f, [...lp, i])).join('')}</div>
      </div>`).join('')}
    </div>
    <button class="add-btn" type="button" data-act="add" data-sec="${esc(sec.key)}" data-list="${lpj}">+ إضافة</button>
  </div>`;
}

function sectionHTML(sec) {
  return `<section class="panel" id="sec-${esc(sec.key)}" data-sec="${esc(sec.key)}">
    <div class="panel-head"><h2>${sec.icon} ${esc(sec.title)}</h2></div>
    ${sec.hint ? `<p class="panel-hint">${esc(sec.hint)}</p>` : ''}
    ${sec.fields ? `<div class="fields">${sec.fields.map((f) => fieldHTML(f, [sec.key])).join('')}</div>` : ''}
    ${(sec.lists || []).map((l) => listHTML(sec, l)).join('')}
  </section>`;
}

function renderAll() {
  $('#adminNav').innerHTML = SECTIONS.map((s) => `<a href="#sec-${esc(s.key)}">${s.icon} ${esc(s.title)}</a>`).join('');
  $('#editor').innerHTML = SECTIONS.map(sectionHTML).join('');
  watchNav();
}

function rerenderSection(key) {
  const sec = SECTIONS.find((s) => s.key === key);
  const old = $(`#sec-${key}`);
  const tmp = document.createElement('div');
  tmp.innerHTML = sectionHTML(sec);
  const fresh = tmp.firstElementChild;
  fresh.style.animation = 'none';
  old.replaceWith(fresh);
}

function watchNav() {
  const links = $$('#adminNav a');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  $$('.panel').forEach((p) => io.observe(p));
}

// ---------------------------------------------------------
// التعديل
// ---------------------------------------------------------
function markDirty() {
  const dirty = JSON.stringify(state) !== savedJSON;
  $('#saveBtn').disabled = !dirty;
  const s = $('#saveState');
  s.textContent = dirty ? 'تغييرات غير محفوظة' : 'كل شيء محفوظ ✓';
  s.classList.toggle('dirty', dirty);
}

function onInput(e) {
  const el = e.target.closest('[data-path]');
  if (!el) return;
  const path = JSON.parse(el.dataset.path);
  let v;
  switch (el.dataset.type) {
    case 'number': v = el.value === '' ? 0 : Math.max(0, Number(el.value)); break;
    case 'check': v = el.checked; break;
    case 'lines': v = el.value.split('\n').map((x) => x.trim()).filter(Boolean); break;
    default: v = el.value;
  }
  setAt(state, path, v);
  markDirty();
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const lp = JSON.parse(b.dataset.list);
  const key = lp[0];
  const arr = getAt(state, lp) || [];
  const i = Number(b.dataset.i);
  if (b.dataset.act === 'add') {
    const sec = SECTIONS.find((s) => s.key === key);
    const list = sec.lists.find((l) => JSON.stringify([key, ...l.path]) === JSON.stringify(lp));
    arr.push(structuredClone(list.blank));
    setAt(state, lp, arr);
  } else if (b.dataset.act === 'del') {
    if (!confirm('حذف هذا العنصر؟ (لن يُحذف من الموقع قبل الضغط على "حفظ التغييرات")')) return;
    arr.splice(i, 1);
  } else if (b.dataset.act === 'up' && i > 0) {
    [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  } else if (b.dataset.act === 'down' && i < arr.length - 1) {
    [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  }
  rerenderSection(key);
  markDirty();
}

async function onUpload(e) {
  const input = e.target.closest('[data-upload]');
  if (!input || !input.files?.length) return;
  const file = input.files[0];
  if (file.size > 50 * 1024 * 1024) { toast('الملف أكبر من 50 ميغا. صغّره وجرّب مرة ثانية.', true); return; }
  const path = JSON.parse(input.dataset.upload);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = `${path[0]}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const wrap = input.closest('.media-field');
  wrap.insertAdjacentHTML('beforeend', '<div class="progress-line"><span></span></div>');
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(name, file, { cacheControl: '31536000', contentType: file.type });
  wrap.querySelector('.progress-line')?.remove();
  if (error) { toast(`فشل الرفع: ${error.message}`, true); return; }
  const { data } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(name);
  setAt(state, path, data.publicUrl);
  rerenderSection(path[0]);
  markDirty();
  toast('تم رفع الملف. اضغط "حفظ التغييرات" ليظهر على الموقع.');
}

function validate() {
  const bad = [];
  const isLink = (u) => !u || /^https:\/\//.test(u);
  (state.work || []).forEach((w, i) => {
    ['media', 'poster', 'link'].forEach((k) => { if (!isLink(w[k]) && !/^(assets|demo)\//.test(w[k])) bad.push(`أعمالنا ${i + 1}: الرابط يجب أن يبدأ بـ https://`); });
  });
  Object.entries(state.contact?.social || {}).forEach(([k, u]) => { if (!isLink(u)) bad.push(`رابط ${k} يجب أن يبدأ بـ https://`); });
  (state.contact?.phones || []).forEach((p, i) => { if (p.number && String(p.number).replace(/\D/g, '').length < 7) bad.push(`الرقم ${i + 1} قصير جداً`); });
  return bad;
}

async function save() {
  const bad = validate();
  if (bad.length) { toast(bad[0], true); return; }
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.textContent = 'جارِ الحفظ...';
  const { data, error } = await sb.from('pv_content').update({ data: state }).eq('id', 1).select('updated_at');
  btn.textContent = 'حفظ التغييرات';
  if (error || !data?.length) {
    toast(error ? `لم يُحفظ: ${error.message}` : 'لم يُحفظ: لا تملك صلاحية.', true);
    markDirty();
    return;
  }
  savedJSON = JSON.stringify(state);
  markDirty();
  toast('تم الحفظ ✓ التغييرات ظاهرة على الموقع الآن.');
}

function toast(msg, isErr = false) {
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  const t = document.createElement('div');
  t.className = `toast${isErr ? ' err' : ''}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3500);
}

// ---------------------------------------------------------
// الدخول والتحقق من الصلاحية
// ---------------------------------------------------------
function show(id) {
  ['login', 'denied', 'app'].forEach((x) => $(`#${x}`).classList.toggle('hidden', x !== id));
}

let started = false;
let checking = false;   // يمنع التشغيل مرتين عند وصول INITIAL_SESSION و SIGNED_IN معاً

async function onSession(session) {
  if (!session) { if (started) location.reload(); else show('login'); return; }
  if (started || checking) return;
  checking = true;
  try {
    const { data: admin, error } = await sb.from('pv_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (error || !admin) { show('denied'); return; }
    const { data: row, error: e2 } = await sb.from('pv_content').select('data').eq('id', 1).maybeSingle();
    if (e2) { toast(`تعذّر تحميل المحتوى: ${e2.message}`, true); return; }
    state = mergeContent(DEFAULT_CONTENT, row?.data);
    savedJSON = JSON.stringify(mergeContent(DEFAULT_CONTENT, row?.data));
    started = true;
    show('app');
    renderAll();
    markDirty();
  } finally {
    checking = false;
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = f.querySelector('.form-error');
  err.textContent = '';
  const btn = f.querySelector('button');
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  btn.disabled = false;
  if (error) err.textContent = 'البريد أو كلمة السر غير صحيحة.';
});

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-action="signout"]')) {
    if (JSON.stringify(state) !== savedJSON && state && !confirm('عندك تغييرات غير محفوظة. تخرج بدون حفظ؟')) return;
    savedJSON = JSON.stringify(state);
    await sb.auth.signOut();
    location.reload();
  }
});
$('#editor').addEventListener('input', onInput);
$('#editor').addEventListener('change', (e) => { if (e.target.matches('[data-upload]')) onUpload(e); else onInput(e); });
$('#editor').addEventListener('click', onClick);
$('#saveBtn').addEventListener('click', save);
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('pv-theme', next); } catch { /* تجاهل */ }
});
addEventListener('beforeunload', (e) => {
  if (state && JSON.stringify(state) !== savedJSON) { e.preventDefault(); e.returnValue = ''; }
});

sb.auth.onAuthStateChange((_event, session) => { setTimeout(() => onSession(session), 0); });
