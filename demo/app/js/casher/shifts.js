// الوردية والصندوق: فتح وردية، متابعة الصندوق، إغلاق بعدّ الكاش
import { sb, html, setHTML, $, money, fmtDateTime, errMsg, toast, withBusy, confirmDialog, formData } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, intOr, printTpl } from './util.js';

export function mount(el, ctx) {
  let history = [];

  async function load() {
    setHTML(el, loadingTpl());
    await ctx.refreshShift();
    const { data, error } = await sb.from('shifts').select('*').order('opened_at', { ascending: false }).limit(30);
    if (error) { setHTML(el, errorTpl(error)); return; }
    const names = new Map(((await sb.from('profiles').select('id, full_name')).data || []).map((p) => [p.id, p.full_name]));
    history = data.map((s) => ({ ...s, opener: names.get(s.opened_by), closer: names.get(s.closed_by) }));
    render();
  }

  const diffBadge = (d) => d == null ? '—'
    : d === 0 ? html`<span class="badge badge-ok">مطابق ✓</span>`
    : d > 0 ? html`<span class="badge badge-warn num">زيادة ${money(d)}</span>`
    : html`<span class="badge badge-danger num">نقص ${money(-d)}</span>`;

  function render() {
    const s = ctx.shift;
    setHTML(el, html`
      ${s ? html`
        <div class="kpis">
          <div class="kpi"><small>بداية الصندوق</small><b>${money(s.opening_cash)}</b></div>
          <div class="kpi ok"><small>💵 مبيعات كاش</small><b>${money(s.cash_sales)}</b></div>
          <div class="kpi"><small>💳 مبيعات بطاقة</small><b>${money(s.card_sales)}</b></div>
          <div class="kpi danger"><small>مصاريف من الصندوق</small><b>${money(s.cash_expenses)}</b></div>
          <div class="kpi gold"><small>المتوقع في الصندوق الآن</small><b>${money(s.expected_cash)}</b></div>
          <div class="kpi"><small>طلبات محصّلة</small><b class="num">${s.paid_orders}</b></div>
        </div>
        <div class="card section" style="max-width:560px">
          <h3 style="font-size:17px;margin-bottom:4px">🔒 إغلاق الوردية</h3>
          <p class="muted" style="font-size:13px;margin-bottom:12px">فُتحت ${fmtDateTime(s.opened_at)} بواسطة ${s.opened_by ?? '—'}.
            عدّ الكاش الموجود فعلياً في الصندوق واكتبه هنا؛ النظام يحسب الزيادة أو النقص.</p>
          ${s.unpaid_open ? html`<p class="badge badge-unpaid" style="margin-bottom:10px">تنبيه: يوجد ${s.unpaid_open} طلب غير محصّل.</p>` : ''}
          <form data-close-form novalidate>
            <div class="field"><label for="sh-count">الكاش المعدود في الصندوق</label>
              <input class="input num" id="sh-count" name="counted" type="number" min="0" step="1" inputmode="numeric" required></div>
            <div class="pay-change num hidden" data-diff></div>
            <div class="field"><label for="sh-note">ملاحظة (اختياري)</label><input class="input" id="sh-note" name="note" maxlength="300"></div>
            <p class="form-error" role="alert"></p>
            <button class="btn btn-gold" type="submit">إغلاق الوردية</button>
          </form>
        </div>`
      : html`
        <div class="card section" style="max-width:520px">
          <h3 style="font-size:17px;margin-bottom:4px">🔓 فتح وردية جديدة</h3>
          <p class="muted" style="font-size:13px;margin-bottom:12px">اكتب مبلغ الكاش الموجود في الصندوق عند بداية الوردية (الفكّة). لا يمكن التحصيل بدون وردية مفتوحة.</p>
          <form data-open-form novalidate>
            <div class="field"><label for="sh-open">كاش بداية الوردية</label>
              <input class="input num" id="sh-open" name="opening" type="number" min="0" step="1" inputmode="numeric" value="0" required></div>
            <p class="form-error" role="alert"></p>
            <button class="btn btn-gold" type="submit">فتح الوردية</button>
          </form>
        </div>`}

      <div class="section"><h3>سجل الورديات</h3>
        ${history.length ? html`<div class="table-wrap"><table class="data">
          <thead><tr><th>#</th><th>الفتح</th><th>الإغلاق</th><th>البداية</th><th>المتوقع</th><th>المعدود</th><th>الفرق</th><th></th></tr></thead>
          <tbody>${history.map((h) => html`<tr data-id="${h.id}">
            <td class="num">${h.id}</td>
            <td class="num" style="font-size:12px">${fmtDateTime(h.opened_at)}<br><span class="muted">${h.opener ?? ''}</span></td>
            <td class="num" style="font-size:12px">${h.closed_at ? fmtDateTime(h.closed_at) : html`<span class="badge badge-ok">مفتوحة</span>`}<br><span class="muted">${h.closer ?? ''}</span></td>
            <td class="num">${money(h.opening_cash)}</td>
            <td class="num">${h.expected_cash != null ? money(h.expected_cash) : '—'}</td>
            <td class="num">${h.counted_cash != null ? money(h.counted_cash) : '—'}</td>
            <td>${diffBadge(h.difference)}</td>
            <td>${h.status === 'closed' ? html`<button class="btn btn-sm btn-ghost" data-print type="button">🖨 تقرير</button>` : ''}</td>
          </tr>`)}</tbody></table></div>` : emptyTpl('لا توجد ورديات بعد')}
      </div>`);

    const closeForm = $('[data-close-form]', el);
    if (closeForm) {
      const inp = $('#sh-count', closeForm);
      const diffBox = $('[data-diff]', closeForm);
      inp.addEventListener('input', () => {
        const v = intOr(inp.value);
        if (v === null) { diffBox.classList.add('hidden'); return; }
        const d = v - Number(s.expected_cash);
        diffBox.classList.remove('hidden');
        diffBox.classList.toggle('bad', d < 0);
        diffBox.textContent = d === 0 ? 'الصندوق مطابق ✓' : d > 0 ? `زيادة: ${money(d)}` : `نقص: ${money(-d)}`;
      });
      closeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('.form-error', closeForm);
        const d = formData(closeForm);
        const counted = intOr(d.counted);
        if (counted === null || counted < 0) { err.textContent = 'اكتب المبلغ المعدود.'; return; }
        if (!(await confirmDialog(`إغلاق الوردية بمبلغ معدود ${money(counted)}؟`, { okLabel: 'إغلاق الوردية' }))) return;
        await withBusy(closeForm.querySelector('[type=submit]'), async () => {
          const { data, error } = await sb.rpc('close_shift', { p_counted_cash: counted, p_note: (d.note || '').trim() || null });
          if (error) { err.textContent = errMsg(error); return; }
          toast(data.difference === 0 ? 'تم إغلاق الوردية — الصندوق مطابق ✓' : `تم إغلاق الوردية — الفرق ${money(data.difference)}`, data.difference === 0 ? 'success' : 'error', 6000);
          printShift(data);
          load();
        });
      });
    }
    const openForm = $('[data-open-form]', el);
    if (openForm) {
      openForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('.form-error', openForm);
        const v = intOr(formData(openForm).opening);
        if (v === null || v < 0) { err.textContent = 'اكتب مبلغاً صحيحاً (0 أو أكثر).'; return; }
        await withBusy(openForm.querySelector('[type=submit]'), async () => {
          const { error } = await sb.rpc('open_shift', { p_opening_cash: v });
          if (error) { err.textContent = errMsg(error); return; }
          toast('تم فتح الوردية ✓', 'success');
          load();
        });
      });
    }
  }

  function printShift(s) {
    printTpl(html`<div class="receipt">
      <h2>تقرير وردية #${s.id}</h2>
      <div class="r-line"><span>الفتح</span><span>${fmtDateTime(s.opened_at)}</span></div>
      <div class="r-line"><span>الإغلاق</span><span>${s.closed_at ? fmtDateTime(s.closed_at) : '—'}</span></div>
      <hr>
      <div class="r-line"><span>بداية الصندوق</span><span>${money(s.opening_cash)}</span></div>
      <div class="r-line"><span>مبيعات كاش</span><span>${money(s.cash_sales)}</span></div>
      <div class="r-line"><span>مبيعات بطاقة</span><span>${money(s.card_sales)}</span></div>
      <div class="r-line"><span>مصاريف من الصندوق</span><span>${money(s.cash_expenses)}</span></div>
      <hr>
      <div class="r-line"><span>المتوقع</span><span>${money(s.expected_cash)}</span></div>
      <div class="r-line"><span>المعدود</span><span>${s.counted_cash != null ? money(s.counted_cash) : '—'}</span></div>
      <div class="r-line" style="font-weight:bold"><span>الفرق</span><span>${s.difference != null ? money(s.difference) : '—'}</span></div>
      ${s.note ? html`<p>ملاحظة: ${s.note}</p>` : ''}
    </div>`);
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    const p = e.target.closest('[data-print]');
    if (p) {
      const { data, error } = await sb.rpc('shift_summary', { p_shift_id: Number(p.closest('[data-id]').dataset.id) });
      if (error) { toast(errMsg(error), 'error'); return; }
      printShift(data);
    }
  });

  load();
}
