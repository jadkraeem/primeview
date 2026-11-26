// تبويب الطاولات ورموز QR (المدير)
import { sb, html, setHTML, $, raw, toast, toastError, errMsg, withBusy, confirmDialog, openModal, formData } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, switchTpl, printTpl, intOr } from './util.js';

export function tableUrl(n) {
  const u = new URL('index.html', location.href);
  u.search = `?table=${n}`;
  u.hash = '';
  return u.href;
}

/** SVG رمز QR — يُولَّد محلياً من رابط نبنيه نحن (رقم صحيح فقط) */
function qrSvg(n) {
  const qr = window.qrcode(0, 'M');
  qr.addData(tableUrl(Number(n)));
  qr.make();
  return raw(qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
}

export function mount(el) {
  let tables = [];

  async function load() {
    setHTML(el, loadingTpl());
    const { data, error } = await sb.from('cafe_tables').select('*').order('number');
    if (error) { setHTML(el, errorTpl(error)); return; }
    tables = data;
    render();
  }

  function render() {
    setHTML(el, html`
      <div class="page-head"><h2>الطاولات و QR</h2>
        <div class="row">
          <button class="btn" data-print-all type="button" ${tables.some((t) => t.active) ? '' : html`disabled`}>🖨 طباعة كل الرموز</button>
          <button class="btn btn-gold" data-add type="button">+ طاولة</button>
        </div></div>
      <p class="muted" style="margin-bottom:12px">كل طاولة لها رمز QR يفتح المنيو برقمها. الطاولة المعطّلة لا تستقبل طلبات.</p>
      ${tables.length ? html`<div class="qr-grid">${tables.map((t) => html`
        <div class="card qr-card" data-id="${t.id}">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <b>طاولة ${t.number}</b>${switchTpl(html`data-active`, t.active, false, 'فعّالة')}
          </div>
          ${t.label ? html`<p class="muted" style="font-size:13px;margin-bottom:6px">${t.label}</p>` : ''}
          <button class="btn btn-sm" data-qr type="button" style="width:100%;margin-bottom:6px">عرض QR</button>
          <div class="row"><button class="btn btn-sm" data-edit type="button" style="flex:1">تعديل</button>
            <button class="btn btn-sm btn-danger" data-del type="button" style="flex:1">حذف</button></div>
        </div>`)}</div>` : emptyTpl('لا توجد طاولات', 'أضف طاولاتك لتوليد رموز QR.')}`);
  }

  function form(t = null) {
    const m = openModal(t ? `تعديل طاولة ${t.number}` : 'طاولة جديدة', html`
      <form novalidate>
        <div class="field"><label for="t-num">رقم الطاولة</label>
          <input class="input" id="t-num" name="number" type="number" min="1" max="999" step="1" required
            value="${t?.number ?? (Math.max(0, ...tables.map((x) => x.number)) + 1)}"></div>
        <div class="field"><label for="t-label">وصف (اختياري)، مثل: الشرفة</label>
          <input class="input" id="t-label" name="label" maxlength="40" value="${t?.label ?? ''}"></div>
        ${t ? html`<p class="muted" style="font-size:13px;margin-bottom:10px">تغيير الرقم يتطلب طباعة رمز QR جديد.</p>` : ''}
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      const row = { number: intOr(d.number), label: (d.label || '').trim() || null };
      if (!row.number || row.number < 1 || row.number > 999) { err.textContent = 'رقم الطاولة بين 1 و 999.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = t ? await sb.from('cafe_tables').update(row).eq('id', t.id) : await sb.from('cafe_tables').insert(row);
        if (error) { err.textContent = error.code === '23505' ? 'يوجد طاولة بهذا الرقم.' : errMsg(error); return; }
        m.close(); toast('تم الحفظ', 'success'); load();
      });
    });
  }

  function showQR(t) {
    const url = tableUrl(t.number);
    const m = openModal(`QR — طاولة ${t.number}`, html`
      <div class="qr-box">${qrSvg(t.number)}</div>
      <p class="muted" style="font-size:12px;text-align:center;word-break:break-all;margin-bottom:12px" dir="ltr">${url}</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-gold" data-p type="button">🖨 طباعة</button>
        <button class="btn" data-copy type="button">نسخ الرابط</button>
        <a class="btn" href="${url}" target="_blank" rel="noopener">فتح المنيو</a>
      </div>`);
    $('[data-p]', m.body).onclick = () => printTpl(html`<div class="qr-print" style="grid-template-columns:1fr;max-width:90mm;margin:auto">
      <div>${qrSvg(t.number)}<b>طاولة ${t.number}</b><span>امسح الرمز للطلب</span></div></div>`);
    $('[data-copy]', m.body).onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('تم نسخ الرابط', 'success'); } catch { toast('تعذّر النسخ', 'error'); }
    };
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add]')) return form();
    if (e.target.closest('[data-print-all]')) {
      return printTpl(html`<div class="qr-print">${tables.filter((t) => t.active).map((t) =>
        html`<div>${qrSvg(t.number)}<b>Mr Black · طاولة ${t.number}</b><span>امسح الرمز للطلب</span></div>`)}</div>`);
    }
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const t = tables.find((x) => x.id === Number(card.dataset.id));
    if (e.target.closest('[data-qr]')) return showQR(t);
    if (e.target.closest('[data-edit]')) return form(t);
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog(`حذف طاولة ${t.number}؟`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('cafe_tables').delete().eq('id', t.id);
      if (error) return toast(error.code === '23503' ? 'لهذه الطاولة طلبات سابقة، لذا لا يمكن حذفها. عطّلها بدلاً من ذلك.' : errMsg(error), 'error');
      toast('تم الحذف', 'success'); load();
    }
  });

  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-active]')) return;
    const id = Number(e.target.closest('[data-id]').dataset.id);
    const val = e.target.checked;
    const { error } = await sb.from('cafe_tables').update({ active: val }).eq('id', id);
    if (error) { e.target.checked = !val; toastError(error); return; }
    tables.find((x) => x.id === id).active = val;
    toast(val ? 'الطاولة فعّالة' : 'تم تعطيل الطاولة', 'success');
  });

  load();
}
