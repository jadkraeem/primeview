// =========================================================
// Mr Black — منيو الزبون
// الأسعار المعروضة هنا للعرض فقط؛ السعر النهائي يُحسب على السيرفر.
// =========================================================
import {
  sb, html, setHTML, raw, $, $$, money, setCurrency, errMsg, toast, toastError,
  openModal, withBusy, safeUrl, fmtDateTime,
} from './common.js';

const app = $('#app');
const params = new URLSearchParams(location.search);
const tableParam = params.get('table') ?? '';
const TABLE = /^[0-9]{1,3}$/.test(tableParam) ? Number(tableParam) : null;
const CART_KEY = `mrblack-cart-${TABLE}`;
const MAX_NOTE = 200;

const state = {
  ctx: null,
  categories: [],
  items: new Map(),     // id -> item
  offers: [],
  events: [],
  filter: 'all',
  cart: [],             // [{key, item_id, qty, note}]
  sending: false,
};

// ---------- السلة (محفوظة في المتصفح) ----------
function loadCart() {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    state.cart = Array.isArray(c) ? c.filter((l) => Number.isInteger(l.item_id) && Number.isInteger(l.qty) && l.qty > 0)
      .map((l) => ({ key: String(l.key || newKey()), item_id: l.item_id, qty: Math.min(l.qty, 50), note: String(l.note || '').slice(0, MAX_NOTE) })) : [];
  } catch { state.cart = []; }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCartBar();
}
const newKey = () => Math.random().toString(36).slice(2, 10);
const cartCount = () => state.cart.reduce((s, l) => s + l.qty, 0);
const qtyOfItem = (id) => state.cart.filter((l) => l.item_id === id).reduce((s, l) => s + l.qty, 0);

/** تقدير الخصم للعرض فقط (نفس منطق السيرفر) */
function unitDiscount(item) {
  let best = 0;
  for (const o of state.offers) {
    if (o.discount_type === 'none') continue;
    const applies = o.item_id === item.id || o.category_id === item.category_id || (o.item_id == null && o.category_id == null);
    if (!applies) continue;
    const d = o.discount_type === 'percent'
      ? Math.round(item.price * Number(o.discount_value) / 100)
      : Math.round(Number(o.discount_value));
    best = Math.max(best, Math.min(d, item.price));
  }
  return best;
}
const unitPrice = (item) => item.price - unitDiscount(item);

function estimateTotal() {
  const net = state.cart.reduce((s, l) => {
    const it = state.items.get(l.item_id);
    return it ? s + unitPrice(it) * l.qty : s;
  }, 0);
  const { tax_percent = 0, service_percent = 0 } = state.ctx || {};
  return net + Math.round(net * service_percent / 100) + Math.round(net * tax_percent / 100);
}

function addItem(id) {
  const it = state.items.get(id);
  if (!it || it.sold_out) { toast('هذا الصنف نفد حالياً.', 'error'); return; }
  if (qtyOfItem(id) >= 50) { toast('الحد الأقصى 50 من الصنف الواحد.', 'error'); return; }
  const line = state.cart.find((l) => l.item_id === id && !l.note);
  if (line) line.qty += 1; else state.cart.push({ key: newKey(), item_id: id, qty: 1, note: '' });
  saveCart();
  updateButton(id);
  if (qtyOfItem(id) === 1) toast(`تمت إضافة ${it.name} للسلة ✓`, 'info', 1600);
}
function removeOne(id) {
  const lines = state.cart.filter((l) => l.item_id === id);
  const line = lines.find((l) => !l.note) || lines[lines.length - 1];
  if (!line) return;
  line.qty -= 1;
  if (line.qty <= 0) state.cart = state.cart.filter((l) => l !== line);
  saveCart();
  updateButton(id);
}

