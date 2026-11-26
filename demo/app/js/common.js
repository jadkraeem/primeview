// =========================================================
// Mr Black — أدوات مشتركة لكل الصفحات
// =========================================================
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const TZ = 'Asia/Damascus';

// ---------------------------------------------------------
// الحماية من XSS: كل قيمة تمرّ عبر html`` تُنظَّف تلقائياً
// ---------------------------------------------------------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

/** قالب HTML آمن: القيم المُدرجة تُنظَّف دائماً إلا إذا كانت من html`` آخر */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export function setHTML(el, tpl) {
  el.innerHTML = tpl instanceof Raw ? tpl.s : esc(tpl);
}

/** يقبل فقط روابط https الآمنة للصور */
export function safeUrl(u) {
  if (typeof u !== 'string') return '';
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------
// تنسيق
// ---------------------------------------------------------
let currency = 'ل.س';
export const setCurrency = (c) => { if (c) currency = c; };
export const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
export const money = (n) => `${fmtNum(n)} ${currency}`;

export function fmtTime(ts) {
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}
export function fmtDateTime(ts) {
  return new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts));
}
/** المدة المنقضية بصيغة 05:32 أو 1:05:32 */
export function elapsed(fromTs, toTs = Date.now()) {
  let s = Math.max(0, Math.floor((new Date(toTs) - new Date(fromTs)) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
export const minutesSince = (ts) => (Date.now() - new Date(ts)) / 60000;

/** إزاحة المنطقة الزمنية بالدقائق لتاريخ معيّن */
function tzOffsetMin(date, tz = TZ) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}
/** بداية يوم (YYYY-MM-DD) بتوقيت دمشق كـ Date */
export function dayStart(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  return new Date(guess.getTime() - tzOffsetMin(guess) * 60000);
}
/** تاريخ اليوم بتوقيت دمشق YYYY-MM-DD */
export function todayYMD(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------
// تسميات
// ---------------------------------------------------------
export const ROLE_LABELS = { manager: 'مدير', cashier: 'كاشير', kitchen: 'مطبخ' };
export const STATUS_LABELS = {
  new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التسليم', cancelled: 'ملغى',
};
export const STATUS_BADGE = {
  new: 'badge-gold', preparing: 'badge-warn', ready: 'badge-ok', served: '', cancelled: 'badge-danger',
};

// ---------------------------------------------------------
// رسائل الأخطاء
// ---------------------------------------------------------
export function errMsg(e) {
  if (!navigator.onLine) return 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.';
  const m = String(e?.message || e || '');
  const code = e?.code;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(m)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.';
  if (code === '23505') return 'هذه القيمة موجودة مسبقاً.';
  if (code === '23503') return 'لا يمكن الحذف لأن هذا العنصر مرتبط ببيانات أخرى. جرّب تعطيله بدلاً من حذفه.';
  if (code === '23514' || code === '22P02') return 'بعض القيم غير صالحة. راجع الحقول وحاول مرة أخرى.';
  if (/[؀-ۿ]/.test(m)) return m; // رسالة عربية واضحة من السيرفر
  if (code === '42501' || /permission denied|row-level security/i.test(m)) return 'ليس لديك صلاحية لهذه العملية.';
  if (/JWT|session|token|not authenticated/i.test(m)) return 'انتهت الجلسة. سجّل الدخول من جديد.';
  return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

// ---------------------------------------------------------
// تنبيهات منبثقة
// ---------------------------------------------------------
export function toast(msg, type = 'info', ms = 3800) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  while (box.children.length >= 2) box.firstElementChild.remove();   // لا تتراكم الرسائل
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
export const toastError = (e) => toast(errMsg(e), 'error', 5500);

/** حالة التحميل على زر */
export async function withBusy(btn, fn) {
  if (btn) { btn.classList.add('is-busy'); btn.disabled = true; }
  try { return await fn(); }
  finally { if (btn) { btn.classList.remove('is-busy'); btn.disabled = false; } }
}

// ---------------------------------------------------------
// نافذة منبثقة
// ---------------------------------------------------------
export function openModal(title, bodyTpl, { wide = false } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  setHTML(back, html`
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}" ${raw(wide ? 'style="max-width:760px"' : '')}>
      <div class="modal-head"><h3>${title}</h3>
        <button class="btn btn-ghost btn-icon" data-close aria-label="إغلاق">✕</button></div>
      <div class="modal-body"></div>
    </div>`);
  const body = back.querySelector('.modal-body');
  if (bodyTpl instanceof Node) body.appendChild(bodyTpl); else setHTML(body, bodyTpl);
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  (back.querySelector('input, select, textarea') || back.querySelector('[data-close]'))?.focus();
  return { root: back, body, close };
}

export function confirmDialog(message, { okLabel = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal('تأكيد', html`
      <p style="margin-bottom:18px">${message}</p>
      <div class="row">
        <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-ok>${okLabel}</button>
        <button class="btn" data-no>إلغاء</button>
      </div>`);
    const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    m.body.querySelector('[data-ok]').onclick = () => finish(true);
    m.body.querySelector('[data-no]').onclick = () => finish(false);
    m.root.addEventListener('click', (e) => {
      if (e.target === m.root || e.target.closest('[data-close]')) finish(false);
    });
    new MutationObserver((_, obs) => { if (!m.root.isConnected) { obs.disconnect(); finish(false); } })
      .observe(document.body, { childList: true });
  });
}

/** قراءة نموذج إلى كائن */
export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------------------------------------------------------
// الصوت (لا يحتاج ملفات خارجية)
// ---------------------------------------------------------
let audioCtx = null;
export function unlockAudio() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  } catch { return false; }
}
export const audioReady = () => !!audioCtx && audioCtx.state === 'running';
export function beep(times = 3) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime;
  for (let i = 0; i < times; i++) {
    [880, 1320].forEach((f, j) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = now + i * 0.45 + j * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.16);
    });
  }
}

