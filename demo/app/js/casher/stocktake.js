// تبويب الجرد اليومي/الأسبوعي/الشهري (المدير)
import { sb, html, setHTML, $, fmtNum, addDays, dayStart, downloadCSV, toast, fmtDateTime } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl } from './util.js';
import { presetRange, rangeBarTpl } from './reports.js';

export function mount(el) {
  let preset = 'today';
  let [from, to] = presetRange(preset);
  let rows = [];

  async function load() {
    setHTML(el, html`${rangeBarTpl(preset, from, to)}<div id="s-body">${loadingTpl('جارٍ إعداد الجرد…')}</div>`);
    const { data, error } = await sb.rpc('report_inventory', {
      p_from: dayStart(from).toISOString(), p_to: dayStart(to).toISOString(),
    });
    const body = $('#s-body', el);
    if (!body) return;
    if (error) { setHTML(body, errorTpl(error)); return; }
    rows = data;
    render(body);
  }

  function render(body) {
    const tracked = rows.filter((r) => r.track_stock);
    const untracked = rows.filter((r) => !r.track_stock && r.sold_qty > 0);
    const label = `${from} → ${addDays(to, -1)}`;
    if (!rows.length) { setHTML(body, emptyTpl('لا توجد أصناف')); return; }

    setHTML(body, html`
      <div class="page-head">
        <h2>الجرد <span class="muted num" style="font-size:14px">${label}</span></h2>
        <div class="row no-print">
          <button class="btn btn-sm" data-csv type="button">⬇ تصدير CSV</button>
          <button class="btn btn-sm" data-print type="button">🖨 طباعة</button>
        </div>
      </div>
      <p class="print-only">Mr Black — تقرير جرد ${label} — طُبع في ${fmtDateTime(new Date())}</p>

      <div class="section"><h3>الأصناف المتتبَّعة</h3>
        ${tracked.length ? html`<div class="table-wrap"><table class="data">
          <thead><tr><th>الصنف</th><th>القسم</th><th>رصيد البداية</th><th>+ توريد</th><th>− مبيع</th><th>− تالف</th><th>± تصحيح</th><th>+ مرتجع</th><th>رصيد النهاية</th><th>الحالي</th></tr></thead>
          <tbody>${tracked.map((r) => html`<tr>
            <td><b>${r.name}</b></td><td>${r.category}</td>
            <td class="num">${r.opening_qty}</td><td class="num">${r.restocked || ''}</td><td class="num">${r.sold_qty || ''}</td>
            <td class="num">${r.wasted || ''}</td><td class="num">${r.adjusted || ''}</td><td class="num">${r.returned || ''}</td>
            <td class="num"><b>${r.closing_qty}</b></td>
            <td class="num"><span class="badge ${r.current_qty <= 0 ? 'badge-danger' : r.current_qty <= r.low_stock_threshold ? 'badge-warn' : ''}">${r.current_qty}</span></td>
          </tr>`)}</tbody></table></div>`
          : emptyTpl('لا توجد أصناف متتبَّعة', 'فعّل تتبّع المخزون من تبويب المنيو.')}
      </div>

      <div class="section"><h3>مبيعات الأصناف غير المتتبَّعة</h3>
        ${untracked.length ? html`<div class="table-wrap"><table class="data">
          <thead><tr><th>الصنف</th><th>القسم</th><th>الكمية المباعة</th></tr></thead>
          <tbody>${untracked.map((r) => html`<tr><td>${r.name}</td><td>${r.category}</td><td class="num">${fmtNum(r.sold_qty)}</td></tr>`)}</tbody>
          </table></div>` : emptyTpl('لا توجد مبيعات لأصناف غير متتبَّعة')}
      </div>`);
  }

  function exportCSV() {
    const out = [
      ['جرد Mr Black', `${from} إلى ${addDays(to, -1)}`], [],
      ['الصنف', 'القسم', 'متتبَّع', 'رصيد البداية', 'توريد', 'مبيع', 'تالف', 'تصحيح', 'مرتجع', 'رصيد النهاية', 'الحالي'],
      ...rows.map((r) => [r.name, r.category, r.track_stock ? 'نعم' : 'لا',
        r.track_stock ? r.opening_qty : '', r.restocked, r.sold_qty, r.wasted, r.adjusted, r.returned,
        r.track_stock ? r.closing_qty : '', r.track_stock ? r.current_qty : '']),
    ];
    downloadCSV(`mrblack-stocktake-${from}_${addDays(to, -1)}.csv`, out);
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
    if (e.target.closest('[data-csv]') && rows.length) return exportCSV();
    if (e.target.closest('[data-print]')) window.print();
  });

  load();
}
