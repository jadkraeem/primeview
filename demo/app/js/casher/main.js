// =========================================================
// Mr Black — لوحة الكاشير والإدارة (القائمة الجانبية والتنقّل)
// =========================================================
import {
  sb, html, setHTML, $, $$, staffGate, signOut, setCurrency, unlockAudio, audioReady, beep,
  toast, toastError, ROLE_LABELS, themeButtonTpl,
} from '../common.js';
import { startOrdersFeed, orderPlace } from '../orders-feed.js';
import { mountAssistant } from '../assistant.js';
import * as dashboardTab from './dashboard.js';
import * as posTab from './pos.js';
import * as ordersTab from './orders.js';
import * as shiftsTab from './shifts.js';
import * as expensesTab from './expenses.js';
import * as menuTab from './menu-admin.js';
import * as inventoryTab from './inventory.js';
import * as tablesTab from './tables.js';
import * as offersTab from './offers.js';
import * as eventsTab from './events.js';
import * as reportsTab from './reports.js';
import * as stocktakeTab from './stocktake.js';
import * as staffTab from './staff.js';
import * as wifiTab from './wifi.js';
import * as settingsTab from './settings.js';

const M = ['manager'];
const MC = ['manager', 'cashier'];
const GROUPS = [
  { title: 'العمليات اليومية', tabs: [
    { key: 'dashboard', icon: '🏠', label: 'الرئيسية', mod: dashboardTab, roles: MC },
    { key: 'pos', icon: '🧾', label: 'نقطة البيع', mod: posTab, roles: MC },
    { key: 'orders', icon: '🔔', label: 'الطلبات', mod: ordersTab, roles: MC, badge: true },
    { key: 'shifts', icon: '💵', label: 'الوردية والصندوق', mod: shiftsTab, roles: MC },
  ] },
  { title: 'المالية', tabs: [
    { key: 'expenses', icon: '💸', label: 'المصاريف', mod: expensesTab, roles: MC },
    { key: 'reports', icon: '📊', label: 'التقارير والأرباح', mod: reportsTab, roles: M },
    { key: 'stocktake', icon: '📋', label: 'الجرد', mod: stocktakeTab, roles: M },
  ] },
  { title: 'المنيو والمحل', tabs: [
    { key: 'menu', icon: '☕', label: 'المنيو', mod: menuTab, roles: MC },
    { key: 'inventory', icon: '📦', label: 'المخزون', mod: inventoryTab, roles: M },
    { key: 'tables', icon: '🪑', label: 'الطاولات و QR', mod: tablesTab, roles: M },
    { key: 'offers', icon: '🏷️', label: 'العروض', mod: offersTab, roles: M },
    { key: 'events', icon: '🎉', label: 'الفعاليات', mod: eventsTab, roles: MC },
  ] },
  { title: 'النظام', tabs: [
    { key: 'staff', icon: '👥', label: 'الموظفون', mod: staffTab, roles: M },
    { key: 'wifi', icon: '📶', label: 'الشبكة', mod: wifiTab, roles: MC },
    { key: 'settings', icon: '⚙️', label: 'الإعدادات', mod: settingsTab, roles: M },
  ] },
];

const root = $('#app');