// ---------- العرض ----------
function buttonTpl(it) {
  if (it.sold_out) return html`<button class="add-btn sold" type="button" disabled>نفد حالياً ✕</button>`;
  const q = qtyOfItem(it.id);
  if (!q) return html`<button class="add-btn" data-add="${it.id}" type="button">+ أضف للسلة</button>`;
  return html`<div class="stepper">
    <button class="btn" data-dec="${it.id}" type="button" aria-label="إنقاص">−</button>
    <span class="qty num">${q}</span>
    <button class="btn btn-gold" data-add="${it.id}" type="button" aria-label="إضافة">+</button></div>`;
}
function updateButton(id) {
  const box = app.querySelector(`[data-btn="${id}"]`);
  const it = state.items.get(id);
  if (box && it) setHTML(box, buttonTpl(it));
}

function productTpl(it) {
  const disc = it.sold_out ? 0 : unitDiscount(it);
  const img = safeUrl(it.image_url);
  return html`
    <article class="product ${it.sold_out ? 'is-sold' : ''}">
      ${img ? html`<img class="product-img" src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div class="product-info">
        <h3>${it.name}</h3>
        ${it.name_en ? html`<p class="en">${it.name_en}</p>` : ''}
        ${it.description ? html`<p class="desc">${it.description}</p>` : ''}
        <div class="price num">${money(it.price - disc)}${disc ? html`<s>${money(it.price)}</s>` : ''}</div>
        <div data-btn="${it.id}">${buttonTpl(it)}</div>
      </div>
    </article>`;
}

function renderChips(cats) {
  setHTML($('#chips'), html`
    <button class="category ${state.filter === 'all' ? 'on' : ''}" data-cat="all" type="button">كل الأصناف</button>
    ${cats.map((c) => html`<button class="category ${String(state.filter) === String(c.id) ? 'on' : ''}" data-cat="${c.id}" type="button">${c.name}</button>`)}`);
}

function renderMenu() {
  const byCat = new Map(state.categories.map((c) => [c.id, []]));
  for (const it of state.items.values()) byCat.get(it.category_id)?.push(it);
  const cats = state.categories.filter((c) => byCat.get(c.id).length);
  const sortItems = (list) => list.sort((a, b) => a.sort - b.sort || a.id - b.id);

  if (!cats.length) {
    setHTML(app, html`<div class="state" style="grid-column:1/-1"><h3>المنيو فارغ حالياً</h3><p>لا توجد أصناف الآن. يرجى سؤال الكاشير.</p></div>`);
    setHTML($('#chips'), '');
    return;
  }
  if (state.filter !== 'all' && !cats.some((c) => String(c.id) === String(state.filter))) state.filter = 'all';
  renderChips(cats);

  if (state.filter === 'all') {
    setHTML(app, html`${cats.map((c) => html`<h3 class="cat-title">${c.name}</h3>${sortItems(byCat.get(c.id)).map(productTpl)}`)}`);
  } else {
    setHTML(app, html`${sortItems(byCat.get(Number(state.filter))).map(productTpl)}`);
  }
}

// ---------- العروض والفعاليات ----------
function offerLabel(o) {
  if (o.discount_type === 'percent') return `خصم ${Number(o.discount_value)}%`;
  if (o.discount_type === 'fixed') return `خصم ${money(o.discount_value)}`;
  return '';
}
function whenLabel(e) {
  if (e.starts_at && e.ends_at) return `${fmtDateTime(e.starts_at)} ← ${fmtDateTime(e.ends_at)}`;
  if (e.starts_at) return `يبدأ ${fmtDateTime(e.starts_at)}`;
  if (e.ends_at) return `حتى ${fmtDateTime(e.ends_at)}`;
  return '';
}
function renderNews() {
  const sep = '   •••   ';
  $('#offers-marquee').textContent = state.offers.length
    ? state.offers.map((o) => [o.title, offerLabel(o)].filter(Boolean).join(' — ')).join(sep)
    : 'لا توجد عروض حالياً… تابعونا!';
  $('#events-marquee').textContent = state.events.length
    ? state.events.map((e) => e.title).join(sep)
    : 'لا توجد فعاليات حالياً… ترقّبوا الجديد!';
}
function showOffers() {
  openModal('🏷️ عروض Mr Black', state.offers.length ? html`${state.offers.map((o) => html`
    <div class="news-item"><b>${o.title}</b>
      ${offerLabel(o) ? html`<span class="badge badge-gold" style="margin-top:6px">${offerLabel(o)}</span>` : ''}
      ${o.description ? html`<p>${o.description}</p>` : ''}
      ${o.ends_at ? html`<div class="when num">ينتهي ${fmtDateTime(o.ends_at)}</div>` : ''}</div>`)}`
    : html`<div class="state"><h3>لا توجد عروض حالياً</h3><p>تابعونا قريباً!</p></div>`);
}
function showEvents() {
  openModal('🎉 الفعاليات', state.events.length ? html`${state.events.map((e) => html`
    <div class="news-item"><b>${e.title}</b>
      ${e.description ? html`<p>${e.description}</p>` : ''}
      ${whenLabel(e) ? html`<div class="when num">🗓 ${whenLabel(e)}</div>` : ''}</div>`)}`
    : html`<div class="state"><h3>لا توجد فعاليات حالياً</h3><p>ترقّبوا الجديد!</p></div>`);
}

let lastCount = 0;
function renderCartBar() {
  const n = cartCount();
  $('#cart-count-top').textContent = n;
  $('#cart-total-top').textContent = n ? money(estimateTotal()) : '';
  if (n > lastCount) {
    const b = $('#cart-btn-top');
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
  lastCount = n;
}

// ---------- السلة ----------
let cartModal = null;
let quoteSeq = 0;

function payloadItems() {
  return state.cart.map((l) => ({ item_id: l.item_id, qty: l.qty, note: l.note.trim() || null }));
}

function totalsTpl(q) {
  return html`<div class="totals">
    <div><span>المجموع</span><span class="num">${money(q.subtotal)}</span></div>
    ${q.discount ? html`<div><span>الخصم</span><span class="num">− ${money(q.discount)}</span></div>` : ''}
    ${Number(q.service_percent) ? html`<div><span>رسوم الخدمة (${Number(q.service_percent)}%)</span><span class="num">${money(q.service)}</span></div>` : ''}
    ${Number(q.tax_percent) ? html`<div><span>الضريبة (${Number(q.tax_percent)}%)</span><span class="num">${money(q.tax)}</span></div>` : ''}
    <div class="grand"><span>الإجمالي</span><span class="num">${money(q.total)}</span></div>
  </div>`;
}

async function refreshQuote() {
  if (!cartModal) return;
  const box = cartModal.body.querySelector('[data-totals]');
  const sendBtn = cartModal.body.querySelector('[data-send]');
  if (!box || !sendBtn || !state.cart.length) return;
  const seq = ++quoteSeq;
  box.style.opacity = '.5';
  const { data, error } = await sb.rpc('quote_order', { p_items: payloadItems() });
  if (seq !== quoteSeq || !cartModal) return;
  box.style.opacity = '1';
  if (error) {
    setHTML(box, html`<p class="form-error" style="margin-top:12px">${errMsg(error)}</p>`);
    sendBtn.disabled = true;
    return;
  }
  sendBtn.disabled = false;
  setHTML(box, totalsTpl(data));
}
let quoteTimer;
const refreshQuoteSoon = () => { clearTimeout(quoteTimer); quoteTimer = setTimeout(refreshQuote, 350); };

function renderCartBody() {
  if (!cartModal) return;
  const linesBox = cartModal.body.querySelector('[data-lines]');
  if (!state.cart.length) {
    setHTML(cartModal.body, html`<div class="state"><h3>السلة فارغة</h3><p>أضف أصنافاً من المنيو.</p>
      <button class="btn btn-gold" data-close type="button">العودة للمنيو</button></div>`);
    return;
  }
  if (!linesBox) return;
  setHTML(linesBox, html`${state.cart.map((l) => {
    const it = state.items.get(l.item_id);
    return html`<div class="cart-line" data-key="${l.key}">
      <div class="cart-line-top">
        <div><b>${it?.name ?? 'صنف'}</b><div class="muted num" style="font-size:13px">${it ? money(unitPrice(it)) : ''}</div></div>
        <div class="stepper">
          <button class="btn" data-line-dec type="button" aria-label="إنقاص">−</button>
          <span class="qty num">${l.qty}</span>
          <button class="btn btn-gold" data-line-inc type="button" aria-label="زيادة">+</button>
        </div>
      </div>
      <input class="input" data-note maxlength="${MAX_NOTE}" placeholder="ملاحظة (اختياري): مثلاً بدون سكر" value="${l.note}">
    </div>`;
  })}`);
}

function openCart() {
  if (TABLE === null) { toast('امسح رمز QR الموجود على طاولتك للطلب.', 'error'); return; }
  if (!cartCount()) { toast('السلة فارغة. أضف أصنافاً من المنيو.'); return; }
  cartModal = openModal('🛒 سلتك', html`
    <div data-lines></div>
    <div data-totals></div>
    <p class="form-error" data-err style="margin-top:10px"></p>
    <button class="btn btn-gold" data-send type="button" style="width:100%;margin-top:6px;min-height:50px">إرسال الطلب — طاولة ${TABLE}</button>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:8px">السعر النهائي يُحسب من النظام عند الإرسال.</p>`);
  const m = cartModal;
  renderCartBody();
  refreshQuote();

  m.body.addEventListener('click', (e) => {
    const lineEl = e.target.closest('[data-key]');
    if (lineEl) {
      const line = state.cart.find((l) => l.key === lineEl.dataset.key);
      if (!line) return;
      if (e.target.closest('[data-line-inc]')) {
        if (qtyOfItem(line.item_id) >= 50) { toast('الحد الأقصى 50 من الصنف الواحد.', 'error'); return; }
        line.qty += 1;
      } else if (e.target.closest('[data-line-dec]')) {
        line.qty -= 1;
        if (line.qty <= 0) state.cart = state.cart.filter((x) => x !== line);
      } else return;
      saveCart();
      updateButton(line.item_id);
      renderCartBody();
      refreshQuoteSoon();
    }
    if (e.target.closest('[data-send]')) sendOrder(e.target.closest('[data-send]'));
  });
  m.body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-note]')) return;
    const line = state.cart.find((l) => l.key === e.target.closest('[data-key]').dataset.key);
    if (line) { line.note = e.target.value.slice(0, MAX_NOTE); saveCart(); }
  });
  new MutationObserver((_, obs) => {
    if (!m.root.isConnected) { obs.disconnect(); if (cartModal === m) cartModal = null; }
  }).observe(document.body, { childList: true });
}