// ---------------------------------------------------------
// تصدير CSV (مع حماية من حقن الصيغ في Excel)
// ---------------------------------------------------------
export function downloadCSV(filename, rows) {
  const cell = (v) => {
    if (typeof v === 'number') return String(v);
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------
// بوابة الموظفين: تسجيل الدخول + التحقق من الدور
// ---------------------------------------------------------
function loginErrorMsg(error) {
  const m = String(error?.message || '');
  if (/invalid login credentials/i.test(m)) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if (/banned|disabled/i.test(m)) return 'هذا الحساب معطّل. تواصل مع المدير.';
  if (error?.status === 429 || /rate limit|too many/i.test(m)) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
  if (/email not confirmed/i.test(m)) return 'البريد غير مؤكَّد. تواصل مع المدير.';
  return errMsg(error);
}

function renderLogin(root, title) {
  setHTML(root, html`
    <div class="login-screen">
      <form class="login-box card" novalidate>
        <span class="brand">Mr Black<small>COFFEE & LOUNGE</small></span>
        <h2>${title}</h2>
        <div class="field"><label class="sr-only" for="lg-email">البريد الإلكتروني</label>
          <input class="input" id="lg-email" name="email" type="email" autocomplete="username" required placeholder="البريد الإلكتروني"></div>
        <div class="field"><label class="sr-only" for="lg-pass">كلمة المرور</label>
          <input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" required placeholder="كلمة المرور"></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" style="width:100%;min-height:46px;font-size:16px" type="submit">دخول</button>
      </form>
    </div>`);
  const form = root.querySelector('form');
  const errBox = form.querySelector('.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { email, password } = formData(form);
    errBox.textContent = '';
    if (!email || !password) { errBox.textContent = 'أدخل البريد الإلكتروني وكلمة المرور.'; return; }
    await withBusy(form.querySelector('button'), async () => {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) errBox.textContent = loginErrorMsg(error);
    });
  });
  form.querySelector('input').focus();
}

