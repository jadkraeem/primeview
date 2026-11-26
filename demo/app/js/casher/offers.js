// تبويب العروض (المدير)
import { sb, html, setHTML, $, money, toast, toastError, errMsg, withBusy, confirmDialog, openModal, formData, fmtDateTime } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, switchTpl } from './util.js';

/** تحويل timestamptz إلى قيمة datetime-local (بتوقيت المتصفح) */
function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function mount(el) {
  let offers = [];
  let cats = [];
  let items = [];

  async function load() {
    setHTML(el, loadingTpl());
    const [o, c, i] = await Promise.all([
      sb.from('offers').select('*').order('created_at', { ascending: false }),
      sb.from('categories').select('id, name').order('sort'),
      sb.from('menu_items').select('id, name').order('name'),
    ]);
    const err = o.error || c.error || i.error;
    if (err) { setHTML(el, errorTpl(err)); return; }
    [offers, cats, items] = [o.data, c.data, i.data];
    render();
  }

  const target = (o) => o.item_id ? `الصنف: ${items.find((x) => x.id === o.item_id)?.name ?? '—'}`
    : o.category_id ? `القسم: ${cats.find((x) => x.id === o.category_id)?.name ?? '—'}` : 'كل المنيو';
  const value = (o) => o.discount_type === 'none' ? 'بدون خصم' : o.discount_type === 'percent' ? `${Number(o.discount_value)}%` : money(o.discount_value);
  function liveBadge(o) {
    const now = Date.now();
    if (!o.active) return html`<span class="badge">موقوف</span>`;
    if (o.starts_at && new Date(o.starts_at) > now) return html`<span class="badge badge-warn">لم يبدأ</span>`;
    if (o.ends_at && new Date(o.ends_at) <= now) return html`<span class="badge badge-danger">منتهي</span>`;
    return html`<span class="badge badge-ok">فعّال الآن</span>`;
  }

  function render() {
    setHTML(el, html`
      <div class="page-head"><h2>العروض</h2><button class="btn btn-gold" data-add type="button">+ عرض</button></div>
      <p class="muted" style="margin-bottom:12px">العروض الفعّالة تظهر للزبائن في صندوق "عروض Mr Black" بصفحة المنيو. إذا انطبق أكثر من خصم على صنف يُطبَّق الأكبر فقط، والخصم يُحسب على السيرفر. نوع "إعلان بدون خصم" يظهر للزبائن فقط ولا يغيّر الأسعار.</p>
      ${offers.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>العرض</th><th>الخصم</th><th>يُطبَّق على</th><th>الفترة</th><th>الحالة</th><th>تفعيل</th><th></th></tr></thead>
        <tbody>${offers.map((o) => html`<tr data-id="${o.id}">
          <td class="wrap"><b>${o.title}</b>${o.description ? html`<div class="muted" style="font-size:12px">${o.description}</div>` : ''}</td>
          <td class="num">${value(o)}</td><td>${target(o)}</td>
          <td class="num" style="font-size:12px">${o.starts_at ? fmtDateTime(o.starts_at) : 'الآن'}<br>${o.ends_at ? `حتى ${fmtDateTime(o.ends_at)}` : 'بدون نهاية'}</td>
          <td>${liveBadge(o)}</td>
          <td>${switchTpl(html`data-active`, o.active, false, 'تفعيل')}</td>
          <td><div class="row"><button class="btn btn-sm" data-edit type="button">تعديل</button>
            <button class="btn btn-sm btn-danger" data-del type="button">حذف</button></div></td></tr>`)}
        </tbody></table></div>` : emptyTpl('لا توجد عروض', 'أنشئ عرضاً بنسبة أو مبلغ ثابت على صنف أو قسم أو كل المنيو.')}`);
  }

  function form(o = null) {
    const scope = o?.item_id ? 'item' : o?.category_id ? 'category' : 'all';
    const m = openModal(o ? 'تعديل العرض' : 'عرض جديد', html`
      <form novalidate>
        <div class="field"><label for="of-title">عنوان العرض</label>
          <input class="input" id="of-title" name="title" maxlength="80" required value="${o?.title ?? ''}"></div>
        <div class="field"><label for="of-desc">وصف (اختياري)</label>
          <input class="input" id="of-desc" name="description" maxlength="300" value="${o?.description ?? ''}"></div>
        <div class="grid-2">
          <div class="field"><label for="of-type">نوع الخصم</label>
            <select class="input" id="of-type" name="discount_type">
              <option value="percent" ${o?.discount_type !== 'fixed' ? html`selected` : ''}>نسبة %</option>
              <option value="fixed" ${o?.discount_type === 'fixed' ? html`selected` : ''}>مبلغ ثابت</option>
              <option value="none" ${o?.discount_type === 'none' ? html`selected` : ''}>إعلان بدون خصم</option></select></div>
          <div class="field ${o?.discount_type === 'none' ? 'hidden' : ''}" data-val><label for="of-val">القيمة</label>
            <input class="input" id="of-val" name="discount_value" type="number" min="1" step="1" required value="${o ? Number(o.discount_value) : ''}"></div>
        </div>
        <div class="field"><label for="of-scope">يُطبَّق على</label>
          <select class="input" id="of-scope" name="scope">
            <option value="all" ${scope === 'all' ? html`selected` : ''}>كل المنيو</option>
            <option value="category" ${scope === 'category' ? html`selected` : ''}>قسم محدد</option>
            <option value="item" ${scope === 'item' ? html`selected` : ''}>صنف محدد</option></select></div>
        <div class="field ${scope === 'category' ? '' : 'hidden'}" data-for="category"><label for="of-cat">القسم</label>
          <select class="input" id="of-cat" name="category_id">${cats.map((c) => html`<option value="${c.id}" ${o?.category_id === c.id ? html`selected` : ''}>${c.name}</option>`)}</select></div>
        <div class="field ${scope === 'item' ? '' : 'hidden'}" data-for="item"><label for="of-item">الصنف</label>
          <select class="input" id="of-item" name="item_id">${items.map((i) => html`<option value="${i.id}" ${o?.item_id === i.id ? html`selected` : ''}>${i.name}</option>`)}</select></div>
        <div class="grid-2">
          <div class="field"><label for="of-start">يبدأ (اختياري)</label>
            <input class="input" id="of-start" name="starts_at" type="datetime-local" value="${toLocalInput(o?.starts_at)}"></div>
          <div class="field"><label for="of-end">ينتهي (اختياري)</label>
            <input class="input" id="of-end" name="ends_at" type="datetime-local" value="${toLocalInput(o?.ends_at)}"></div>
        </div>
        <label class="check" style="margin-bottom:12px"><input type="checkbox" name="active" ${o?.active === false ? '' : html`checked`}> العرض مفعّل</label>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    $('#of-type', f).addEventListener('change', (e) => { $('[data-val]', f).classList.toggle('hidden', e.target.value === 'none'); });
    $('#of-scope', f).addEventListener('change', (e) => {
      f.querySelectorAll('[data-for]').forEach((d) => d.classList.toggle('hidden', d.dataset.for !== e.target.value));
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      const val = d.discount_type === 'none' ? 1 : Number(d.discount_value);
      const row = {
        title: (d.title || '').trim(),
        description: (d.description || '').trim() || null,
        discount_type: d.discount_type,
        discount_value: val,
        category_id: d.scope === 'category' ? Number(d.category_id) : null,
        item_id: d.scope === 'item' ? Number(d.item_id) : null,
        starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : null,
        ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null,
        active: !!d.active,
      };
      if (!row.title) { err.textContent = 'عنوان العرض مطلوب.'; return; }
      if (!(val > 0)) { err.textContent = 'قيمة الخصم يجب أن تكون أكبر من صفر.'; return; }
      if (row.discount_type === 'percent' && val > 100) { err.textContent = 'النسبة لا تتجاوز 100%.'; return; }
      if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) { err.textContent = 'تاريخ النهاية يجب أن يكون بعد البداية.'; return; }
      if (d.scope === 'category' && !row.category_id) { err.textContent = 'اختر قسماً.'; return; }
      if (d.scope === 'item' && !row.item_id) { err.textContent = 'اختر صنفاً.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = o ? await sb.from('offers').update(row).eq('id', o.id) : await sb.from('offers').insert(row);
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم حفظ العرض', 'success'); load();
      });
    });
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add]')) return form();
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const o = offers.find((x) => x.id === Number(row.dataset.id));
    if (e.target.closest('[data-edit]')) return form(o);
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog(`حذف العرض "${o.title}"؟`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('offers').delete().eq('id', o.id);
      if (error) return toastError(error);
      toast('تم حذف العرض', 'success'); load();
    }
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-active]')) return;
    const id = Number(e.target.closest('[data-id]').dataset.id);
    const val = e.target.checked;
    const { error } = await sb.from('offers').update({ active: val }).eq('id', id);
    if (error) { e.target.checked = !val; toastError(error); return; }
    offers.find((x) => x.id === id).active = val;
    render();
  });

  load();
}