async function sendOrder(btn) {
  if (state.sending || !state.cart.length) return;
  const errBox = cartModal.body.querySelector('[data-err]');
  errBox.textContent = '';
  state.sending = true;
  try {
    await withBusy(btn, async () => {
      const { data, error } = await sb.rpc('place_order', { p_table: TABLE, p_items: payloadItems() });
      if (error) { errBox.textContent = errMsg(error); return; }
      const ids = new Set(state.cart.map((l) => l.item_id));
      state.cart = [];
      saveCart();
      cartModal?.close();
      ids.forEach(updateButton);
      showInvoice(data, true);
    });
  } finally {
    state.sending = false;
  }
}

// ---------- الفاتورة ----------

function invoiceTpl(inv, fresh) {
  return html`<div class="invoice">
    ${fresh ? html`<div class="invoice-head"><div class="ok-icon" aria-hidden="true">✓</div>
      <h3>تم إرسال طلبك</h3><p class="muted">سيبدأ تحضيره الآن. شكراً لاختيارك Mr Black</p></div>` : ''}
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <b>فاتورة رقم <span class="num">#${inv.order_id}</span></b>
        <span class="muted num" style="font-size:13px">طاولة ${inv.table_number} · ${fmtDateTime(inv.created_at)}</span>
      </div>
      <div class="invoice-lines">${inv.lines.map((l) => html`<div>
        <span><span class="num">${l.qty}×</span> ${l.item_name}${l.note ? html`<em>${l.note}</em>` : ''}</span>
        <span class="num">${money(l.line_total)}</span></div>`)}</div>
      ${totalsTpl(inv)}
    </div>
  </div>`;
}

