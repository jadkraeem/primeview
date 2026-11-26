// =========================================================
// Mr Black — شاشة المطبخ
// =========================================================
import {
  sb, html, setHTML, $, staffGate, signOut, elapsed, minutesSince, fmtTime,
  unlockAudio, audioReady, beep, toast, toastError, withBusy, ROLE_LABELS, themeButtonTpl,
} from './common.js';
import { startOrdersFeed, changeStatus, orderPlace } from './orders-feed.js';
import { mountAssistant } from './assistant.js';

const root = $('#app');
let lateMinutes = 15;
let orders = [];
let feed;
const freshIds = new Set();

const COLS = [
  { key: 'new', title: 'جديد', action: { to: 'preparing', label: 'بدء التحضير', cls: 'btn-gold' } },
  { key: 'preparing', title: 'قيد التحضير', action: { to: 'ready', label: 'جاهز ✓', cls: 'btn-ok' } },
  { key: 'ready', title: 'جاهز للتسليم', action: null },
];

function orderCard(o, col) {
  const mins = minutesSince(o.created_at);
  const done = o.status === 'ready';
  const cls = done ? '' : mins >= lateMinutes ? 'late' : mins >= lateMinutes * 0.7 ? 'warn' : '';
  return html`
    <article class="order ${cls} ${freshIds.has(o.id) ? 'is-new' : ''}" data-id="${o.id}">
      <div class="order-head">
        <b>${orderPlace(o)}</b>
        <span class="muted num" style="font-size:13px">#${o.id} · ${fmtTime(o.created_at)}</span>
        <span class="timer" data-since="${done ? '' : o.created_at}">${done ? '✓' : elapsed(o.created_at)}</span>
      </div>
      <div class="order-body">
        ${(o.order_items || []).map((l) => html`<div class="order-line">
          <span class="q num">${l.qty}×</span>${l.item_name}
          ${l.note ? html`<span class="note">✎ ${l.note}</span>` : ''}</div>`)}
      </div>
      ${col.action ? html`<div class="order-foot">
        <button class="btn ${col.action.cls}" data-to="${col.action.to}" type="button">${col.action.label}</button>
      </div>` : ''}
    </article>`;
}

function render() {
  const board = $('#board');
  if (!board) return;
  setHTML(board, html`${COLS.map((c) => {
    const list = orders.filter((o) => o.status === c.key);
    return html`<section class="k-col" data-col="${c.key}">
      <div class="k-col-head"><h2>${c.title}</h2><span class="badge num">${list.length}</span></div>
      <div class="k-col-body">${list.length ? list.map((o) => orderCard(o, c)) : html`<div class="state">لا توجد طلبات</div>`}</div>
    </section>`;
  })}`);
}

/** تحديث المؤقتات والتلوين كل ثانية دون إعادة رسم كاملة */
function tick() {
  document.querySelectorAll('.order [data-since]').forEach((el) => {
    const since = el.dataset.since;
    if (!since) return;
    el.textContent = elapsed(since);
    const mins = minutesSince(since);
    const card = el.closest('.order');
    card.classList.toggle('late', mins >= lateMinutes);
    card.classList.toggle('warn', mins < lateMinutes && mins >= lateMinutes * 0.7);
  });
}

function renderShell(profile) {
  setHTML(root, html`
    <header class="topbar"><div class="topbar-in">
      <span class="brand">Mr Black<small>COFFEE & LOUNGE</small></span><b>المطبخ</b>
      <span class="conn" id="conn" title="الاتصال اللحظي"></span>
      <span class="spacer"></span>
      ${themeButtonTpl()}
      <button class="btn btn-sm" id="sound-btn" type="button">🔔 تفعيل الصوت</button>
      ${profile.role !== 'kitchen' ? html`<a class="btn btn-sm" href="casher.html">لوحة الكاشير</a>` : ''}
      <span class="user-chip">${profile.full_name} · ${ROLE_LABELS[profile.role]}</span>
      <button class="btn btn-sm btn-ghost" id="logout" type="button">خروج</button>
    </div></header>
    <main class="k-board" id="board"><div class="state" style="grid-column:1/-1"><div class="spinner"></div>جارٍ تحميل الطلبات…</div></main>`);

  $('#logout').onclick = () => signOut();
  const soundBtn = $('#sound-btn');
  soundBtn.onclick = () => {
    unlockAudio();
    setTimeout(() => {
      if (audioReady()) { soundBtn.textContent = '🔔 الصوت مفعّل'; soundBtn.classList.add('btn-gold'); beep(1); }
      else toast('تعذّر تفعيل الصوت في هذا المتصفح.', 'error');
    }, 100);
  };

  $('#board').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-to]');
    if (!btn) return;
    const id = Number(btn.closest('[data-id]').dataset.id);
    const to = btn.dataset.to;
    await withBusy(btn, async () => {
      try {
        await changeStatus(id, to);
        freshIds.delete(id);
        feed.patch(id, { status: to });
        if (to === 'ready') toast(`الطلب #${id} جاهز`, 'success');
      } catch (err) { toastError(err); }
    });
  });
}

staffGate({
  root,
  allowed: ['kitchen', 'manager', 'cashier'],
  title: '👨‍🍳 دخول المطبخ',
  onReady: async (profile) => {
    renderShell(profile);
    const { data: s } = await sb.from('settings').select('late_minutes').maybeSingle();
    if (s?.late_minutes) lateMinutes = s.late_minutes;

    feed = startOrdersFeed({
      mode: 'kitchen',
      onChange: (list, { newIds }) => {
        orders = list;
        newIds.forEach((id) => freshIds.add(id));
        if (newIds.length) {
          beep(3);
          toast(newIds.length > 1 ? `${newIds.length} طلبات جديدة` : `طلب جديد — ${orderPlace(list.find((o) => o.id === newIds[0]) || {})}`);
          if (!audioReady()) toast('فعّل الصوت من الزر أعلى الشاشة لسماع التنبيهات.', 'error');
          setTimeout(() => newIds.forEach((id) => freshIds.delete(id)), 6000);
        }
        render();
      },
      onConn: (s) => { const c = $('#conn'); if (c) c.className = `conn ${s}`; },
      onError: toastError,
    });
    setInterval(tick, 1000);
    mountAssistant(profile);
  },
});
