// قسم الطلبات: المفتوحة (لحظية) + السجل
import {
  sb, html, setHTML, $, money, elapsed, minutesSince, fmtTime, toast, toastError,
  withBusy, confirmDialog, todayYMD, dayStart, addDays, STATUS_LABELS, STATUS_BADGE,
} from '../common.js';
import { changeStatus, orderPlace, ORDER_SELECT } from '../orders-feed.js';
import { loadingTpl, errorTpl, emptyTpl, printTpl } from './util.js';
import { receiptTpl } from './receipt.js';
import { openPayment } from './payment.js';

const NEXT = {
  new: [{ to: 'preparing', label: 'بدء التحضير', cls: 'btn-gold' }],
  preparing: [{ to: 'ready', label: 'جاهز', cls: 'btn-ok' }],
  ready: [{ to: 'served', label: 'تم التسليم', cls: 'btn-gold' }],
  served: [],
};
const FILTERS = [
  ['all', 'الكل'], ['new', 'جديد'], ['preparing', 'قيد التحضير'], ['ready', 'جاهز'], ['unpaid', 'غير مدفوع'],
];

export const payBadge = (o) => (o.paid_at
  ? html`<span class="badge badge-paid">مدفوع ${o.payment_method === 'card' ? '💳' : '💵'}</span>`
  : html`<span class="badge badge-unpaid">غير مدفوع</span>`);