function renderBlocked(root, title, message, extra = '') {
  setHTML(root, html`
    <div class="login-screen"><div class="login-box card state">
      <span class="brand">Mr Black<small>COFFEE & LOUNGE</small></span>
      <h3 style="margin-top:14px">${title}</h3>
      <p>${message}</p>
      ${raw(extra)}
      <button class="btn" data-logout>تسجيل الخروج</button>
    </div></div>`);
  root.querySelector('[data-logout]').onclick = () => sb.auth.signOut();
}

/**
 * يعرض شاشة الدخول حتى يسجّل موظف مسموح له، ثم يستدعي onReady(profile).
 * allowed: الأدوار المسموحة لهذه الصفحة.
 */
export function staffGate({ root, allowed, title, onReady }) {
  let started = false;
  let checking = false;   // يمنع تشغيل اللوحة مرتين عند وصول INITIAL_SESSION و SIGNED_IN معاً
  const check = async (session) => {
    if (!session) {
      if (started) { location.reload(); return; }
      if (!checking) renderLogin(root, title);
      return;
    }
    if (started || checking) return;
    checking = true;
    try { await checkProfile(session); } finally { checking = false; }
  };
  const checkProfile = async (session) => {
    setHTML(root, html`<div class="login-screen"><div class="state"><div class="spinner"></div>جارٍ التحقق من الحساب…</div></div>`);
    const { data: profile, error } = await sb.from('profiles')
      .select('id, full_name, role, active').eq('id', session.user.id).maybeSingle();
    if (error) { renderBlocked(root, 'تعذّر التحقق', errMsg(error)); return; }
    if (!profile) { renderBlocked(root, 'حساب غير مرتبط', 'هذا الحساب غير مسجّل كموظف. تواصل مع المدير.'); return; }
    if (!profile.active) { renderBlocked(root, 'الحساب معطّل', 'تم تعطيل هذا الحساب. تواصل مع المدير.'); return; }
    if (!allowed.includes(profile.role)) {
      const link = profile.role === 'kitchen'
        ? '<p style="margin:10px 0"><a href="kitchen.html">الانتقال إلى شاشة المطبخ ←</a></p>'
        : '<p style="margin:10px 0"><a href="casher.html">الانتقال إلى لوحة الكاشير ←</a></p>';
      renderBlocked(root, 'لا تملك صلاحية لهذه الصفحة', `دورك: ${ROLE_LABELS[profile.role]}`, link);
      return;
    }
    started = true;
    onReady(profile, session);
  };

  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { location.reload(); return; }
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') setTimeout(() => check(session), 0);
  });
}

export const signOut = () => sb.auth.signOut();

// ---------------------------------------------------------
// الوضع النهاري / الليلي
// ---------------------------------------------------------
export const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'dark';
const themeIcon = (t) => (t === 'light' ? '🌙' : '☀️');
const themeTitle = (t) => (t === 'light' ? 'الوضع الليلي' : 'الوضع النهاري');

export function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('mrblack-theme', JSON.stringify({ t, day: new Date().toDateString() })); } catch { /* ignore */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f7f3ec' : '#0f0f10');
  document.querySelectorAll('[data-theme-btn]').forEach((b) => {
    b.textContent = themeIcon(t);
    b.title = themeTitle(t);
    b.setAttribute('aria-label', themeTitle(t));
  });
}

export function themeButtonTpl(extraClass = 'btn btn-sm') {
  const t = currentTheme();
  return html`<button class="${extraClass} theme-btn" data-theme-btn type="button" title="${themeTitle(t)}" aria-label="${themeTitle(t)}">${themeIcon(t)}</button>`;
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-theme-btn]')) setTheme(currentTheme() === 'light' ? 'dark' : 'light');
});
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', currentTheme() === 'light' ? '#f7f3ec' : '#0f0f10');