function showInvoice(inv, fresh = false) {
  openModal(fresh ? 'الفاتورة' : `فاتورة #${inv.order_id}`, html`
    ${invoiceTpl(inv, fresh)}
    <button class="btn btn-gold" data-close type="button" style="width:100%;margin-top:12px">${fresh ? 'متابعة التصفح' : 'إغلاق'}</button>`);
}


// ---------- التشغيل ----------
function fillCafeInfo(ctx) {
  setCurrency(ctx.currency);
  document.title = `${ctx.cafe_name} — المنيو`;
  if (ctx.tagline) $('#tagline').textContent = ctx.tagline;
  $('#f-address').textContent = ctx.address ? `📍 ${ctx.address}` : '';
  $('#f-phone').textContent = ctx.phone ? `📞 ${ctx.phone}` : '';
  $('#f-hours').textContent = ctx.opening_hours ? `🕘 ${ctx.opening_hours}` : '';
}

async function load() {
  setHTML(app, html`${raw('<div class="skeleton" style="height:230px"></div>'.repeat(8))}`);
  $('#denied').classList.add('hidden');

  try {
    const ctxRes = await sb.rpc('menu_context', { p_table: TABLE ?? 0 });
    if (ctxRes.error) throw ctxRes.error;
    state.ctx = ctxRes.data;
    fillCafeInfo(state.ctx);

    if (!state.ctx.network_ok) { $('#denied').classList.remove('hidden'); return; }

    const [catRes, itemRes, offRes, evRes] = await Promise.all([
      sb.from('categories').select('id, name, sort').order('sort').order('id'),
      sb.from('menu_items').select('id, category_id, name, name_en, description, price, image_url, sort, sold_out').order('id'),
      sb.from('offers').select('id, title, description, discount_type, discount_value, item_id, category_id, ends_at').order('id'),
      sb.from('events').select('id, title, description, starts_at, ends_at').order('starts_at', { ascending: true, nullsFirst: true }).order('id'),
    ]);
    for (const r of [catRes, itemRes, offRes, evRes]) if (r.error) throw r.error;

    state.categories = catRes.data;
    state.items = new Map(itemRes.data.map((i) => [i.id, i]));
    state.offers = offRes.data;
    state.events = evRes.data;
    renderNews();

    if (TABLE !== null && !state.ctx.table_valid) {
      toast('رقم الطاولة غير صالح. امسح رمز QR الموجود على طاولتك مرة أخرى.', 'error', 7000);
    }
    if (TABLE !== null && state.ctx.table_valid) {
      const pill = $('#table-label');
      pill.textContent = `طاولة ${TABLE}`;
      pill.classList.remove('hidden');
    }

    loadCart();
    const before = state.cart.length;
    state.cart = state.cart.filter((l) => state.items.has(l.item_id) && !state.items.get(l.item_id).sold_out);
    if (state.cart.length < before) toast('تمت إزالة أصناف نفدت من سلتك.', 'error');
    saveCart();

    renderMenu();
    if (TABLE === null) renderStaffLinks();
  } catch (e) {
    setHTML(app, html`<div class="state" style="grid-column:1/-1"><h3>تعذّر تحميل المنيو</h3><p>${errMsg(e)}</p>
      <button class="btn btn-gold" data-retry type="button">إعادة المحاولة</button></div>`);
  }
}

