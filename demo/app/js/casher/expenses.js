// المصاريف: تسجيل ومتابعة (المدير والكاشير؛ التعديل والحذف للمدير)
import { sb, html, setHTML, $, money, fmtDateTime, errMsg, toast, toastError, withBusy, confirmDialog, openModal, formData, downloadCSV, addDays, dayStart } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, intOr } from './util.js';
import { presetRange, rangeBarTpl } from './reports.js';

export const EXPENSE_CATS = {
  supplies: '🥛 مواد خام ومشتريات', salaries: '👥 رواتب وأجور', rent: '🏠 إيجار',
  utilities: '💡 فواتير (كهرباء، ماء، إنترنت)', maintenance: '🔧 صيانة', marketing: '📣 تسويق', other: '📌 أخرى',
};

export function mount(el, ctx) {
  let preset = 'today';
  let [from, to] = presetRange(preset);
  let rows = [];

  async function load() {
    setHTML(el, html`${rangeBarTpl(preset, from, to)}<div id="ex-body">${loadingTpl()}</div>`);
    const [ex, pr] = await Promise.all([
      sb.from('expenses').select('*').gte('spent_at', dayStart(from).toISOString()).lt('spent_at', dayStart(to).toISOString())
        .order('spent_at', { ascending: false }).limit(1000),
      sb.from('profiles').select('id, full_name'),
    ]);
    const body = $('#ex-body', el);
    if (!body) return;
    if (ex.error) { setHTML(body, errorTpl(ex.error)); return; }
    const names = new Map((pr.data || []).map((p) => [p.id, p.full_name]));
    rows = ex.data.map((r) => ({ ...r, by: names.get(r.created_by) }));
    render(body);
  }

  function render(body) {
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    const byCat = Object.entries(rows.reduce((a, r) => { a[r.category] = (a[r.category] || 0) + Number(r.amount); return a; }, {}))
      .sort((a, b) => b[1] - a[1]);
    setHTML(body, html`
      <div class="page-head">
        <h2>المصاريف <span class="muted num" style="font-size:14px">${from} → ${addDays(to, -1)}</span></h2>
        <div class="row no-print">
          <button class="btn btn-gold" data-add type="button">+ مصروف جديد</button>
          ${rows.length ? html`<button class="btn btn-sm" data-csv type="button">⬇ CSV</button>` : ''}
        </div>
      </div>
      <div class="kpis">
        <div class="kpi danger"><small>إجمالي المصاريف</small><b>${money(total)}</b></div>
        ${byCat.slice(0, 4).map(([k, v]) => html`<div class="kpi"><small>${EXPENSE_CATS[k]}</small><b>${money(v)}</b></div>`)}
      </div>
      ${rows.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>من الصندوق</th><th>بواسطة</th>${ctx.isManager ? html`<th></th>` : ''}</tr></thead>
        <tbody>${rows.map((r) => html`<tr data-id="${r.id}">
          <td class="num" style="font-size:12px">${fmtDateTime(r.spent_at)}</td><td>${EXPENSE_CATS[r.category]}</td>
          <td class="wrap">${r.description ?? ''}</td><td class="num"><b>${money(r.amount)}</b></td>
          <td>${r.from_drawer ? html`<span class="badge badge-warn">نعم</span>` : html`<span class="muted">لا</span>`}</td>
          <td>${r.by ?? '—'}</td>
          ${ctx.isManager ? html`<td><button class="btn btn-sm btn-danger" data-del type="button">حذف</button></td>` : ''}
        </tr>`)}</tbody></table></div>` : emptyTpl('لا توجد مصاريف في هذه الفترة', 'سجّل كل مصروف (مشتريات، فواتير، رواتب…) لتظهر الأرباح الحقيقية في التقارير.')}`);
  }

  function addForm() {
    const m = openModal('💸 مصروف جديد', html`
      <form novalidate>
        <div class="field"><label for="ex-cat">النوع</label>
          <select class="input" id="ex-cat" name="category">${Object.entries(EXPENSE_CATS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
        <div class="field"><label for="ex-amt">المبلغ (${ctx.settings.currency})</label>
          <input class="input num" id="ex-amt" name="amount" type="number" min="1" step="1" inputmode="numeric" required></div>
        <div class="field"><label for="ex-desc">الوصف (اختياري)</label>
          <input class="input" id="ex-desc" name="description" maxlength="200" placeholder="مثال: 10 لتر حليب"></div>
        <label class="check" style="margin-bottom:6px"><input type="checkbox" name="from_drawer" ${ctx.shift ? html`checked` : html`disabled`}> دُفع من صندوق الوردية الحالية</label>
        ${!ctx.shift ? html`<p class="muted" style="font-size:12px">لا توجد وردية مفتوحة، لذا يُسجَّل كمصروف عام.</p>` : ''}
        <p class="form-error" role="alert" style="margin-top:8px"></p>
        <button class="btn btn-gold" type="submit">حفظ المصروف</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      const amount = intOr(d.amount);
      if (!amount || amount <= 0) { err.textContent = 'اكتب مبلغاً صحيحاً.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = await sb.rpc('add_expense', { p_category: d.category, p_amount: amount,
          p_description: (d.description || '').trim() || null, p_from_drawer: !!d.from_drawer, p_spent_at: null });
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم تسجيل المصروف', 'success');
        ctx.refreshShift?.();
        load();
      });
    });
  }

  el.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-preset]');
    if (p) { preset = p.dataset.preset; [from, to] = presetRange(preset); load(); return; }
    if (e.target.closest('[data-apply]')) {
      const f = $('[data-from]', el).value, t = $('[data-to]', el).value;
      if (!f || !t || t < f) { toast('اختر فترة صحيحة.', 'error'); return; }
      preset = 'custom'; from = f; to = addDays(t, 1); load(); return;
    }
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add]')) return addForm();
    if (e.target.closest('[data-csv]')) {
      return downloadCSV(`mrblack-expenses-${from}_${addDays(to, -1)}.csv`, [
        ['التاريخ', 'النوع', 'الوصف', 'المبلغ', 'من الصندوق', 'بواسطة'],
        ...rows.map((r) => [fmtDateTime(r.spent_at), EXPENSE_CATS[r.category], r.description ?? '', Number(r.amount), r.from_drawer ? 'نعم' : 'لا', r.by ?? '']),
      ]);
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const r = rows.find((x) => x.id === Number(del.closest('[data-id]').dataset.id));
      if (!(await confirmDialog(`حذف مصروف ${money(r.amount)}؟`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('expenses').delete().eq('id', r.id);
      if (error) return toastError(error);
      toast('تم الحذف', 'success'); ctx.refreshShift?.(); load();
    }
  });

  load();
}
