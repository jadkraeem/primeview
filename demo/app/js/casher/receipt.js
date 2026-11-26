// قالب الإيصال المطبوع
import { html, money, fmtDateTime } from '../common.js';
import { orderPlace } from '../orders-feed.js';

const METHOD = { cash: 'كاش', card: 'بطاقة' };

export function receiptTpl(o, settings) {
  return html`<div class="receipt">
    <h2>${settings?.cafe_name || 'Mr Black'}</h2>
    ${settings?.address ? html`<div style="text-align:center;font-size:11px">${settings.address}</div>` : ''}
    ${settings?.phone ? html`<div style="text-align:center;font-size:11px">${settings.phone}</div>` : ''}
    <hr>
    <div class="r-line"><span>فاتورة #${o.id}</span><span>${orderPlace(o)}</span></div>
    <div class="r-line"><span>${fmtDateTime(o.created_at)}</span></div>
    <hr>
    ${(o.order_items || []).map((l) => html`<div class="r-line"><span>${l.qty}× ${l.item_name}</span><span>${money(l.line_total)}</span></div>
      ${l.note ? html`<div style="font-size:11px">  ✎ ${l.note}</div>` : ''}`)}
    <hr>
    <div class="r-line"><span>المجموع</span><span>${money(o.subtotal)}</span></div>
    ${o.discount ? html`<div class="r-line"><span>الخصم</span><span>− ${money(o.discount)}</span></div>` : ''}
    ${o.service ? html`<div class="r-line"><span>الخدمة</span><span>${money(o.service)}</span></div>` : ''}
    ${o.tax ? html`<div class="r-line"><span>الضريبة</span><span>${money(o.tax)}</span></div>` : ''}
    <hr>
    <div class="r-line" style="font-size:15px;font-weight:bold"><span>الإجمالي</span><span>${money(o.total)}</span></div>
    ${o.payment_method ? html`
      <div class="r-line"><span>الدفع</span><span>${METHOD[o.payment_method]}</span></div>
      ${o.payment_method === 'cash' ? html`
        <div class="r-line"><span>المستلم</span><span>${money(o.amount_received)}</span></div>
        <div class="r-line"><span>الباقي</span><span>${money(o.change_due)}</span></div>` : ''}`
    : html`<div class="r-line"><span>الحالة</span><span>غير مدفوع</span></div>`}
    <p style="text-align:center;margin-top:8px">شكراً لزيارتكم ☕</p>
  </div>`;
}