/** بدون رقم طاولة: المنيو للتصفح فقط + روابط الموظفين */
function renderStaffLinks() {
  const box = document.createElement('div');
  box.className = 'state';
  box.style.gridColumn = '1/-1';
  setHTML(box, html`
    <p style="margin-bottom:14px">للطلب: امسح رمز QR الموجود على طاولتك.</p>
    <div class="row" style="justify-content:center">
      <a class="btn btn-gold" href="casher.html">لوحة الكاشير والإدارة</a>
      <a class="btn" href="kitchen.html">شاشة المطبخ</a>
    </div>`);
  app.prepend(box);
}

app.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    if (TABLE === null) { toast('امسح رمز QR الموجود على طاولتك للطلب.', 'error'); return; }
    addItem(Number(add.dataset.add)); return;
  }
  const dec = e.target.closest('[data-dec]');
  if (dec) { removeOne(Number(dec.dataset.dec)); return; }
  if (e.target.closest('[data-retry]')) load();
});
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  state.filter = b.dataset.cat;
  renderMenu();
  if (TABLE === null) renderStaffLinks();
});
$('#cart-btn-top').addEventListener('click', openCart);
$('#offers-box').addEventListener('click', showOffers);
$('#events-box').addEventListener('click', showEvents);
$('#denied-retry').addEventListener('click', load);
window.addEventListener('online', () => toast('عاد الاتصال بالإنترنت.', 'success'));
window.addEventListener('offline', () => toast('انقطع الاتصال بالإنترنت.', 'error'));

