// نقطة البيع: طلب من الكاشير (طاولة أو سفري) + تحصيل مباشر
import { sb, html, setHTML, $, $$, money, errMsg, toast, withBusy } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl } from './util.js';
import { openPayment } from './payment.js';

const MAX_NOTE = 200;

export function mount(el, ctx) {
  let cats = [];
  let items = [];
  let tables = [];
  let filter = 'all';
  let search = '';
  let type = 'takeaway';
  let tableNo = '';
  let lines = [];          // [{key, item_id, qty, note}]
  let quoteSeq = 0;

  const itemById = (id) => items.find((i) => i.id === id);
  const qtyOf = (id) => lines.filter((l) => l.item_id === id).reduce((s, l) => s + l.qty, 0);
  const newKey = () => Math.random().toString(36).slice(2, 9);

  async function load() {
    setHTML(el, loadingTpl());
    const [c, i, t] = await Promise.all([
      sb.from('categories').select('id, name').eq('active', true).order('sort').order('id'),
      sb.from('menu_items').select('id, category_id, name, price, sold_out, sort').order('sort').order('id'),
      sb.from('cafe_tables').select('number, label').eq('active', true).order('number'),
    ]);
    const err = c.error || i.error || t.error;
    if (err) { setHTML(el, errorTpl(err)); return; }
    cats = c.data; items = i.data.filter((x) => cats.some((k) => k.id === x.category_id)); tables = t.data;
    renderShell();
  }

  function renderShell() {
    setHTML(el, html`
      <div class="pos">
        <section>
          <div class="filters">
            <input class="input" type="search" data-search placeholder="🔍 بحث سريع عن صنف…" style="max-width:260px" value="${search}">
          </div>
          <div class="filters" data-cats></div>
          <div class="pos-tiles" data-tiles></div>
        </section>
        <aside class="card ticket">
          <div class="row" style="justify-content:space-between">
            <h3 style="font-size:17px">🧾 الطلب الحالي</h3>
            <button class="btn btn-sm btn-ghost" data-clear type="button">تفريغ</button>
          </div>
          <div class="row" style="margin-top:10px">
            <div class="seg">
              <button type="button" data-type="takeaway">🥡 سفري</button>
              <button type="button" data-type="table">🪑 طاولة</button>
            </div>
            <select class="input" data-table style="width:auto;min-width:120px">
              <option value="">اختر الطاولة</option>
              ${tables.map((t) => html`<option value="${t.number}">طاولة ${t.number}${t.label ? ` — ${t.label}` : ''}</option>`)}
            </select>
          </div>
          <div class="ticket-lines" data-lines></div>
          <div data-totals></div>
          <p class="form-error" data-err></p>
          <div class="row">
            <button class="btn btn-gold" data-send-pay type="button" style="flex:1;min-height:48px">💵 إرسال وتحصيل</button>
            <button class="btn" data-send type="button" style="min-height:48px">إرسال للمطبخ</button>
          </div>
        </aside>
      </div>`);
    renderCats(); renderTiles(); renderTicket();
  }

  function renderCats() {
    setHTML($('[data-cats]', el), html`
      <button class="btn btn-sm ${filter === 'all' ? 'on' : ''}" data-cat="all" type="button">الكل</button>
      ${cats.map((c) => html`<button class="btn btn-sm ${String(filter) === String(c.id) ? 'on' : ''}" data-cat="${c.id}" type="button">${c.name}</button>`)}`);
  }

  function renderTiles() {
    const list = items.filter((i) => (filter === 'all' || i.category_id === Number(filter)) && (!search || i.name.includes(search)));
    setHTML($('[data-tiles]', el), list.length ? html`${list.map((i) => html`
      <button class="pos-tile ${i.sold_out ? 'sold' : ''}" data-item="${i.id}" type="button" ${i.sold_out ? html`disabled` : ''}>
        ${qtyOf(i.id) ? html`<span class="in-cart num">${qtyOf(i.id)}</span>` : ''}
        <b>${i.name}</b><small class="num">${i.sold_out ? 'نفد' : money(i.price)}</small></button>`)}`
      : emptyTpl('لا توجد أصناف'));
  }

  function renderTicket() {
    $$('[data-type]', el).forEach((b) => b.classList.toggle('on', b.dataset.type === type));
    const sel = $('[data-table]', el);
    sel.classList.toggle('hidden', type !== 'table');
    sel.value = tableNo;
    const box = $('[data-lines]', el);
    if (!lines.length) {
      setHTML(box, html`<p class="muted" style="text-align:center;padding:24px 0">اضغط على الأصناف لإضافتها</p>`);
      setHTML($('[data-totals]', el), '');
      return;
    }
    setHTML(box, html`${lines.map((l) => {
      const it = itemById(l.item_id);
      return html`<div class="cart-line" data-key="${l.key}" style="padding:8px 0;border-bottom:1px dashed var(--line)">
        <div class="row" style="justify-content:space-between">
          <b style="font-size:14px">${it?.name ?? 'صنف'}</b>
          <div class="stepper" style="display:flex;align-items:center;gap:6px">
            <button class="btn btn-sm" data-dec type="button" aria-label="إنقاص">−</button>
            <span class="num" style="min-width:20px;text-align:center;font-weight:800">${l.qty}</span>
            <button class="btn btn-sm btn-gold" data-inc type="button" aria-label="زيادة">+</button>
          </div>
        </div>
        <input class="input" data-note maxlength="${MAX_NOTE}" placeholder="ملاحظة (اختياري)" value="${l.note}" style="margin-top:6px;min-height:34px;font-size:13px">
      </div>`;
    })}`);
    refreshQuote();
  }

  async function refreshQuote() {
    const box = $('[data-totals]', el);
    if (!box || !lines.length) return;
    const seq = ++quoteSeq;
    box.style.opacity = '.5';
    const { data, error } = await sb.rpc('quote_order', { p_items: payload() });
    if (seq !== quoteSeq || !box.isConnected) return;
    box.style.opacity = '1';
    if (error) { setHTML(box, html`<p class="form-error">${errMsg(error)}</p>`); return; }
    setHTML(box, html`<div class="totals" style="border-top:1px dashed var(--line);padding-top:8px;font-size:14px">
      <div class="row" style="justify-content:space-between"><span>المجموع</span><span class="num">${money(data.subtotal)}</span></div>
      ${data.discount ? html`<div class="row" style="justify-content:space-between"><span>الخصم</span><span class="num">− ${money(data.discount)}</span></div>` : ''}
      ${data.service ? html`<div class="row" style="justify-content:space-between"><span>الخدمة</span><span class="num">${money(data.service)}</span></div>` : ''}
      ${data.tax ? html`<div class="row" style="justify-content:space-between"><span>الضريبة</span><span class="num">${money(data.tax)}</span></div>` : ''}
      <div class="row" style="justify-content:space-between;font-size:20px;font-weight:800;color:var(--gold);margin-top:4px"><span>الإجمالي</span><span class="num">${money(data.total)}</span></div>
    </div>`);
  }

  const payload = () => lines.map((l) => ({ item_id: l.item_id, qty: l.qty, note: l.note.trim() || null }));

  function add(id) {
    const it = itemById(id);
    if (!it || it.sold_out) return;
    if (qtyOf(id) >= 50) { toast('الحد الأقصى 50 من الصنف الواحد.', 'error'); return; }
    const l = lines.find((x) => x.item_id === id && !x.note);
    if (l) l.qty += 1; else lines.push({ key: newKey(), item_id: id, qty: 1, note: '' });
    renderTiles(); renderTicket();
  }

  async function send(btn, andPay) {
    const err = $('[data-err]', el);
    err.textContent = '';
    if (!lines.length) { err.textContent = 'أضف صنفاً واحداً على الأقل.'; return; }
    if (type === 'table' && !tableNo) { err.textContent = 'اختر رقم الطاولة.'; return; }
    if (andPay && !ctx.shift) { err.textContent = 'لا توجد وردية مفتوحة. افتح وردية أولاً، أو استخدم "إرسال للمطبخ" والتحصيل لاحقاً.'; return; }
    await withBusy(btn, async () => {
      const { data, error } = await sb.rpc('pos_create_order', { p_type: type, p_table: type === 'table' ? Number(tableNo) : null, p_items: payload() });
      if (error) { err.textContent = errMsg(error); return; }
      toast(`تم إرسال الطلب #${data.order_id} للمطبخ`, 'success');
      const order = { id: data.order_id, total: data.total, order_type: data.order_type, table_number: data.table_number,
        created_at: data.created_at, subtotal: data.subtotal, discount: data.discount, service: data.service, tax: data.tax,
        order_items: data.lines.map((l) => ({ item_name: l.item_name, qty: l.qty, note: l.note, line_total: l.line_total })) };
      lines = []; tableNo = '';
      renderTiles(); renderTicket();
      if (andPay) await openPayment(order, ctx);
    });
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) return load();
    const tile = e.target.closest('[data-item]');
    if (tile) return add(Number(tile.dataset.item));
    const c = e.target.closest('[data-cat]');
    if (c) { filter = c.dataset.cat; renderCats(); renderTiles(); return; }
    const t = e.target.closest('[data-type]');
    if (t) { type = t.dataset.type; renderTicket(); return; }
    if (e.target.closest('[data-clear]')) { lines = []; renderTiles(); renderTicket(); return; }
    const line = e.target.closest('[data-key]');
    if (line) {
      const l = lines.find((x) => x.key === line.dataset.key);
      if (!l) return;
      if (e.target.closest('[data-inc]')) { if (qtyOf(l.item_id) >= 50) return; l.qty += 1; }
      else if (e.target.closest('[data-dec]')) { l.qty -= 1; if (l.qty <= 0) lines = lines.filter((x) => x !== l); }
      else return;
      renderTiles(); renderTicket();
      return;
    }
    const sp = e.target.closest('[data-send-pay]');
    if (sp) return send(sp, true);
    const s = e.target.closest('[data-send]');
    if (s) return send(s, false);
  });
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-search]')) { search = e.target.value.trim(); renderTiles(); return; }
    if (e.target.matches('[data-note]')) {
      const l = lines.find((x) => x.key === e.target.closest('[data-key]').dataset.key);
      if (l) l.note = e.target.value.slice(0, MAX_NOTE);
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-table]')) tableNo = e.target.value;
  });

  load();
}
