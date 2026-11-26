// تبويب المخزون: الكميات الحالية + توريد/تالف/تصحيح جرد + سجل الحركات (المدير)
import {
  sb, html, setHTML, $, toast, errMsg, withBusy, openModal, formData, fmtDateTime,
} from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, intOr } from './util.js';

const REASON = { restock: 'توريد', sale: 'بيع', waste: 'تالف', adjust: 'تصحيح جرد', cancel: 'إرجاع (إلغاء طلب)' };

export function mount(el, ctx) {
  let items = [];
  let moves = [];

  async function load() {
    setHTML(el, loadingTpl());
    const [i, m, p] = await Promise.all([
      sb.from('menu_items').select('id, name, track_stock, stock_qty, low_stock_threshold, available, categories(name)')
        .eq('track_stock', true).order('name'),
      sb.from('stock_movements').select('id, change, reason, note, created_at, order_id, created_by, menu_items(name)')
        .order('created_at', { ascending: false }).limit(60),
      sb.from('profiles').select('id, full_name'),
    ]);
    if (i.error) { setHTML(el, errorTpl(i.error)); return; }
    items = i.data;
    const names = new Map((p.data || []).map((x) => [x.id, x.full_name]));
    moves = (m.error ? [] : m.data).map((mv) => ({ ...mv, by: names.get(mv.created_by) }));
    render();
  }

  function status(it) {
    if (it.stock_qty <= 0) return html`<span class="badge badge-danger">نفد</span>`;
    if (it.stock_qty <= it.low_stock_threshold) return html`<span class="badge badge-warn">منخفض</span>`;
    return html`<span class="badge badge-ok">جيد</span>`;
  }

  function render() {
    const low = items.filter((i) => i.stock_qty <= i.low_stock_threshold).length;
    setHTML(el, html`
      <div class="page-head"><h2>المخزون</h2>
        ${low ? html`<span class="badge badge-warn">${low} صنف يحتاج توريد</span>` : ''}</div>
      <p class="muted" style="margin-bottom:12px">تظهر هنا الأصناف المفعّل لها "تتبّع المخزون" فقط (من تبويب المنيو). المبيعات تُخصم تلقائياً، والإلغاء يُرجع الكمية.</p>

      ${items.length ? html`<div class="table-wrap section"><table class="data">
        <thead><tr><th>الصنف</th><th>القسم</th><th>الكمية</th><th>حد التنبيه</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${items.map((it) => html`<tr data-id="${it.id}">
          <td><b>${it.name}</b></td><td>${it.categories?.name ?? ''}</td>
          <td class="num"><b>${it.stock_qty}</b></td><td class="num">${it.low_stock_threshold}</td>
          <td>${status(it)}</td>
          <td><div class="row">
            <button class="btn btn-sm btn-ok" data-act="restock" type="button">+ توريد</button>
            <button class="btn btn-sm btn-danger" data-act="waste" type="button">− تالف</button>
            <button class="btn btn-sm" data-act="adjust" type="button">جرد فعلي</button>
          </div></td></tr>`)}</tbody></table></div>`
        : emptyTpl('لا توجد أصناف متتبَّعة', 'فعّل "تتبّع المخزون" للأصناف من تبويب المنيو.')}

      <div class="section"><h3>آخر الحركات</h3>
        ${moves.length ? html`<div class="table-wrap"><table class="data">
          <thead><tr><th>الوقت</th><th>الصنف</th><th>الحركة</th><th>الكمية</th><th>ملاحظة</th><th>بواسطة</th></tr></thead>
          <tbody>${moves.map((mv) => html`<tr>
            <td class="num">${fmtDateTime(mv.created_at)}</td><td>${mv.menu_items?.name ?? '—'}</td>
            <td>${REASON[mv.reason]}${mv.order_id ? html` <span class="muted num">#${mv.order_id}</span>` : ''}</td>
            <td class="num" style="color:${mv.change > 0 ? 'var(--ok)' : 'var(--danger)'}">${mv.change > 0 ? '+' : ''}${mv.change}</td>
            <td class="wrap">${mv.note ?? ''}</td><td>${mv.by ?? (mv.reason === 'sale' ? 'زبون' : '—')}</td></tr>`)}
          </tbody></table></div>` : emptyTpl('لا توجد حركات بعد')}
      </div>`);
  }

  function moveForm(it, act) {
    const titles = { restock: `توريد — ${it.name}`, waste: `تسجيل تالف — ${it.name}`, adjust: `جرد فعلي — ${it.name}` };
    const label = act === 'adjust' ? 'الكمية الموجودة فعلياً الآن' : 'الكمية';
    const m = openModal(titles[act], html`
      <form novalidate>
        <p class="muted" style="margin-bottom:12px">الكمية الحالية في النظام: <b class="num">${it.stock_qty}</b></p>
        <div class="field"><label for="mv-qty">${label}</label>
          <input class="input" id="mv-qty" name="qty" type="number" min="${act === 'adjust' ? 0 : 1}" step="1" inputmode="numeric" required></div>
        <div class="field"><label for="mv-note">ملاحظة (اختياري)</label>
          <input class="input" id="mv-note" name="note" maxlength="200"></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const form = $('form', m.body);
    const err = $('.form-error', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const q = intOr(f.qty);
      if (q === null || q < 0 || (act !== 'adjust' && q === 0)) { err.textContent = 'أدخل كمية صحيحة.'; return; }
      const change = act === 'restock' ? q : act === 'waste' ? -q : q - it.stock_qty;
      if (change === 0) { err.textContent = 'الكمية مطابقة للنظام، لا حاجة لتصحيح.'; return; }
      await withBusy(form.querySelector('[type=submit]'), async () => {
        const { error } = await sb.rpc('adjust_stock', { p_item_id: it.id, p_change: change, p_reason: act, p_note: (f.note || '').trim() || null });
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم تحديث المخزون', 'success'); load();
      });
    });
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-retry]')) return load();
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const it = items.find((x) => x.id === Number(b.closest('[data-id]').dataset.id));
    if (it) moveForm(it, b.dataset.act);
  });

  load();
}
