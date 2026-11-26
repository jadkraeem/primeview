// أدوات صغيرة مشتركة بين تبويبات لوحة الكاشير
import { html, setHTML, errMsg } from '../common.js';

export const loadingTpl = (msg = 'جارٍ التحميل…') =>
  html`<div class="state"><div class="spinner"></div>${msg}</div>`;

export const errorTpl = (e) =>
  html`<div class="state"><h3>تعذّر تحميل البيانات</h3><p>${errMsg(e)}</p>
    <button class="btn btn-gold" data-retry type="button">إعادة المحاولة</button></div>`;

export const emptyTpl = (title, sub = '') =>
  html`<div class="state"><h3>${title}</h3>${sub ? html`<p>${sub}</p>` : ''}</div>`;

export const switchTpl = (attrs, checked, disabled = false, label = '') =>
  html`<label class="switch" title="${label}"><input type="checkbox" ${attrs} ${checked ? html`checked` : ''} ${disabled ? html`disabled` : ''} aria-label="${label}"><span></span></label>`;

/** طباعة محتوى محدد فقط (إيصال، رموز QR) */
export function printTpl(tpl) {
  const area = document.getElementById('print-area');
  setHTML(area, tpl);
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    setHTML(area, '');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

/** قيمة رقمية صحيحة من حقل */
export function intOr(v, fallback = null) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback;
}
