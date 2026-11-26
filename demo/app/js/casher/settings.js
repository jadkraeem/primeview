// تبويب الإعدادات (المدير)
import { sb, html, setHTML, $, toast, errMsg, withBusy, formData } from '../common.js';
import { loadingTpl, errorTpl } from './util.js';

export function mount(el, ctx) {
  async function load() {
    setHTML(el, loadingTpl());
    try { await ctx.loadSettings(); } catch (e) { setHTML(el, errorTpl(e)); return; }
    render();
  }

  function render() {
    const s = ctx.settings;
    setHTML(el, html`
      <div class="page-head"><h2>الإعدادات</h2></div>
      <form class="card" style="max-width:560px" novalidate>
        <div class="field"><label for="st-name">اسم الكافيه</label>
          <input class="input" id="st-name" name="cafe_name" maxlength="60" required value="${s.cafe_name}"></div>
        <div class="field"><label for="st-tag">العبارة في غلاف المنيو</label>
          <input class="input" id="st-tag" name="tagline" maxlength="120" value="${s.tagline ?? ''}"></div>
        <div class="field"><label for="st-addr">العنوان (يظهر أسفل المنيو)</label>
          <input class="input" id="st-addr" name="address" maxlength="150" value="${s.address ?? ''}"></div>
        <div class="grid-2">
          <div class="field"><label for="st-phone">رقم الهاتف</label>
            <input class="input" id="st-phone" name="phone" maxlength="40" dir="ltr" value="${s.phone ?? ''}"></div>
          <div class="field"><label for="st-hours">أوقات الدوام</label>
            <input class="input" id="st-hours" name="opening_hours" maxlength="80" placeholder="يومياً 8 صباحاً – 12 ليلاً" value="${s.opening_hours ?? ''}"></div>
        </div>
        <div class="field"><label for="st-cur">رمز العملة</label>
          <input class="input" id="st-cur" name="currency" maxlength="10" required value="${s.currency}"></div>
        <div class="grid-2">
          <div class="field"><label for="st-srv">رسوم الخدمة %</label>
            <input class="input" id="st-srv" name="service_percent" type="number" min="0" max="100" step="0.01" value="${Number(s.service_percent)}"></div>
          <div class="field"><label for="st-tax">الضريبة %</label>
            <input class="input" id="st-tax" name="tax_percent" type="number" min="0" max="100" step="0.01" value="${Number(s.tax_percent)}"></div>
        </div>
        <div class="field"><label for="st-late">يُعتبر الطلب متأخراً بعد (دقيقة)</label>
          <input class="input" id="st-late" name="late_minutes" type="number" min="1" max="240" step="1" value="${s.late_minutes}"></div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">الخدمة والضريبة تُحسبان على المبلغ بعد الخصم، وتُطبَّقان على الطلبات الجديدة فقط.</p>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ الإعدادات</button>
      </form>`);

    const f = $('form', el);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      const row = {
        cafe_name: d.cafe_name.trim(),
        currency: d.currency.trim(),
        service_percent: Number(d.service_percent || 0),
        tax_percent: Number(d.tax_percent || 0),
        late_minutes: Number(d.late_minutes),
        tagline: (d.tagline || '').trim() || 'أكثر من مجرد قهوة..',
        address: (d.address || '').trim() || null,
        phone: (d.phone || '').trim() || null,
        opening_hours: (d.opening_hours || '').trim() || null,
      };
      if (!row.cafe_name || !row.currency) { err.textContent = 'اسم الكافيه والعملة مطلوبان.'; return; }
      if ([row.service_percent, row.tax_percent].some((v) => !(v >= 0 && v <= 100))) { err.textContent = 'النسب بين 0 و 100.'; return; }
      if (!Number.isInteger(row.late_minutes) || row.late_minutes < 1 || row.late_minutes > 240) { err.textContent = 'مدة التأخير بين 1 و 240 دقيقة.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = await sb.from('settings').update(row).eq('id', 1);
        if (error) { err.textContent = errMsg(error); return; }
        await ctx.loadSettings();
        err.textContent = '';
        toast('تم حفظ الإعدادات', 'success');
      });
    });
  }

  el.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(); });
  load();
}