staffGate({
  root,
  allowed: ['manager', 'cashier'],
  title: 'تسجيل دخول الإدارة',
  onReady: async (profile) => {
    const ctx = {
      profile,
      isManager: profile.role === 'manager',
      settings: null,
      orders: [],
      ordersListeners: new Set(),
      async loadSettings() {
        const { data, error } = await sb.from('settings').select('*').maybeSingle();
        if (error) throw error;
        ctx.settings = data;
        setCurrency(data.currency);
        return data;
      },
      go: (key) => show(key),
    };
    try { await ctx.loadSettings(); } catch (e) { toastError(e); ctx.settings = { late_minutes: 15, currency: 'ل.س' }; }

    const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.roles.includes(profile.role)) }))
      .filter((g) => g.tabs.length);
    const tabs = groups.flatMap((g) => g.tabs);

    setHTML(root, html`
      <div class="shell">
        <aside class="sidebar" id="sidebar" aria-label="القائمة">
          <div class="side-brand"><span class="brand">Mr Black<small>COFFEE & LOUNGE</small></span></div>
          <nav class="side-nav">${groups.map((g) => html`
            <div class="side-group"><div class="side-title">${g.title}</div>
              ${g.tabs.map((t) => html`<button class="side-link" data-tab="${t.key}" type="button">
                <span class="side-ico" aria-hidden="true">${t.icon}</span><span>${t.label}</span>
                ${t.badge ? html`<span class="count hidden" id="new-count">0</span>` : ''}</button>`)}
            </div>`)}
          </nav>
          <div class="side-user">
            <div><b>${profile.full_name}</b><small>${ROLE_LABELS[profile.role]}</small></div>
            <button class="btn btn-sm btn-ghost" id="logout" type="button" title="تسجيل الخروج">خروج ⎋</button>
          </div>
        </aside>
        <div class="side-overlay" id="side-overlay"></div>

        <div class="main-area">
          <header class="topbar no-print"><div class="topbar-in">
            <button class="btn btn-sm burger" id="burger" type="button" aria-label="القائمة">☰</button>
            <h1 class="top-title" id="top-title"></h1>
            <span class="conn" id="conn" title="الاتصال اللحظي بالطلبات"></span>
            <span class="spacer"></span>
            <span class="shift-chip" id="shift-chip"></span>
            ${themeButtonTpl()}
            <button class="btn btn-sm" id="sound-btn" type="button">🔔 الصوت</button>
            <a class="btn btn-sm" href="kitchen.html">👨‍🍳 المطبخ</a>
          </div></header>
          <main class="page" id="tab-root"></main>
        </div>
      </div>`);

    $('#logout').onclick = () => signOut();
    const soundBtn = $('#sound-btn');
    soundBtn.onclick = () => {
      unlockAudio();
      setTimeout(() => {
        if (audioReady()) { soundBtn.textContent = '🔔 مفعّل'; soundBtn.classList.add('btn-gold'); beep(1); }
        else toast('تعذّر تفعيل الصوت في هذا المتصفح.', 'error');
      }, 100);
    };
    const sidebar = $('#sidebar');
    const closeSide = () => document.body.classList.remove('side-open');
    $('#burger').onclick = () => document.body.classList.toggle('side-open');
    $('#side-overlay').onclick = closeSide;

    // ---------- التنقّل مع حركة سلسة ----------
    const tabRoot = $('#tab-root');
    let current = null;
    function show(key) {
      const tab = tabs.find((t) => t.key === key) || tabs[0];
      if (current?.key === tab.key) { closeSide(); return; }
      if (current?.unmount) current.unmount();
      $$('.side-link', sidebar).forEach((b) => {
        const on = b.dataset.tab === tab.key;
        b.classList.toggle('on', on);
        b.setAttribute('aria-current', on ? 'page' : 'false');
      });
      $('#top-title').textContent = `${tab.icon} ${tab.label}`;
      const host = document.createElement('div');   // عنصر جديد لكل قسم (لا تتراكم الأحداث)
      host.className = 'tab-anim';
      tabRoot.replaceChildren(host);
      current = { key: tab.key, unmount: tab.mod.mount(host, ctx) };
      // الحركة عند الدخول فقط، وليس عند كل تحديث لحظي
      setTimeout(() => host.classList.remove('tab-anim'), 900);
      if (location.hash !== `#${tab.key}`) history.replaceState(null, '', `#${tab.key}`);
      closeSide();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    sidebar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) show(b.dataset.tab);
    });
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));

    // ---------- حالة الوردية في الأعلى ----------
    ctx.refreshShift = async () => {
      const { data } = await sb.rpc('shift_summary');
      ctx.shift = data || null;
      const chip = $('#shift-chip');
      if (!chip) return;
      chip.className = `shift-chip ${data ? 'open' : 'closed'}`;
      chip.textContent = data ? '● الوردية مفتوحة' : '○ لا توجد وردية';
      chip.onclick = () => show('shifts');
    };
    ctx.refreshShift();

    // ---------- الطلبات اللحظية (تعمل في كل الأقسام) ----------
    ctx.feed = startOrdersFeed({
      mode: 'till',
      onChange: (list, { newIds: allNew }) => {
        ctx.orders = list;
        // لا تنبيه على طلب أدخله الكاشير نفسه من نقطة البيع
        const newIds = allNew.filter((id) => list.find((o) => o.id === id)?.created_by !== profile.id);
        const n = list.filter((o) => o.status === 'new').length;
        const badge = $('#new-count');
        if (badge) { badge.textContent = n; badge.classList.toggle('hidden', n === 0); }
        document.title = n ? `(${n}) Mr Black — الكاشير` : 'Mr Black — الكاشير والإدارة';
        if (newIds.length) {
          beep(3);
          const t = list.find((o) => o.id === newIds[0]);
          toast(newIds.length > 1 ? `${newIds.length} طلبات جديدة` : `طلب جديد #${newIds[0]} — ${t ? orderPlace(t) : ''}`);
          if (!audioReady()) toast('فعّل الصوت من زر 🔔 أعلى الشاشة لسماع التنبيهات.', 'error');
        }
        ctx.ordersListeners.forEach((fn) => fn(list, allNew));
      },
      onConn: (s) => { const c = $('#conn'); if (c) c.className = `conn ${s}`; },
      onError: toastError,
    });

    show(location.hash.slice(1) || 'dashboard');
    mountAssistant(profile);
  },
});
