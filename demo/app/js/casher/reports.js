// تبويب التقارير (المدير)
import {
  sb, html, setHTML, $, money, fmtNum, todayYMD, addDays, dayStart, downloadCSV, toast,
} from '../common.js';
import { loadingTpl, errorTpl, emptyTpl } from './util.js';

/** فترات جاهزة: تعيد [من, إلى) كتواريخ YYYY-MM-DD */
export function presetRange(key) {
  const t = todayYMD();
  const [y, m] = t.split('-').map(Number);
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const prevMonth = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  switch (key) {
    case 'today': return [t, addDays(t, 1)];
    case 'yesterday': return [addDays(t, -1), t];
    case 'week': return [addDays(t, -6), addDays(t, 1)];
    case 'month': return [monthStart, addDays(t, 1)];
    case 'last_month': return [prevMonth, monthStart];
    default: return [t, addDays(t, 1)];
  }
}

export const PRESETS = [
  ['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['last_month', 'الشهر الماضي'],
];

/** شريط اختيار الفترة (مشترك مع الجرد) */
export function rangeBarTpl(preset, from, toExcl) {
  return html`<div class="filters no-print">
    ${PRESETS.map(([k, l]) => html`<button class="btn btn-sm ${preset === k ? 'on' : ''}" data-preset="${k}" type="button">${l}</button>`)}
    <span class="muted" style="margin-inline-start:8px">من</span>
    <input class="input" type="date" data-from value="${from}" max="${todayYMD()}">
    <span class="muted">إلى</span>
    <input class="input" type="date" data-to value="${addDays(toExcl, -1)}" max="${todayYMD()}">
    <button class="btn btn-sm" data-apply type="button">عرض</button>
  </div>`;
}

const barTpl = (v, max) => html`<div class="bar-track"><div class="bar" style="width:${max ? Math.max(2, Math.round((v / max) * 100)) : 0}%"></div></div>`;

export function mount(el, ctx) {
  let preset = 'today';
  let [from, to] = presetRange(preset);
  let data = null;
  let pnl = null;
  const CAT = { supplies: 'مواد خام ومشتريات', salaries: 'رواتب وأجور', rent: 'إيجار', utilities: 'فواتير', maintenance: 'صيانة', marketing: 'تسويق', other: 'أخرى' };

  async function load() {
    setHTML(el, html`${rangeBarTpl(preset, from, to)}<div id="r-body">${loadingTpl('جارٍ إعداد التقرير…')}</div>`);
    const range = { p_from: dayStart(from).toISOString(), p_to: dayStart(to).toISOString() };
    const [r1, r2] = await Promise.all([sb.rpc('report_sales', range), sb.rpc('report_pnl', range)]);
    const d = r1.data;
    const error = r1.error || r2.error;
    pnl = r2.data;
    const body = $('#r-body', el);
    if (!body) return;
    if (error) { setHTML(body, errorTpl(error)); return; }
    data = d;
    render(body);
  }

  function render(body) {
    const s = data.summary;
    const periodLabel = `${from} → ${addDays(to, -1)}`;
    if (!s.orders && !s.cancelled && !pnl.expenses && !pnl.revenue) {
      setHTML(body, emptyTpl('لا توجد مبيعات ولا مصاريف في هذه الفترة', periodLabel));
      return;
    }
    const maxExp = Math.max(...pnl.expenses_by_category.map((e) => e.total), 0);
    const maxDay = Math.max(...data.by_day.map((d) => d.revenue), 0);
    const maxHour = Math.max(...data.by_hour.map((d) => d.orders), 0);
    const maxItem = Math.max(...data.top_items.map((d) => d.qty), 0);
    const maxCat = Math.max(...data.by_category.map((d) => d.revenue), 0);

    setHTML(body, html`
      <div class="page-head">
        <h2>تقرير المبيعات <span class="muted num" style="font-size:14px">${periodLabel}</span></h2>
        <div class="row no-print">
          <button class="btn btn-sm" data-csv type="button">⬇ تصدير CSV</button>
          <button class="btn btn-sm" data-print type="button">🖨 طباعة</button>
        </div>
      </div>
      <div class="section"><h3>💰 الأرباح والخسائر (حسب التحصيل الفعلي)</h3>
        <div class="kpis">
          <div class="kpi gold"><small>الإيرادات المحصّلة</small><b>${money(pnl.revenue)}</b></div>
          <div class="kpi danger"><small>المصاريف</small><b>${money(pnl.expenses)}</b></div>
          <div class="kpi ${pnl.net_profit >= 0 ? 'ok' : 'danger'}"><small>صافي الربح</small><b>${money(pnl.net_profit)}</b></div>
          <div class="kpi"><small>💵 كاش</small><b>${money(pnl.cash)}</b></div>
          <div class="kpi"><small>💳 بطاقة</small><b>${money(pnl.card)}</b></div>
          <div class="kpi ${pnl.unpaid_count ? 'warn' : ''}"><small>غير محصّل (${pnl.unpaid_count} طلب)</small><b>${money(pnl.unpaid_total)}</b></div>
        </div>
        ${pnl.expenses_by_category.length ? html`<div class="table-wrap"><table class="data">
          <thead><tr><th>بند المصروف</th><th>عدد</th><th>المبلغ</th><th></th></tr></thead>
          <tbody>${pnl.expenses_by_category.map((e) => html`<tr><td>${CAT[e.category] ?? e.category}</td><td class="num">${e.count}</td>
            <td class="num">${money(e.total)}</td><td class="bar-cell">${barTpl(e.total, maxExp)}</td></tr>`)}</tbody></table></div>` : ''}
      </div>
      <div class="section"><h3>🧾 المبيعات (حسب وقت الطلب)</h3></div>
      <div class="kpis">
        <div class="kpi gold"><small>إجمالي المبيعات</small><b>${money(s.revenue)}</b></div>
        <div class="kpi"><small>عدد الطلبات</small><b>${fmtNum(s.orders)}</b></div>
        <div class="kpi"><small>متوسط الطلب</small><b>${money(s.avg_order)}</b></div>
        <div class="kpi"><small>الأصناف المباعة</small><b>${fmtNum(s.items_sold)}</b></div>
        <div class="kpi"><small>الخصومات</small><b>${money(s.discount)}</b></div>
        <div class="kpi"><small>رسوم الخدمة</small><b>${money(s.service)}</b></div>
        <div class="kpi"><small>الضريبة</small><b>${money(s.tax)}</b></div>
        <div class="kpi"><small>طلبات ملغاة</small><b>${fmtNum(s.cancelled)}</b></div>
        <div class="kpi"><small>متوسط وقت التحضير</small><b>${s.avg_prep_min != null ? `${s.avg_prep_min} د` : '—'}</b></div>
      </div>

      <div class="cols-2">
        <div class="section"><h3>المبيعات حسب اليوم</h3><div class="table-wrap"><table class="data">
          <thead><tr><th>اليوم</th><th>الطلبات</th><th>الإيراد</th><th></th></tr></thead>
          <tbody>${data.by_day.map((d) => html`<tr><td class="num">${d.day}</td><td class="num">${d.orders}</td>
            <td class="num">${money(d.revenue)}</td><td class="bar-cell">${barTpl(d.revenue, maxDay)}</td></tr>`)}</tbody></table></div></div>

        <div class="section"><h3>أوقات الذروة (حسب الساعة)</h3><div class="table-wrap"><table class="data">
          <thead><tr><th>الساعة</th><th>الطلبات</th><th>الإيراد</th><th></th></tr></thead>
          <tbody>${data.by_hour.map((h) => html`<tr><td class="num">${String(h.hour).padStart(2, '0')}:00</td><td class="num">${h.orders}</td>
            <td class="num">${money(h.revenue)}</td><td class="bar-cell">${barTpl(h.orders, maxHour)}</td></tr>`)}</tbody></table></div></div>

        <div class="section"><h3>الأصناف الأكثر مبيعاً</h3><div class="table-wrap"><table class="data">
          <thead><tr><th>الصنف</th><th>الكمية</th><th>الإيراد</th><th></th></tr></thead>
          <tbody>${data.top_items.map((t) => html`<tr><td>${t.item_name}</td><td class="num">${t.qty}</td>
            <td class="num">${money(t.revenue)}</td><td class="bar-cell">${barTpl(t.qty, maxItem)}</td></tr>`)}</tbody></table></div></div>

        <div class="section"><h3>حسب القسم</h3><div class="table-wrap"><table class="data">
          <thead><tr><th>القسم</th><th>الكمية</th><th>الإيراد</th><th></th></tr></thead>
          <tbody>${data.by_category.map((c) => html`<tr><td>${c.category}</td><td class="num">${c.qty}</td>
            <td class="num">${money(c.revenue)}</td><td class="bar-cell">${barTpl(c.revenue, maxCat)}</td></tr>`)}</tbody></table></div></div>

        <div class="section"><h3>حسب الطاولة</h3><div class="table-wrap"><table class="data">
          <thead><tr><th>الطاولة</th><th>الطلبات</th><th>الإيراد</th></tr></thead>
          <tbody>${data.by_table.map((t) => html`<tr><td class="num">${t.table_number ?? 'سفري'}</td><td class="num">${t.orders}</td>
            <td class="num">${money(t.revenue)}</td></tr>`)}</tbody></table></div></div>
      </div>`);
  }

  function exportCSV() {
    const s = data.summary;
    const cur = ctx.settings.currency;
    const rows = [
      ['تقرير مبيعات Mr Black', `${from} إلى ${addDays(to, -1)}`],
      [],
      ['الملخص'],
      ['صافي الإيرادات', s.revenue], ['عدد الطلبات', s.orders], ['متوسط الطلب', s.avg_order],
      ['المجموع قبل الخصم', s.subtotal], ['الخصومات', s.discount], ['رسوم الخدمة', s.service], ['الضريبة', s.tax],
      ['الأصناف المباعة', s.items_sold], ['طلبات ملغاة', s.cancelled], ['متوسط وقت التحضير (دقيقة)', s.avg_prep_min ?? ''],
      ['العملة', cur],
      [], ['الأرباح والخسائر'],
      ['الإيرادات المحصّلة', pnl.revenue], ['كاش', pnl.cash], ['بطاقة', pnl.card], ['المصاريف', pnl.expenses], ['صافي الربح', pnl.net_profit],
      ['غير محصّل', pnl.unpaid_total],
      ...pnl.expenses_by_category.map((e) => ['مصروف: ' + (CAT[e.category] ?? e.category), e.total]),
      [], ['حسب اليوم'], ['اليوم', 'الطلبات', 'الإيراد'], ...data.by_day.map((d) => [d.day, d.orders, d.revenue]),
      [], ['حسب الساعة'], ['الساعة', 'الطلبات', 'الإيراد'], ...data.by_hour.map((h) => [h.hour, h.orders, h.revenue]),
      [], ['الأصناف الأكثر مبيعاً'], ['الصنف', 'الكمية', 'الإيراد'], ...data.top_items.map((t) => [t.item_name, t.qty, t.revenue]),
      [], ['حسب القسم'], ['القسم', 'الكمية', 'الإيراد'], ...data.by_category.map((c) => [c.category, c.qty, c.revenue]),
      [], ['حسب الطاولة'], ['الطاولة', 'الطلبات', 'الإيراد'], ...data.by_table.map((t) => [t.table_number, t.orders, t.revenue]),
    ];
    downloadCSV(`mrblack-sales-${from}_${addDays(to, -1)}.csv`, rows);
  }

  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) { preset = p.dataset.preset; [from, to] = presetRange(preset); load(); return; }
    if (e.target.closest('[data-apply]')) {
      const f = $('[data-from]', el).value;
      const t = $('[data-to]', el).value;
      if (!f || !t || t < f) { toast('اختر فترة صحيحة (تاريخ النهاية بعد البداية).', 'error'); return; }
      preset = 'custom'; from = f; to = addDays(t, 1); load(); return;
    }
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-csv]') && data) return exportCSV();
    if (e.target.closest('[data-print]')) window.print();
  });

  load();
}
