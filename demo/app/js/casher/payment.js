// نافذة التحصيل (مشتركة: الطلبات، نقطة البيع، الرئيسية)
import { sb, html, $, $$, money, fmtNum, errMsg, toast, withBusy, openModal } from '../common.js';
import { orderPlace } from '../orders-feed.js';
import { printTpl } from './util.js';
import { receiptTpl } from './receipt.js';

/** فئات تقريب سريعة للمبلغ المستلم */
function quickAmounts(total) {
  const steps = [5000, 10000, 50000, 100000];
  const set = new Set([total]);
  steps.forEach((s) => set.add(Math.ceil(total / s) * s));
  return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 5);
}

/**
 * يفتح نافذة التحصيل. يعيد Promise بنتيجة الدفع أو null عند الإلغاء.
 * order: كائن الطلب (id, total, ...)
 */
export function openPayment(order, ctx) {
  return new Promise((resolve) => {
    let method = 'cash';
    let done = false;
    const m = openModal(`تحصيل — طلب #${order.id}`, html`
      <p class="muted" style="text-align:center">${orderPlace(order)}</p>
      <div class="pay-total num">${money(order.total)}</div>
      ${!ctx.shift ? html`<p class="form-error" style="text-align:center">لا توجد وردية مفتوحة. افتح وردية أولاً من "الوردية والصندوق".</p>` : ''}
      <div style="text-align:center;margin-bottom:14px">
        <div class="seg" role="radiogroup" aria-label="طريقة الدفع">
          <button type="button" class="on" data-method="cash">💵 كاش</button>
          <button type="button" data-method="card">💳 بطاقة</button>
        </div>
      </div>
      <div data-cash>
        <div class="field"><label for="pay-recv">المبلغ المستلم من الزبون</label>
          <input class="input num" id="pay-recv" type="number" min="0" step="1" inputmode="numeric" value="${order.total}"></div>
        <div class="pay-quick">${quickAmounts(Number(order.total)).map((v) =>
          html`<button class="btn btn-sm" type="button" data-amt="${v}">${fmtNum(v)}</button>`)}</div>
        <div class="pay-change num" data-change>الباقي للزبون: ${money(0)}</div>
      </div>
      <p class="form-error" data-err></p>
      <div class="row">
        <button class="btn btn-gold" data-confirm type="button" style="flex:1;min-height:50px;font-size:16px" ${ctx.shift ? '' : html`disabled`}>تأكيد الدفع ✓</button>
        <button class="btn" data-close type="button">إلغاء</button>
      </div>`);

    const recv = $('#pay-recv', m.body);
    const changeBox = $('[data-change]', m.body);
    const updateChange = () => {
      const c = Number(recv.value || 0) - Number(order.total);
      changeBox.textContent = c >= 0 ? `الباقي للزبون: ${money(c)}` : `ناقص: ${money(-c)}`;
      changeBox.classList.toggle('bad', c < 0);
    };
    updateChange();
    recv.addEventListener('input', updateChange);
    recv.select();

    m.body.addEventListener('click', async (e) => {
      const mb = e.target.closest('[data-method]');
      if (mb) {
        method = mb.dataset.method;
        $$('[data-method]', m.body).forEach((b) => b.classList.toggle('on', b === mb));
        $('[data-cash]', m.body).classList.toggle('hidden', method !== 'cash');
        return;
      }
      const amt = e.target.closest('[data-amt]');
      if (amt) { recv.value = amt.dataset.amt; updateChange(); return; }
      const ok = e.target.closest('[data-confirm]');
      if (!ok) return;
      const err = $('[data-err]', m.body);
      err.textContent = '';
      const received = method === 'cash' ? Number(recv.value || 0) : null;
      if (method === 'cash' && (!Number.isInteger(received) || received < Number(order.total))) {
        err.textContent = 'المبلغ المستلم أقل من الإجمالي.'; return;
      }
      await withBusy(ok, async () => {
        const { data, error } = await sb.rpc('pay_order', { p_order_id: order.id, p_method: method, p_received: received });
        if (error) { err.textContent = errMsg(error); return; }
        done = true;
        ctx.feed?.patch(order.id, { paid_at: new Date().toISOString(), payment_method: method, amount_received: data.received, change_due: data.change });
        ctx.refreshShift?.();
        setHTML_done(m, order, data, ctx);
        resolve(data);
      });
    });
    new MutationObserver((_, obs) => {
      if (!m.root.isConnected) { obs.disconnect(); if (!done) resolve(null); }
    }).observe(document.body, { childList: true });
  });
}

function setHTML_done(m, order, data, ctx) {
  const body = m.body;
  body.innerHTML = '';
  const box = document.createElement('div');
  box.style.textAlign = 'center';
  box.innerHTML = html`
    <div style="font-size:46px">✅</div>
    <h3 style="margin:6px 0">تم الدفع</h3>
    <p class="muted">${data.method === 'cash' ? 'كاش' : 'بطاقة'} · ${money(data.total)}</p>
    ${data.method === 'cash' && data.change > 0 ? html`<div class="pay-change num">أعطِ الزبون الباقي: ${money(data.change)}</div>` : ''}
    <div class="row" style="justify-content:center;margin-top:12px">
      <button class="btn" data-print type="button">🖨 طباعة الإيصال</button>
      <button class="btn btn-gold" data-close type="button">تم</button>
    </div>`.toString();
  body.appendChild(box);
  $('[data-print]', box).onclick = () => {
    const full = ctx.feed?.get(order.id) || order;
    printTpl(receiptTpl({ ...full, payment_method: data.method, amount_received: data.received, change_due: data.change }, ctx.settings));
  };
  toast(`تم تحصيل الطلب #${order.id}`, 'success');
}