// ---------- التحديث الفوري الصامت ----------
// قاعدة البيانات ترسل إشارة "changed" عند أي تعديل في المنيو/العروض/الفعاليات/الإعدادات،
// فنعيد جلب البيانات بهدوء ونحدّث فقط ما تغيّر، دون تحريك الصفحة أو إغلاق السلة.
let refreshTimer = null;
let refreshing = false;
const sig = (v) => JSON.stringify(v);

async function silentRefresh() {
  if (refreshing || !state.ctx) return;
  refreshing = true;
  try {
    const ctxRes = await sb.rpc('menu_context', { p_table: TABLE ?? 0 });
    if (ctxRes.error) return;
    const ctx = ctxRes.data;
    if (!ctx.network_ok) { $('#denied').classList.remove('hidden'); state.ctx = ctx; return; }
    const wasDenied = !$('#denied').classList.contains('hidden');
    if (wasDenied) { $('#denied').classList.add('hidden'); refreshing = false; return load(); }

    const [catRes, itemRes, offRes, evRes] = await Promise.all([
      sb.from('categories').select('id, name, sort').order('sort').order('id'),
      sb.from('menu_items').select('id, category_id, name, name_en, description, price, image_url, sort, sold_out').order('id'),
      sb.from('offers').select('id, title, description, discount_type, discount_value, item_id, category_id, ends_at').order('id'),
      sb.from('events').select('id, title, description, starts_at, ends_at').order('starts_at', { ascending: true, nullsFirst: true }).order('id'),
    ]);
    if ([catRes, itemRes, offRes, evRes].some((r) => r.error)) return;

    const ctxChanged = sig(ctx) !== sig(state.ctx);
    const menuChanged = sig(catRes.data) !== sig(state.categories)
      || sig(itemRes.data) !== sig([...state.items.values()])
      || sig(offRes.data) !== sig(state.offers);
    const newsChanged = sig(offRes.data) !== sig(state.offers) || sig(evRes.data) !== sig(state.events);

    if (ctxChanged) { state.ctx = ctx; fillCafeInfo(ctx); }
    if (newsChanged) { state.offers = offRes.data; state.events = evRes.data; renderNews(); }
    if (menuChanged) {
      state.categories = catRes.data;
      state.items = new Map(itemRes.data.map((i) => [i.id, i]));
      state.offers = offRes.data;
      // أزل من السلة ما نفد أو حُذف
      const removed = state.cart.filter((l) => !state.items.has(l.item_id) || state.items.get(l.item_id).sold_out);
      if (removed.length) {
        state.cart = state.cart.filter((l) => !removed.includes(l));
        toast('بعض الأصناف في سلتك نفدت للتو وأُزيلت.', 'error');
      }
      saveCart();
      const y = window.scrollY;
      renderMenu();
      if (TABLE === null) renderStaffLinks();
      window.scrollTo({ top: y });
      if (cartModal) { renderCartBody(); refreshQuoteSoon(); }
    } else if (ctxChanged) {
      saveCart();
      if (cartModal) refreshQuoteSoon();
    }
  } finally {
    refreshing = false;
  }
}
const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(silentRefresh, 400); };

sb.channel('menu-updates')
  .on('broadcast', { event: 'changed' }, scheduleRefresh)
  .subscribe((status) => { if (status === 'SUBSCRIBED') scheduleRefresh(); });
setInterval(scheduleRefresh, 60000);                     // احتياط
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });

load().catch(toastError);
