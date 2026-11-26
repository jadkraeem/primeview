// الرئيسية: لمحة اليوم + إجراءات سريعة
import { sb, html, setHTML, $, money, fmtNum, fmtTime, todayYMD, dayStart, addDays, STATUS_LABELS, STATUS_BADGE } from '../common.js';
import { orderPlace } from '../orders-feed.js';
import { loadingTpl, errorTpl } from './util.js';
import { payBadge } from './orders.js';

export function mount(el, ctx) {
  let alive = true;

  async function load(first = false) {
    if (first) setHTML(el, loadingTpl('جارٍ تجهيز لمحة اليوم…'));
    const from = dayStart(todayYMD()).toISOString();
    const to = dayStart(addDays(todayYMD(), 1)).toISOString();
    const [ord, exp, low] = await Promise.all([
      sb.from('orders').select('id, status, total, paid_at, payment_method, created_at, order_type, table_number')
        .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).limit(1000),
      sb.from('expenses').select('amount').gte('spent_at', from).lt('spent_at', to),
      sb.from('menu_items').select('name, stock_qty, low_stock_threshold').eq('track_stock', true),
      ctx.refreshShift?.(),
    ]);
    if (!alive) return;
    if (ord.error) { setHTML(el, errorTpl(ord.error)); return; }

    const valid = ord.data.filter((o) => o.status !== 'cancelled');
    const paid = valid.filter((o) => o.paid_at);
    const sum = (list) => list.reduce((s, o) => s + Number(o.total), 0);
    const cash = sum(paid.filter((o) => o.payment_method === 'cash'));
    const card = sum(paid.filter((o) => o.payment_method === 'card'));
    const expenses = (exp.data || []).reduce((s, e) => s + Number(e.amount), 0);
    const unpaidOpen = ctx.orders.filter((o) => !o.paid_at);
    const lowStock = (low.data || []).filter((i) => i.stock_qty <= i.low_stock_threshold);
    const shift = ctx.shift;

    setHTML(el, html`
      <div class="quick-actions">
        <button class="quick" data-go="pos" type="button"><span>🧾</span>طلب جديد</button>
        <button class="quick" data-go="orders" type="button"><span>🔔</span>الطلبات المفتوحة (${ctx.orders.length})</button>
        <button class="quick" data-go="shifts" type="button"><span>💵</span>${shift ? 'إغلاق الوردية' : 'فتح وردية'}</button>
        <button class="quick" data-go="expenses" type="button"><span>💸</span>تسجيل مصروف</button>
      </div>

      <div class="kpis">
        <div class="kpi gold"><small>المحصّل اليوم</small><b>${money(sum(paid))}</b></div>
        <div class="kpi"><small>طلبات اليوم</small><b>${fmtNum(valid.length)}</b></div>
        <div class="kpi"><small>💵 كاش</small><b>${money(cash)}</b></div>
        <div class="kpi"><small>💳 بطاقة</small><b>${money(card)}</b></div>
        <div class="kpi ${unpaidOpen.length ? 'warn' : ''}"><small>غير محصّل الآن</small><b>${money(sum(unpaidOpen))}</b></div>
        <div class="kpi danger"><small>مصاريف اليوم</small><b>${money(expenses)}</b></div>
        <div class="kpi ${sum(paid) - expenses >= 0 ? 'ok' : 'danger'}"><small>صافي اليوم</small><b>${money(sum(paid) - expenses)}</b></div>
        <div class="kpi ${shift ? 'ok' : 'warn'}"><small>الوردية</small><b style="font-size:16px">${shift ? `مفتوحة · متوقع بالصندوق ${money(shift.expected_cash)}` : 'لا توجد وردية مفتوحة'}</b></div>
      </div>

      <div class="cols-2">
        <div class="card section"><h3 style="font-size:16px;margin-bottom:8px">آخر الطلبات</h3>
          ${ord.data.length ? html`<ul class="mini-list">${ord.data.slice(0, 8).map((o) => html`<li>
            <span><b class="num">#${o.id}</b> · ${orderPlace(o)} · <span class="muted num">${fmtTime(o.created_at)}</span></span>
            <span class="row" style="gap:6px"><span class="badge ${STATUS_BADGE[o.status]}">${STATUS_LABELS[o.status]}</span>
              ${o.status !== 'cancelled' ? payBadge(o) : ''}<b class="num">${money(o.total)}</b></span></li>`)}</ul>`
            : html`<p class="muted">لا توجد طلبات اليوم بعد.</p>`}
        </div>
        <div class="card section"><h3 style="font-size:16px;margin-bottom:8px">⚠️ مخزون منخفض</h3>
          ${lowStock.length ? html`<ul class="mini-list">${lowStock.map((i) => html`<li><span>${i.name}</span>
            <span class="badge ${i.stock_qty <= 0 ? 'badge-danger' : 'badge-warn'} num">${i.stock_qty}</span></li>`)}</ul>`
            : html`<p class="muted">كل الأصناف المتتبَّعة بكميات جيدة ✓</p>`}
        </div>
      </div>`);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) ctx.go(b.dataset.go);
    if (e.target.closest('[data-retry]')) load(true);
  });

  let t;
  const onOrders = () => { clearTimeout(t); t = setTimeout(() => load(false), 600); };
  ctx.ordersListeners.add(onOrders);
  load(true);
  return () => { alive = false; ctx.ordersListeners.delete(onOrders); clearTimeout(t); };
}