export function mount(el, ctx) {
  let mode = 'active';
  let filter = 'all';
  let histDate = todayYMD();
  let histOrders = [];

  setHTML(el, html`
    <div class="page-head">
      <div class="filters" style="margin:0">
        <button class="btn btn-sm on" data-mode="active" type="button">الطلبات المفتوحة</button>
        <button class="btn btn-sm" data-mode="history" type="button">السجل</button>
      </div>
      <button class="btn btn-gold btn-sm" data-go-pos type="button">+ طلب جديد</button>
    </div>
    <div id="o-body"></div>`);
  const body = $('#o-body', el);

  function cardTpl(o) {
    const late = ctx.settings.late_minutes || 15;
    const timing = ['new', 'preparing'].includes(o.status);
    const mins = minutesSince(o.created_at);
    const cls = timing ? (mins >= late ? 'late' : mins >= late * 0.7 ? 'warn' : '') : '';
    const statusLabel = o.status === 'served' ? 'سُلِّم — بانتظار الدفع' : STATUS_LABELS[o.status];
    return html`<article class="order ${cls}" data-id="${o.id}">
      <div class="order-head">
        <b>${orderPlace(o)}</b>
        <span class="badge ${STATUS_BADGE[o.status]}">${statusLabel}</span>
        <span class="timer" data-since="${timing ? o.created_at : ''}">${timing ? elapsed(o.created_at) : '✓'}</span>
      </div>
      <div class="order-body">
        <div class="row" style="justify-content:space-between;margin-bottom:4px">
          <span class="muted num" style="font-size:12px">#${o.id} · ${fmtTime(o.created_at)}</span>${payBadge(o)}</div>
        ${(o.order_items || []).map((l) => html`<div class="order-line"><span class="q num">${l.qty}×</span>${l.item_name}
          ${l.note ? html`<span class="note">✎ ${l.note}</span>` : ''}</div>`)}
        <div class="row" style="justify-content:space-between;margin-top:8px;font-weight:800">
          <span>الإجمالي</span><span class="num" style="color:var(--gold)">${money(o.total)}</span></div>
      </div>
      <div class="order-foot">
        ${!o.paid_at ? html`<button class="btn btn-sm btn-ok" data-pay type="button">💵 تحصيل</button>` : ''}
        ${NEXT[o.status].map((a) => html`<button class="btn btn-sm ${a.cls}" data-to="${a.to}" type="button">${a.label}</button>`)}
        <button class="btn btn-sm btn-ghost" data-print type="button" title="طباعة">🖨</button>
        ${!o.paid_at && o.status !== 'served' ? html`<button class="btn btn-sm btn-danger" data-to="cancelled" type="button" title="إلغاء">✕</button>` : ''}
      </div>
    </article>`;
  }

  function renderActive() {
    if (mode !== 'active') return;
    const order = { new: 0, preparing: 1, ready: 2, served: 3 };
    const all = [...ctx.orders].sort((a, b) => order[a.status] - order[b.status] || new Date(a.created_at) - new Date(b.created_at));
    const list = all.filter((o) => filter === 'all' || (filter === 'unpaid' ? !o.paid_at : o.status === filter));
    const count = (f) => all.filter((o) => (f === 'all' ? true : f === 'unpaid' ? !o.paid_at : o.status === f)).length;
    const unpaidTotal = all.filter((o) => !o.paid_at).reduce((s, o) => s + Number(o.total), 0);
    setHTML(body, html`
      <div class="filters">
        ${FILTERS.map(([k, l]) => html`<button class="btn btn-sm ${filter === k ? 'on' : ''}" data-filter="${k}" type="button">${l} <span class="num">(${count(k)})</span></button>`)}
        ${unpaidTotal ? html`<span class="badge badge-unpaid" style="margin-inline-start:auto">غير محصّل: ${money(unpaidTotal)}</span>` : ''}
      </div>
      ${list.length ? html`<div class="orders-grid">${list.map(cardTpl)}</div>`
        : emptyTpl('لا توجد طلبات هنا', 'تظهر الطلبات الجديدة فوراً مع تنبيه صوتي، وتبقى حتى تُسلَّم وتُدفع.')}`);
  }

  function tick() {
    const late = ctx.settings.late_minutes || 15;
    el.querySelectorAll('.order [data-since]').forEach((t) => {
      if (!t.dataset.since) return;
      t.textContent = elapsed(t.dataset.since);
      const mins = minutesSince(t.dataset.since);
      const card = t.closest('.order');
      card.classList.toggle('late', mins >= late);
      card.classList.toggle('warn', mins < late && mins >= late * 0.7);
    });
  }

  async function renderHistory() {
    setHTML(body, html`
      <div class="filters">
        <input class="input" type="date" id="h-date" value="${histDate}" max="${todayYMD()}">
      </div>
      <div id="h-list">${loadingTpl()}</div>`);
    $('#h-date', body).onchange = (e) => { histDate = e.target.value || todayYMD(); renderHistory(); };
    const { data, error } = await sb.from('orders').select(ORDER_SELECT)
      .gte('created_at', dayStart(histDate).toISOString()).lt('created_at', dayStart(addDays(histDate, 1)).toISOString())
      .order('created_at', { ascending: false }).limit(500);
    const box = $('#h-list', body);
    if (!box) return;
    if (error) { setHTML(box, errorTpl(error)); return; }
    histOrders = data;
    if (!data.length) { setHTML(box, emptyTpl('لا توجد طلبات في هذا اليوم')); return; }
    const paid = data.filter((o) => o.paid_at && o.status !== 'cancelled').reduce((s, o) => s + Number(o.total), 0);
    setHTML(box, html`
      <p class="muted" style="margin-bottom:8px">${data.length} طلب · المحصّل: <b class="num" style="color:var(--gold)">${money(paid)}</b></p>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>#</th><th>الوقت</th><th>المكان</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>الدفع</th><th></th></tr></thead>
        <tbody>${data.map((o) => html`<tr data-id="${o.id}">
          <td class="num">${o.id}</td><td class="num">${fmtTime(o.created_at)}</td><td>${orderPlace(o)}</td>
          <td class="wrap">${o.order_items.map((l) => `${l.qty}× ${l.item_name}`).join('، ')}</td>
          <td class="num">${money(o.total)}</td>
          <td><span class="badge ${STATUS_BADGE[o.status]}">${STATUS_LABELS[o.status]}</span></td>
          <td>${o.status === 'cancelled' ? '—' : payBadge(o)}</td>
          <td><div class="row">${!o.paid_at && o.status !== 'cancelled' ? html`<button class="btn btn-sm btn-ok" data-pay type="button">تحصيل</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-print type="button">🖨</button></div></td></tr>`)}
        </tbody></table></div>`);
  }

  function render() {
    el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    if (mode === 'active') renderActive(); else renderHistory();
  }

  el.addEventListener('click', async (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; render(); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; renderActive(); return; }
    if (e.target.closest('[data-go-pos]')) { ctx.go('pos'); return; }
    if (e.target.closest('[data-retry]')) { render(); return; }

    const host = e.target.closest('[data-id]');
    if (!host) return;
    const id = Number(host.dataset.id);
    const o = ctx.orders.find((x) => x.id === id) || histOrders.find((x) => x.id === id);
    if (!o) return;

    if (e.target.closest('[data-print]')) { printTpl(receiptTpl(o, ctx.settings)); return; }
    if (e.target.closest('[data-pay]')) {
      const r = await openPayment(o, ctx);
      if (r && mode === 'history') renderHistory();
      return;
    }
    const btn = e.target.closest('[data-to]');
    if (!btn) return;
    const to = btn.dataset.to;
    if (to === 'cancelled' && !(await confirmDialog(`إلغاء الطلب #${id}؟ سيتم إرجاع الكميات إلى المخزون.`, { okLabel: 'نعم، إلغاء الطلب', danger: true }))) return;
    await withBusy(btn, async () => {
      try {
        await changeStatus(id, to);
        ctx.feed.patch(id, { status: to, ...(to === 'served' ? { served_at: new Date().toISOString() } : {}) });
        toast(to === 'served' && !o.paid_at ? `الطلب #${id} سُلِّم — لا تنسَ التحصيل` : `الطلب #${id}: ${STATUS_LABELS[to]}`, 'success');
      } catch (err) { toastError(err); }
    });
  });

  const onOrders = () => renderActive();
  ctx.ordersListeners.add(onOrders);
  const timer = setInterval(tick, 1000);
  render();
  return () => { ctx.ordersListeners.delete(onOrders); clearInterval(timer); };
}
