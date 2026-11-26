/* =========================================================
   PrimeView — قاعدة بيانات وهمية للنسخة التجريبية من نظام الكافيه
   ---------------------------------------------------------
   تحلّ محلّ مكتبة Supabase في صفحات النسخة التجريبية فقط.
   - كل البيانات محفوظة في متصفح الزائر (localStorage) ولا تُرسل لأي سيرفر.
   - الصفحات المفتوحة في نفس المتصفح تتحدّث لحظياً (BroadcastChannel).
   - نفس قواعد السيرفر الحقيقي: التسعير، المخزون، الورديات، الصلاحيات، رسائل الخطأ.
   ملفات النظام الأصلية تبقى كما هي؛ هذا الملف وحده يجعلها تعمل بدون سيرفر.
   ========================================================= */
(function () {
  'use strict';

  const DB_KEY = 'pv-demo-db-v1';
  const SESSION_PREFIX = 'pv-demo-session:';
  const DEMO_IP = '203.0.113.25';
  const PASSWORD = 'demo1234';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('pv-demo') : null;

  const USERS = {
    'manager@demo.cafe': { id: 'd0000000-0000-4000-8000-000000000001', role: 'manager', full_name: 'سامر (مدير)' },
    'cashier@demo.cafe': { id: 'd0000000-0000-4000-8000-000000000002', role: 'cashier', full_name: 'لين (كاشير)' },
    'kitchen@demo.cafe': { id: 'd0000000-0000-4000-8000-000000000003', role: 'kitchen', full_name: 'أبو علي (مطبخ)' },
  };
  const ROLE_EMAIL = { manager: 'manager@demo.cafe', cashier: 'cashier@demo.cafe', kitchen: 'kitchen@demo.cafe' };

  const STATUS_ORDER = ['new', 'preparing', 'ready', 'served', 'cancelled'];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowISO = () => new Date().toISOString();
  const err = (message, code) => Object.assign(new Error(message), { code: code || 'P0001' });

  // =========================================================
  // البيانات الأولية: منيو Mr Black الحقيقي + أسبوع من الطلبات الوهمية
  // =========================================================
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seed() {
    const R = rng(20261126);
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const db = {
      seq: {},
      settings: [{
        id: 1, cafe_name: 'Mr Black', currency: 'ل.س', tax_percent: 0, service_percent: 0, late_minutes: 15,
        timezone: 'Asia/Damascus', tagline: 'أكثر من مجرد قهوة..', about: 'نسخة تجريبية من نظام PrimeView للمقاهي. جرّب الطلب والكاشير والمطبخ بحرية.',
        address: 'دمشق — عنوان تجريبي', phone: null, opening_hours: 'يومياً 8 صباحاً – 12 ليلاً',
        wifi_lock: false, allowed_networks: [], updated_at: nowISO(),
      }],
      profiles: Object.entries(USERS).map(([email, u], i) => ({
        id: u.id, full_name: u.full_name, role: u.role, active: true, email,
        created_at: new Date(Date.now() - (30 - i) * 864e5).toISOString(),
      })),
      categories: [
        { id: 1, name: 'قهوة ساخنة', sort: 1, active: true },
        { id: 2, name: 'مشروبات باردة', sort: 2, active: true },
        { id: 3, name: 'حلويات', sort: 3, active: true },
        { id: 4, name: 'مأكولات خفيفة', sort: 4, active: true },
      ],
      menu_items: [], cafe_tables: [], offers: [], events: [], orders: [], order_items: [],
      stock_movements: [], shifts: [], expenses: [],
    };
    db.categories.forEach((c) => { c.created_at = nowISO(); });
    const items = [
      [1, 'إسبريسو', 'Espresso', 'شوت مركّز من بن محمّص طازج', 15000, 1],
      [1, 'إسبريسو مزدوج', 'Double Espresso', 'شوتين لمحبي القهوة القوية', 20000, 2],
      [1, 'أمريكانو', 'Americano', 'إسبريسو مع ماء ساخن', 18000, 3],
      [1, 'كابتشينو', 'Cappuccino', 'إسبريسو وحليب مخفوق برغوة كثيفة', 25000, 4],
      [1, 'لاتيه', 'Latte', 'إسبريسو مع حليب ناعم', 25000, 5],
      [1, 'قهوة عربية', 'Arabic Coffee', 'بالهيل، دلّة صغيرة', 20000, 6],
      [2, 'آيس لاتيه', 'Iced Latte', 'إسبريسو وحليب بارد على الثلج', 28000, 1],
      [2, 'آيس أمريكانو', 'Iced Americano', 'منعش وخفيف', 22000, 2],
      [2, 'موهيتو ليمون', 'Lemon Mojito', 'ليمون ونعنع وصودا', 25000, 3],
      [2, 'عصير برتقال', 'Fresh Orange Juice', 'طبيعي معصور عند الطلب', 22000, 4, { available: false }],
      [3, 'تشيز كيك', 'Cheesecake', 'بصوص التوت الأحمر', 35000, 1, { track_stock: true, stock_qty: 0 }],
      [3, 'براوني', 'Brownie', 'شوكولا داكنة، يقدّم دافئاً', 30000, 2, { track_stock: true, stock_qty: 20 }],
      [3, 'كرواسون شوكولا', 'Chocolate Croissant', 'زبدة فرنسية وحشوة شوكولا', 20000, 3, { track_stock: true, stock_qty: 16 }],
      [4, 'ساندويش حلّومي', 'Halloumi Sandwich', 'جبنة حلّومي مشوية وخضار', 35000, 1, { track_stock: true, stock_qty: 4 }],
      [4, 'ساندويش دجاج', 'Chicken Sandwich', 'صدر دجاج مشوي مع صوص خاص', 40000, 2, { track_stock: true, stock_qty: 12 }],
    ];
    items.forEach(([cat, name, en, desc, price, sort, extra], i) => {
      db.menu_items.push(Object.assign({
        id: i + 1, category_id: cat, name, name_en: en, description: desc, price, image_url: null,
        available: true, track_stock: false, stock_qty: 0, low_stock_threshold: 5, sort,
        created_at: nowISO(), updated_at: nowISO(),
      }, extra || {}));
    });
    for (let n = 1; n <= 12; n++) db.cafe_tables.push({ id: n, number: n, label: n > 10 ? 'تراس' : null, active: true, created_at: nowISO() });
    db.offers.push(
      { id: 1, title: 'خصم 10% على كل الحلويات', description: 'طوال الأسبوع', discount_type: 'percent', discount_value: 10, item_id: null, category_id: 3, starts_at: null, ends_at: null, active: true, created_at: nowISO() },
      { id: 2, title: 'آيس لاتيه بسعر خاص', description: 'وفّر 3,000 على كل كوب', discount_type: 'fixed', discount_value: 3000, item_id: 7, category_id: null, starts_at: null, ends_at: null, active: true, created_at: nowISO() },
    );
    const day = 864e5;
    db.events.push(
      { id: 1, title: 'أمسية موسيقية', description: 'عود وغناء طربي كل خميس من 8 مساءً', starts_at: null, ends_at: null, active: true, created_at: nowISO() },
      { id: 2, title: 'نقل مباشر للمباراة', description: 'على الشاشة الكبيرة — احجز طاولتك', starts_at: new Date(Date.now() + 2 * day).toISOString(), ends_at: new Date(Date.now() + 2 * day + 3 * 36e5).toISOString(), active: true, created_at: nowISO() },
    );
    db.seq = { categories: 4, menu_items: items.length, cafe_tables: 12, offers: 2, events: 2, orders: 0, order_items: 0, stock_movements: 0, shifts: 0, expenses: 0 };

    // ---------- أسبوع من الطلبات المدفوعة + ورديات + مصاريف ----------
    const sellable = db.menu_items.filter((m) => m.available);
    const sold = {};
    const mgr = USERS['manager@demo.cafe'].id;
    const csh = USERS['cashier@demo.cafe'].id;
    const at = (daysAgo, h, m) => { const d = new Date(Date.now() - daysAgo * day); d.setHours(h, m, 0, 0); return d; };
    const addOrder = (created, shiftId, opts = {}) => {
      const lines = [];
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const it = pick(sellable);
        const qty = 1 + (R() < 0.25 ? 1 : 0);
        if (lines.some((l) => l.item_id === it.id)) continue;
        lines.push({ item_id: it.id, item_name: it.name, category_name: db.categories.find((c) => c.id === it.category_id).name, unit_price: it.price, unit_discount: 0, qty, note: null, line_total: it.price * qty });
      }
      const sub = lines.reduce((s, l) => s + l.line_total, 0);
      const takeaway = R() < 0.15;
      const tableNo = takeaway ? null : 1 + Math.floor(R() * 12);
      const id = ++db.seq.orders;
      const t = created.getTime();
      const st = opts.status || 'served';
      const o = {
        id, table_id: tableNo, table_number: tableNo, order_type: takeaway ? 'takeaway' : 'table', created_by: takeaway ? csh : null,
        status: st, subtotal: sub, discount: 0, service: 0, tax: 0, total: sub, service_percent: 0, tax_percent: 0,
        created_at: created.toISOString(),
        started_at: ['preparing', 'ready', 'served'].includes(st) ? new Date(t + (1 + R() * 2) * 6e4).toISOString() : null,
        ready_at: ['ready', 'served'].includes(st) ? new Date(t + (5 + R() * 7) * 6e4).toISOString() : null,
        served_at: st === 'served' ? new Date(t + (9 + R() * 6) * 6e4).toISOString() : null,
        cancelled_at: st === 'cancelled' ? new Date(t + 3 * 6e4).toISOString() : null,
        updated_by: csh, paid_at: null, payment_method: null, amount_received: null, change_due: null, paid_by: null, shift_id: null,
      };
      if (opts.paid) {
        const cash = R() < 0.7;
        const recv = cash ? Math.ceil(sub / 50000) * 50000 : sub;
        Object.assign(o, { paid_at: new Date(t + (12 + R() * 20) * 6e4).toISOString(), payment_method: cash ? 'cash' : 'card', amount_received: recv, change_due: recv - sub, paid_by: csh, shift_id: shiftId });
      }
      db.orders.push(o);
      lines.forEach((l) => {
        db.order_items.push(Object.assign({ id: ++db.seq.order_items, order_id: id }, l));
        const mi = db.menu_items.find((m) => m.id === l.item_id);
        if (mi.track_stock && st !== 'cancelled') {
          sold[mi.id] = (sold[mi.id] || 0) + l.qty;
          db.stock_movements.push({ id: 0, item_id: mi.id, change: -l.qty, reason: 'sale', note: null, order_id: id, created_by: o.created_by, created_at: o.created_at });
        }
      });
      return o;
    };
    const expenseCats = [['supplies', 'حليب وبن وسكر', 180000], ['utilities', 'فاتورة كهرباء', 90000], ['maintenance', 'صيانة ماكينة القهوة', 120000], ['marketing', 'إعلان إنستغرام', 60000], ['other', 'مستلزمات تنظيف', 35000]];

    for (let d = 7; d >= 0; d--) {
      const sid = ++db.seq.shifts;
      const opened = at(d, 8, 30);
      const shift = { id: sid, status: d === 0 ? 'open' : 'closed', opened_by: csh, opened_at: opened.toISOString(), opening_cash: 100000, closed_by: null, closed_at: null, expected_cash: null, counted_cash: null, difference: null, note: null };
      db.shifts.push(shift);
      const isToday = d === 0;
      const nowH = new Date().getHours();
      const lastHour = isToday ? Math.max(9, Math.min(22, nowH - 1)) : 22;
      const count = isToday ? Math.min(6, Math.max(2, lastHour - 8)) : 10 + Math.floor(R() * 9);
      const times = [];
      for (let k = 0; k < count; k++) times.push(at(d, 9 + Math.floor(R() * Math.max(1, lastHour - 9)), Math.floor(R() * 60)));
      times.sort((a, b) => a - b);
      times.forEach((tm) => {
        if (isToday && tm > Date.now() - 40 * 6e4) return;
        const cancel = !isToday && R() < 0.06;
        addOrder(tm, sid, cancel ? { status: 'cancelled' } : { paid: true });
      });
      if (R() < 0.75 || d === 3) {
        const [cat, desc, amt] = d === 3 ? ['salaries', 'رواتب الأسبوع', 600000] : pick(expenseCats);
        const fromDrawer = cat === 'supplies' || cat === 'other';
        const when = new Date(Math.min(at(d, 12, 15).getTime(), Date.now() - 36e5)).toISOString();
        db.expenses.push({ id: ++db.seq.expenses, category: cat, description: desc, amount: amt, from_drawer: fromDrawer, shift_id: fromDrawer ? sid : null, spent_at: when, created_by: mgr, created_at: when });
      }
      if (!isToday) {
        const cashSales = db.orders.filter((o) => o.shift_id === sid && o.payment_method === 'cash').reduce((s, o) => s + o.total, 0);
        const cashExp = db.expenses.filter((e) => e.shift_id === sid && e.from_drawer).reduce((s, e) => s + e.amount, 0);
        const expected = 100000 + cashSales - cashExp;
        const counted = d === 4 ? expected - 5000 : expected;
        Object.assign(shift, { closed_by: csh, closed_at: at(d, 23, 5).toISOString(), expected_cash: expected, counted_cash: counted, difference: counted - expected, note: d === 4 ? 'نقص بسيط في الفكة' : null });
      }
    }
    // طلبات مفتوحة الآن حتى تكون شاشة المطبخ والكاشير حيّة من أول لحظة
    const mins = (m) => new Date(Date.now() - m * 6e4);
    addOrder(mins(14), null, { status: 'ready' });
    addOrder(mins(7), null, { status: 'preparing' });
    addOrder(mins(26), null, { status: 'served' });

    // رصيد المخزون الافتتاحي قبل أسبوع = الرصيد الحالي + ما بيع
    db.menu_items.filter((m) => m.track_stock).forEach((m) => {
      const opening = m.stock_qty + (sold[m.id] || 0);
      if (opening > 0) db.stock_movements.push({ id: 0, item_id: m.id, change: opening, reason: 'restock', note: 'رصيد افتتاحي', order_id: null, created_by: mgr, created_at: at(8, 9, 0).toISOString() });
    });
    db.stock_movements.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((s) => { s.id = ++db.seq.stock_movements; });
    return db;
  }

  // =========================================================
  // التخزين والتحديث اللحظي
  // =========================================================
  let cache = null;
  function load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) { cache = JSON.parse(raw); return cache; }
    } catch (e) { /* نبدأ من جديد */ }
    cache = seed();
    persist(cache);
    return cache;
  }
  function persist(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* المتصفح يمنع التخزين: نكمل بالذاكرة */ }
  }
  function commit(db, events) {
    persist(db);
    cache = db;
    (events || []).forEach((ev) => { dispatch(ev); bc?.postMessage(ev); });
  }
  bc?.addEventListener('message', (m) => { cache = null; dispatch(m.data); });
  addEventListener('storage', (e) => { if (e.key === DB_KEY) cache = null; });
  const db0 = () => { cache = null; return load(); };   // قراءة حديثة دائماً (قد تكون صفحة أخرى غيّرت البيانات)

  const channels = new Set();
  function dispatch(ev) {
    channels.forEach((ch) => ch._deliver(ev));
  }
  const MENU_TABLES = ['categories', 'offers', 'events', 'settings', 'menu_items'];
  const menuSignal = (table) => ({ kind: 'broadcast', topic: 'menu-updates', event: 'changed', payload: { table } });

  // =========================================================
  // الجلسة وتسجيل الدخول (لكل صفحة جلستها: الكاشير والمطبخ معاً بنفس المتصفح)
  // =========================================================
  const page = (location.pathname.split('/').pop() || 'index.html').replace(/\W/g, '_');
  const SESSION_KEY = SESSION_PREFIX + page;
  const authListeners = new Set();
  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function makeSession(email) {
    const u = USERS[email];
    return { access_token: 'demo-' + u.id, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'demo', user: { id: u.id, email, role: 'authenticated', aud: 'authenticated' } };
  }
  function writeSession(s) {
    try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* تجاهل */ }
  }
  // ?as=manager يفتح الصفحة مسجّلاً مباشرة (من صفحة التجربة)
  (function autoLogin() {
    const as = new URLSearchParams(location.search).get('as');
    if (as && ROLE_EMAIL[as]) writeSession(makeSession(ROLE_EMAIL[as]));
  })();
  function me() {
    const s = readSession();
    if (!s) return { uid: null, role: null };
    const p = load().profiles.find((x) => x.id === s.user.id && x.active);
    return { uid: s.user.id, role: p ? p.role : null };
  }

  const auth = {
    onAuthStateChange(cb) {
      authListeners.add(cb);
      setTimeout(() => cb('INITIAL_SESSION', readSession()), 0);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
    },
    async getSession() { return { data: { session: readSession() }, error: null }; },
    async getUser() { const s = readSession(); return { data: { user: s ? s.user : null }, error: null }; },
    async signInWithPassword({ email, password }) {
      await delay(350);
      const e = String(email || '').toLowerCase().trim();
      if (!USERS[e] || password !== PASSWORD) return { data: { session: null }, error: Object.assign(new Error('Invalid login credentials'), { status: 400 }) };
      const s = makeSession(e);
      writeSession(s);
      authListeners.forEach((cb) => setTimeout(() => cb('SIGNED_IN', s), 0));
      return { data: { session: s, user: s.user }, error: null };
    },
    async signOut() {
      writeSession(null);
      authListeners.forEach((cb) => setTimeout(() => cb('SIGNED_OUT', null), 0));
      return { error: null };
    },
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // =========================================================
  // الصلاحيات (نفس سياسات RLS في النظام الحقيقي)
  // =========================================================
  function networkOk(db) {
    const s = db.settings[0];
    if (!s.wifi_lock) return true;
    return (s.allowed_networks || []).some((n) => cidrMatch(DEMO_IP, n));
  }
  function cidrMatch(ip, cidr) {
    const [net, bits] = String(cidr).split('/');
    const toInt = (x) => x.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(net || '')) return false;
    const m = bits === undefined ? 32 : Number(bits);
    const mask = m === 0 ? 0 : (~0 << (32 - m)) >>> 0;
    return (toInt(ip) & mask) === (toInt(net) & mask);
  }
  const isStaff = (r) => !!r;
  const till = (r) => r === 'manager' || r === 'cashier';

  function canRead(db, table, row, ctx) {
    const r = ctx.role;
    if (!r) {
      const cat = (id) => (db.categories.find((c) => c.id === id) || {}).active;
      const t = Date.now();
      switch (table) {
        case 'categories': return row.active;
        case 'menu_items': return cat(row.category_id) && networkOk(db);
        case 'offers': return row.active && (!row.starts_at || Date.parse(row.starts_at) <= t) && (!row.ends_at || Date.parse(row.ends_at) > t);
        case 'events': return row.active && (!row.ends_at || Date.parse(row.ends_at) > t) && networkOk(db);
        default: return false;
      }
    }
    switch (table) {
      case 'profiles': return row.id === ctx.uid || r === 'manager';
      case 'shifts': case 'expenses': return till(r);
      case 'stock_movements': return r === 'manager';
      default: return isStaff(r);
    }
  }
  function canWrite(table, op, ctx) {
    const r = ctx.role;
    switch (table) {
      case 'categories': case 'menu_items': case 'cafe_tables': case 'offers': return r === 'manager';
      case 'settings': return op === 'update' && r === 'manager';
      case 'profiles': return (op === 'update' || op === 'delete') && r === 'manager';
      case 'events': return till(r);
      case 'expenses': return (op === 'update' || op === 'delete') && r === 'manager';
      default: return false;
    }
  }
  const denied = (table) => err(`permission denied for table ${table}`, '42501');

  // أعمدة محسوبة
  function decorate(table, row) {
    if (table === 'menu_items') row.sold_out = !row.available || (row.track_stock && row.stock_qty <= 0);
    return row;
  }

  // =========================================================
  // محرّك الاستعلامات (يحاكي واجهة supabase-js)
  // =========================================================
  const RELS = {
    orders: { order_items: { many: true, table: 'order_items', fk: 'order_id' } },
    menu_items: { categories: { many: false, table: 'categories', fk: 'category_id' } },
    stock_movements: { menu_items: { many: false, table: 'menu_items', fk: 'item_id' } },
  };

  function splitTop(s) {
    const out = []; let depth = 0; let cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function parseSelect(s) {
    return splitTop(s || '*').map((tok) => {
      const m = tok.match(/^([a-z_]+)\((.*)\)$/s);
      return m ? { rel: m[1], cols: parseSelect(m[2]) } : { col: tok };
    });
  }
  function project(db, table, row, spec, ctx) {
    const out = {};
    spec.forEach((f) => {
      if (f.col === '*') Object.assign(out, row);
      else if (f.col) out[f.col] = row[f.col] === undefined ? null : row[f.col];
      else {
        const rel = (RELS[table] || {})[f.rel];
        if (!rel) throw err(`Could not find a relationship between '${table}' and '${f.rel}'`, 'PGRST200');
        if (rel.many) {
          out[f.rel] = db[rel.table].filter((x) => x[rel.fk] === row.id && canRead(db, rel.table, x, ctx))
            .sort((a, b) => a.id - b.id).map((x) => project(db, rel.table, decorate(rel.table, clone(x)), f.cols, ctx));
        } else {
          const p = db[rel.table].find((x) => x.id === row[rel.fk]);
          out[f.rel] = p && canRead(db, rel.table, p, ctx) ? project(db, rel.table, decorate(rel.table, clone(p)), f.cols, ctx) : null;
        }
      }
    });
    return out;
  }

  const cmpVal = (a, b) => {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    const iso = /^\d{4}-\d\d-\d\dT/;
    if (typeof a === 'string' && typeof b === 'string' && iso.test(a) && iso.test(b)) return Date.parse(a) - Date.parse(b);
    if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
    return String(a).localeCompare(String(b));
  };
  const coerce = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

  // فلاتر or(): "status.in.(new,preparing),and(status.eq.served,paid_at.is.null)"
  function parseCond(expr) {
    const m = expr.match(/^(and|or)\((.*)\)$/s);
    if (m) {
      const parts = splitTop(m[2]).map(parseCond);
      return m[1] === 'and' ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
    }
    const [col, op, ...rest] = expr.split('.');
    const val = rest.join('.');
    switch (op) {
      case 'eq': return (r) => cmpVal(r[col], coerce(val)) === 0;
      case 'neq': return (r) => cmpVal(r[col], coerce(val)) !== 0;
      case 'gt': return (r) => r[col] != null && cmpVal(r[col], coerce(val)) > 0;
      case 'gte': return (r) => r[col] != null && cmpVal(r[col], coerce(val)) >= 0;
      case 'lt': return (r) => r[col] != null && cmpVal(r[col], coerce(val)) < 0;
      case 'lte': return (r) => r[col] != null && cmpVal(r[col], coerce(val)) <= 0;
      case 'is': return (r) => (val === 'null' ? r[col] == null : r[col] === coerce(val));
      case 'in': { const list = val.replace(/^\(|\)$/g, '').split(',').map(coerce); return (r) => list.some((x) => cmpVal(r[col], x) === 0); }
      default: throw err(`unsupported filter ${op}`, 'PGRST100');
    }
  }

  const DEFAULTS = {
    categories: () => ({ sort: 0, active: true, created_at: nowISO() }),
    menu_items: () => ({ description: null, image_url: null, name_en: null, available: true, track_stock: false, stock_qty: 0, low_stock_threshold: 5, sort: 0, created_at: nowISO(), updated_at: nowISO() }),
    cafe_tables: () => ({ label: null, active: true, created_at: nowISO() }),
    offers: () => ({ description: null, item_id: null, category_id: null, starts_at: null, ends_at: null, active: true, created_at: nowISO() }),
    events: () => ({ description: null, starts_at: null, ends_at: null, active: true, created_at: nowISO() }),
  };

  function validate(db, table, row, op) {
    const txt = (v, max, req) => (req && (!v || !String(v).trim())) || (v != null && String(v).length > max);
    const bad = () => err('new row violates check constraint', '23514');
    if (table === 'categories' && txt(row.name, 60, true)) throw bad();
    if (table === 'menu_items') {
      if (txt(row.name, 80, true) || !(row.price >= 0 && row.price <= 1e8)) throw bad();
      if (!db.categories.some((c) => c.id === Number(row.category_id))) throw err('foreign key violation', '23503');
      if (row.stock_qty < 0) throw bad();
    }
    if (table === 'cafe_tables') {
      if (!(row.number >= 1 && row.number <= 999)) throw bad();
      if (db.cafe_tables.some((t) => t.number === Number(row.number) && t.id !== row.id)) throw err('duplicate key value', '23505');
    }
    if (table === 'offers') {
      if (txt(row.title, 80, true)) throw bad();
      if (row.item_id && row.category_id) throw bad();
      if (row.discount_type === 'percent' && !(row.discount_value > 0 && row.discount_value <= 100)) throw bad();
      if (row.discount_type === 'fixed' && !(row.discount_value > 0)) throw bad();
      if (row.starts_at && row.ends_at && Date.parse(row.ends_at) <= Date.parse(row.starts_at)) throw bad();
    }
    if (table === 'events') {
      if (txt(row.title, 80, true)) throw bad();
      if (row.starts_at && row.ends_at && Date.parse(row.ends_at) <= Date.parse(row.starts_at)) throw bad();
    }
    if (table === 'expenses' && !(row.amount > 0)) throw bad();
    if (table === 'settings') {
      if (txt(row.cafe_name, 60, true) || txt(row.currency, 10, true)) throw bad();
      if (!(row.tax_percent >= 0 && row.tax_percent <= 100) || !(row.service_percent >= 0 && row.service_percent <= 100)) throw bad();
    }
    if (table === 'profiles' && op === 'update') {
      const others = db.profiles.filter((p) => p.id !== row.id && p.role === 'manager' && p.active);
      if (!others.length && (row.role !== 'manager' || !row.active) && db.profiles.find((p) => p.id === row.id).role === 'manager') {
        throw err('لا يمكن إزالة أو تعطيل آخر مدير نشط في النظام.');
      }
    }
  }

  class Query {
    constructor(table) {
      this.t = table; this.op = 'select'; this.cols = '*'; this.filters = []; this.orders = []; this.lim = null;
      this.one = null; this.returning = false; this.vals = null;
    }
    select(cols) { if (this.op === 'select') this.cols = cols || '*'; else { this.returning = true; this.cols = cols || '*'; } return this; }
    insert(v) { this.op = 'insert'; this.vals = Array.isArray(v) ? v : [v]; return this; }
    upsert(v) { this.op = 'upsert'; this.vals = Array.isArray(v) ? v : [v]; return this; }
    update(v) { this.op = 'update'; this.vals = v; return this; }
    delete() { this.op = 'delete'; return this; }
    _f(fn) { this.filters.push(fn); return this; }
    eq(c, v) { return this._f((r) => cmpVal(r[c], v) === 0); }
    neq(c, v) { return this._f((r) => cmpVal(r[c], v) !== 0); }
    gt(c, v) { return this._f((r) => r[c] != null && cmpVal(r[c], v) > 0); }
    gte(c, v) { return this._f((r) => r[c] != null && cmpVal(r[c], v) >= 0); }
    lt(c, v) { return this._f((r) => r[c] != null && cmpVal(r[c], v) < 0); }
    lte(c, v) { return this._f((r) => r[c] != null && cmpVal(r[c], v) <= 0); }
    is(c, v) { return this._f((r) => (v === null ? r[c] == null : r[c] === v)); }
    in(c, list) { return this._f((r) => list.some((x) => cmpVal(r[c], x) === 0)); }
    or(expr) { const fn = parseCond(`or(${expr})`); return this._f(fn); }
    match(obj) { Object.entries(obj).forEach(([k, v]) => this.eq(k, v)); return this; }
    order(col, o = {}) { const asc = o.ascending !== false; this.orders.push({ col, asc, nullsFirst: o.nullsFirst ?? !asc }); return this; }
    limit(n) { this.lim = n; return this; }
    range(a, b) { this.off = a; this.lim = b - a + 1; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    then(res, rej) { return this._run().then(res, rej); }

    async _run() {
      await delay(40 + Math.random() * 80);
      try {
        const data = this._exec();
        return { data, error: null, count: null, status: 200, statusText: 'OK' };
      } catch (e) {
        return { data: null, error: { message: e.message, code: e.code || 'P0001', details: null, hint: null }, count: null, status: 400 };
      }
    }
    _exec() {
      const db = db0();
      const ctx = me();
      const T = this.t;
      if (!db[T]) throw err(`relation "public.${T}" does not exist`, '42P01');
      const spec = parseSelect(this.cols);
      const match = (r) => this.filters.every((f) => f(r));
      const finish = (rows) => {
        if (this.one) {
          if (rows.length > 1) throw err('JSON object requested, multiple (or no) rows returned', 'PGRST116');
          if (!rows.length) { if (this.one === 'single') throw err('JSON object requested, multiple (or no) rows returned', 'PGRST116'); return null; }
          return rows[0];
        }
        return rows;
      };

      if (this.op === 'select') {
        let rows = db[T].map((r) => decorate(T, clone(r))).filter((r) => canRead(db, T, r, ctx)).filter(match);
        if (this.orders.length) {
          rows.sort((a, b) => {
            for (const o of this.orders) {
              const av = a[o.col], bv = b[o.col];
              if (av == null && bv == null) continue;
              if (av == null) return o.nullsFirst ? -1 : 1;
              if (bv == null) return o.nullsFirst ? 1 : -1;
              const c = cmpVal(av, bv);
              if (c) return o.asc ? c : -c;
            }
            return 0;
          });
        }
        if (this.off) rows = rows.slice(this.off);
        if (this.lim != null) rows = rows.slice(0, this.lim);
        return finish(rows.map((r) => project(db, T, r, spec, ctx)));
      }

      if (!canWrite(T, this.op, ctx)) throw denied(T);
      const events = [];
      let changed = [];

      if (this.op === 'insert' || this.op === 'upsert') {
        this.vals.forEach((v) => {
          const row = Object.assign((DEFAULTS[T] || (() => ({})))(), clone(v));
          if (row.category_id != null) row.category_id = Number(row.category_id);
          if (row.item_id != null) row.item_id = Number(row.item_id);
          row.id = ++db.seq[T];
          validate(db, T, row, 'insert');
          db[T].push(row);
          changed.push(row);
          events.push({ kind: 'pg', table: T, event: 'INSERT', new: clone(row) });
        });
      } else if (this.op === 'update') {
        const vals = clone(this.vals);
        delete vals.id; delete vals.sold_out;
        db[T].filter((r) => canRead(db, T, decorate(T, clone(r)), ctx)).filter((r) => match(decorate(T, clone(r)))).forEach((r) => {
          const next = Object.assign(clone(r), vals);
          if (T === 'menu_items' || T === 'settings') next.updated_at = nowISO();
          if (next.category_id != null) next.category_id = Number(next.category_id);
          validate(db, T, next, 'update');
          Object.assign(r, next);
          changed.push(r);
          events.push({ kind: 'pg', table: T, event: 'UPDATE', new: clone(r) });
        });
      } else if (this.op === 'delete') {
        const victims = db[T].filter((r) => canRead(db, T, decorate(T, clone(r)), ctx)).filter((r) => match(decorate(T, clone(r))));
        victims.forEach((r) => {
          if (T === 'categories' && db.menu_items.some((m) => m.category_id === r.id)) throw err('foreign key violation', '23503');
          if (T === 'cafe_tables' && db.orders.some((o) => o.table_id === r.id)) throw err('foreign key violation', '23503');
          if (T === 'profiles' && r.id === ctx.uid) throw denied(T);
        });
        victims.forEach((r) => {
          if (T === 'menu_items') {
            db.offers = db.offers.filter((o) => o.item_id !== r.id);
            db.stock_movements = db.stock_movements.filter((s) => s.item_id !== r.id);
            db.order_items.forEach((oi) => { if (oi.item_id === r.id) oi.item_id = null; });
          }
          if (T === 'categories') db.offers = db.offers.filter((o) => o.category_id !== r.id);
          db[T] = db[T].filter((x) => x !== r);
          changed.push(r);
          events.push({ kind: 'pg', table: T, event: 'DELETE', old: { id: r.id } });
        });
      }
      if (MENU_TABLES.includes(T) && changed.length) events.push(menuSignal(T));
      commit(db, events);
      if (!this.returning) return null;
      return finish(changed.map((r) => project(db, T, decorate(T, clone(r)), spec, ctx)));
    }
  }

  // =========================================================
  // دوال السيرفر (RPC) — نسخة طبق الأصل من منطق قاعدة البيانات
  // =========================================================
  const need = (cond, msg, code) => { if (!cond) throw err(msg, code); };
  const requireTill = (ctx) => need(till(ctx.role), 'هذه العملية للمدير أو الكاشير فقط.', '42501');
  const currentShift = (db) => (db.shifts.find((s) => s.status === 'open') || {}).id || null;

  function unitDiscount(db, item) {
    const t = Date.now();
    let best = 0;
    db.offers.forEach((o) => {
      if (!o.active || o.discount_type === 'none') return;
      if (o.starts_at && Date.parse(o.starts_at) > t) return;
      if (o.ends_at && Date.parse(o.ends_at) <= t) return;
      if (!(o.item_id === item.id || o.category_id === item.category_id || (o.item_id == null && o.category_id == null))) return;
      const d = o.discount_type === 'percent' ? Math.round(item.price * o.discount_value / 100) : Math.round(o.discount_value);
      best = Math.max(best, Math.min(item.price, d));
    });
    return best;
  }

  function priceLines(db, items) {
    need(Array.isArray(items), 'بيانات السلة غير صالحة.');
    need(items.length > 0, 'السلة فارغة. أضف صنفاً واحداً على الأقل.');
    need(items.length <= 30, 'عدد الأسطر في الطلب كبير جداً (الحد الأقصى 30).');
    const out = items.map((l) => {
      need(l && typeof l === 'object' && /^[0-9]{1,15}$/.test(String(l.item_id)) && /^[0-9]{1,3}$/.test(String(l.qty)), 'بيانات السلة غير صالحة.');
      need(l.note == null || typeof l.note === 'string', 'بيانات السلة غير صالحة.');
      const qty = Number(l.qty);
      const note = l.note && l.note.trim() ? l.note.trim() : null;
      need(qty >= 1 && qty <= 50, 'الكمية يجب أن تكون بين 1 و 50.');
      need(!note || note.length <= 200, 'الملاحظة طويلة جداً (الحد الأقصى 200 حرف).');
      const mi = db.menu_items.find((m) => m.id === Number(l.item_id));
      need(mi, 'أحد الأصناف في سلتك لم يعد موجوداً في المنيو. حدّث الصفحة.');
      const cat = db.categories.find((c) => c.id === mi.category_id);
      need(mi.available && cat && cat.active, `الصنف "${mi.name}" غير متوفر حالياً.`);
      const disc = unitDiscount(db, mi);
      return { item_id: mi.id, item_name: mi.name, category_name: cat.name, unit_price: mi.price, unit_discount: disc, qty, note, line_total: (mi.price - disc) * qty };
    });
    const sums = {};
    out.forEach((l) => { sums[l.item_id] = (sums[l.item_id] || 0) + l.qty; });
    Object.entries(sums).forEach(([id, q]) => {
      const mi = db.menu_items.find((m) => m.id === Number(id));
      need(!(mi.track_stock && mi.stock_qty < q), `الكمية المطلوبة من "${mi.name}" غير متوفرة في المخزون حالياً.`);
    });
    return out;
  }

  function orderTotals(db, lines) {
    const s = db.settings[0];
    const sub = lines.reduce((a, l) => a + l.unit_price * l.qty, 0);
    const disc = lines.reduce((a, l) => a + l.unit_discount * l.qty, 0);
    const net = sub - disc;
    const srv = Math.round(net * s.service_percent / 100);
    const tax = Math.round(net * s.tax_percent / 100);
    return { subtotal: sub, discount: disc, service: srv, service_percent: s.service_percent, tax, tax_percent: s.tax_percent, total: net + srv + tax, currency: s.currency };
  }

  function insertOrder(db, events, tableId, tableNumber, type, items, createdBy) {
    const lines = priceLines(db, items);
    const tot = orderTotals(db, lines);
    const id = ++db.seq.orders;
    const created = nowISO();
    const o = {
      id, table_id: tableId, table_number: tableNumber, order_type: type, created_by: createdBy, status: 'new',
      subtotal: tot.subtotal, discount: tot.discount, service: tot.service, tax: tot.tax, total: tot.total,
      service_percent: tot.service_percent, tax_percent: tot.tax_percent, created_at: created,
      started_at: null, ready_at: null, served_at: null, cancelled_at: null, updated_by: null,
      paid_at: null, payment_method: null, amount_received: null, change_due: null, paid_by: null, shift_id: null,
    };
    db.orders.push(o);
    lines.forEach((l) => db.order_items.push(Object.assign({ id: ++db.seq.order_items, order_id: id }, l)));
    const sums = {};
    lines.forEach((l) => { sums[l.item_id] = (sums[l.item_id] || 0) + l.qty; });
    let menuChanged = false;
    Object.entries(sums).forEach(([iid, q]) => {
      const mi = db.menu_items.find((m) => m.id === Number(iid));
      if (!mi.track_stock) return;
      const wasOut = mi.stock_qty <= 0;
      mi.stock_qty -= q;
      if (!wasOut && mi.stock_qty <= 0) menuChanged = true;
      db.stock_movements.push({ id: ++db.seq.stock_movements, item_id: mi.id, change: -q, reason: 'sale', note: null, order_id: id, created_by: createdBy, created_at: created });
    });
    events.push({ kind: 'pg', table: 'orders', event: 'INSERT', new: clone(o) });
    if (menuChanged) events.push(menuSignal('menu_items'));
    return Object.assign({ order_id: id, table_number: tableNumber, order_type: type, created_at: created, lines }, tot);
  }

  function shiftSummary(db, id) {
    const s = db.shifts.find((x) => x.id === (id ?? currentShift(db)));
    if (!s) return null;
    const paid = db.orders.filter((o) => o.shift_id === s.id && o.paid_at);
    const cash = paid.filter((o) => o.payment_method === 'cash').reduce((a, o) => a + o.total, 0);
    const card = paid.filter((o) => o.payment_method === 'card').reduce((a, o) => a + o.total, 0);
    const exp = db.expenses.filter((e) => e.shift_id === s.id && e.from_drawer).reduce((a, e) => a + e.amount, 0);
    const name = (uid) => (db.profiles.find((p) => p.id === uid) || {}).full_name || null;
    return {
      id: s.id, status: s.status, opened_at: s.opened_at, closed_at: s.closed_at, opened_by: name(s.opened_by), closed_by: name(s.closed_by),
      opening_cash: s.opening_cash, cash_sales: cash, card_sales: card, paid_orders: paid.length, cash_expenses: exp,
      expected_cash: s.opening_cash + cash - exp, counted_cash: s.counted_cash, difference: s.difference, note: s.note,
      unpaid_open: db.orders.filter((o) => !o.paid_at && o.status !== 'cancelled').length,
    };
  }

  function checkRange(from, to) {
    need(from && to && Date.parse(to) > Date.parse(from), 'نطاق التاريخ غير صالح.');
    need(Date.parse(to) - Date.parse(from) <= 400 * 864e5, 'نطاق التقرير طويل جداً (الحد الأقصى 400 يوم).');
  }
  const inRange = (ts, from, to) => ts && Date.parse(ts) >= Date.parse(from) && Date.parse(ts) < Date.parse(to);
  const sum = (arr, f) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);
  function groupBy(arr, key) {
    const m = new Map();
    arr.forEach((x) => { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return m;
  }

  const RPC = {
    menu_context(db, ctx, p) {
      const s = db.settings[0];
      return {
        cafe_name: s.cafe_name, currency: s.currency, tax_percent: s.tax_percent, service_percent: s.service_percent,
        tagline: s.tagline, about: s.about, address: s.address, phone: s.phone, opening_hours: s.opening_hours,
        network_ok: networkOk(db), table_valid: db.cafe_tables.some((t) => t.number === Number(p.p_table) && t.active),
      };
    },
    quote_order(db, ctx, p) {
      need(networkOk(db) || isStaff(ctx.role), 'الطلب متاح فقط من شبكة واي فاي الكافيه. اتصل بالشبكة ثم أعد المحاولة.');
      const lines = priceLines(db, p.p_items);
      return Object.assign({ lines }, orderTotals(db, lines));
    },
    place_order(db, ctx, p, events) {
      need(networkOk(db), 'الطلب متاح فقط من شبكة واي فاي الكافيه. اتصل بالشبكة ثم أعد المحاولة.');
      const t = db.cafe_tables.find((x) => x.number === Number(p.p_table) && x.active);
      need(t, 'رقم الطاولة غير صالح. امسح رمز QR الموجود على طاولتك مرة أخرى.');
      const minute = Date.now() - 6e4;
      need(db.orders.filter((o) => o.table_id === t.id && Date.parse(o.created_at) > minute).length < 3, 'تم إرسال طلبات كثيرة من هذه الطاولة خلال دقيقة. انتظر قليلاً ثم أعد المحاولة.');
      return insertOrder(db, events, t.id, t.number, 'table', p.p_items, null);
    },
    pos_create_order(db, ctx, p, events) {
      requireTill(ctx);
      if (p.p_type === 'takeaway') return insertOrder(db, events, null, null, 'takeaway', p.p_items, ctx.uid);
      need(p.p_type === 'table', 'نوع الطلب غير صالح.');
      const t = db.cafe_tables.find((x) => x.number === Number(p.p_table) && x.active);
      need(t, 'اختر طاولة صحيحة وفعّالة.');
      return insertOrder(db, events, t.id, t.number, 'table', p.p_items, ctx.uid);
    },
    pay_order(db, ctx, p, events) {
      requireTill(ctx);
      const sid = currentShift(db);
      need(sid, 'لا توجد وردية مفتوحة. افتح وردية من تبويب "الوردية والصندوق" قبل التحصيل.');
      const o = db.orders.find((x) => x.id === Number(p.p_order_id));
      need(o, 'الطلب غير موجود.');
      need(o.status !== 'cancelled', 'لا يمكن تحصيل طلب ملغى.');
      need(!o.paid_at, 'هذا الطلب مدفوع مسبقاً.');
      need(['cash', 'card'].includes(p.p_method), 'طريقة الدفع غير صالحة.');
      let recv = o.total;
      if (p.p_method === 'cash') {
        recv = p.p_received == null ? o.total : Number(p.p_received);
        need(recv >= o.total, 'المبلغ المستلم أقل من الإجمالي.');
        need(recv <= 1e12, 'المبلغ غير صالح.');
      }
      Object.assign(o, { paid_at: nowISO(), payment_method: p.p_method, amount_received: recv, change_due: recv - o.total, paid_by: ctx.uid, shift_id: sid });
      events.push({ kind: 'pg', table: 'orders', event: 'UPDATE', new: clone(o) });
      return { order_id: o.id, total: o.total, received: recv, change: recv - o.total, method: p.p_method };
    },
    set_order_status(db, ctx, p, events) {
      need(ctx.role, 'غير مصرّح. سجّل الدخول بحساب موظف فعّال.', '42501');
      const o = db.orders.find((x) => x.id === Number(p.p_order_id));
      need(o, 'الطلب غير موجود.');
      need(!['served', 'cancelled'].includes(o.status), 'لا يمكن تعديل طلب مُسلَّم أو ملغى.');
      const ns = p.p_status;
      need(STATUS_ORDER.includes(ns), 'بعض القيم غير صالحة.', '22P02');
      need(ns !== 'new' && STATUS_ORDER.indexOf(ns) > STATUS_ORDER.indexOf(o.status), 'لا يمكن إرجاع الطلب إلى حالة سابقة.');
      need(!(ctx.role === 'kitchen' && !['preparing', 'ready'].includes(ns)), 'حساب المطبخ يمكنه فقط بدء التحضير أو تحديد الطلب كجاهز.', '42501');
      need(!(ns === 'cancelled' && o.paid_at), 'لا يمكن إلغاء طلب مدفوع.');
      const t = nowISO();
      o.status = ns;
      if (ns === 'preparing') o.started_at = t;
      if (ns === 'ready') o.ready_at = t;
      if (ns === 'served') o.served_at = t;
      if (ns === 'cancelled') o.cancelled_at = t;
      o.updated_by = ctx.uid;
      if (ns === 'cancelled') {
        const back = {};
        db.stock_movements.filter((s) => s.order_id === o.id && s.reason === 'sale').forEach((s) => { back[s.item_id] = (back[s.item_id] || 0) - s.change; });
        Object.entries(back).forEach(([iid, q]) => {
          const mi = db.menu_items.find((m) => m.id === Number(iid));
          if (!mi) return;
          const wasOut = mi.stock_qty <= 0;
          mi.stock_qty += q;
          db.stock_movements.push({ id: ++db.seq.stock_movements, item_id: mi.id, change: q, reason: 'cancel', note: null, order_id: o.id, created_by: ctx.uid, created_at: t });
          if (wasOut && mi.track_stock) events.push(menuSignal('menu_items'));
        });
      }
      events.push({ kind: 'pg', table: 'orders', event: 'UPDATE', new: clone(o) });
      return null;
    },
    adjust_stock(db, ctx, p, events) {
      need(ctx.role === 'manager', 'هذه العملية للمدير فقط.', '42501');
      need(['restock', 'waste', 'adjust'].includes(p.p_reason), 'سبب الحركة غير صالح.');
      const ch = Number(p.p_change);
      need(Number.isInteger(ch) && ch !== 0 && Math.abs(ch) <= 100000, 'الكمية غير صالحة.');
      need(!(p.p_reason === 'restock' && ch < 0), 'التوريد يجب أن يكون بكمية موجبة.');
      need(!(p.p_reason === 'waste' && ch > 0), 'التالف يجب أن يكون بكمية سالبة.');
      need(!p.p_note || p.p_note.length <= 200, 'الملاحظة طويلة جداً.');
      const mi = db.menu_items.find((m) => m.id === Number(p.p_item_id));
      need(mi, 'الصنف غير موجود.');
      need(mi.stock_qty + ch >= 0, 'لا يمكن أن يصبح المخزون أقل من صفر.');
      const wasOut = mi.track_stock && mi.stock_qty <= 0;
      mi.stock_qty += ch;
      db.stock_movements.push({ id: ++db.seq.stock_movements, item_id: mi.id, change: ch, reason: p.p_reason, note: (p.p_note || '').trim() || null, order_id: null, created_by: ctx.uid, created_at: nowISO() });
      if (mi.track_stock && wasOut !== (mi.stock_qty <= 0)) events.push(menuSignal('menu_items'));
      return mi.stock_qty;
    },
    set_item_available(db, ctx, p, events) {
      need(ctx.role, 'غير مصرّح.', '42501');
      const mi = db.menu_items.find((m) => m.id === Number(p.p_item_id));
      need(mi, 'الصنف غير موجود.');
      mi.available = !!p.p_available;
      events.push(menuSignal('menu_items'));
      return null;
    },
    shift_summary(db, ctx, p) { requireTill(ctx); return shiftSummary(db, p.p_shift_id); },
    open_shift(db, ctx, p) {
      requireTill(ctx);
      const v = Number(p.p_opening_cash);
      need(p.p_opening_cash != null && v >= 0 && v <= 1e12, 'مبلغ بداية الوردية غير صالح.');
      need(!currentShift(db), 'يوجد وردية مفتوحة بالفعل.');
      db.shifts.push({ id: ++db.seq.shifts, status: 'open', opened_by: ctx.uid, opened_at: nowISO(), opening_cash: v, closed_by: null, closed_at: null, expected_cash: null, counted_cash: null, difference: null, note: null });
      return shiftSummary(db, null);
    },
    close_shift(db, ctx, p) {
      requireTill(ctx);
      const id = currentShift(db);
      need(id, 'لا توجد وردية مفتوحة.');
      const c = Number(p.p_counted_cash);
      need(p.p_counted_cash != null && c >= 0 && c <= 1e12, 'المبلغ المعدود غير صالح.');
      need(!p.p_note || p.p_note.length <= 300, 'الملاحظة طويلة جداً.');
      const s = shiftSummary(db, id);
      Object.assign(db.shifts.find((x) => x.id === id), { status: 'closed', closed_by: ctx.uid, closed_at: nowISO(), expected_cash: s.expected_cash, counted_cash: c, difference: c - s.expected_cash, note: (p.p_note || '').trim() || null });
      return shiftSummary(db, id);
    },
    add_expense(db, ctx, p) {
      requireTill(ctx);
      let sid = null;
      if (p.p_from_drawer) { sid = currentShift(db); need(sid, 'لا توجد وردية مفتوحة للدفع من الصندوق.'); }
      const okCat = ['supplies', 'salaries', 'rent', 'utilities', 'maintenance', 'marketing', 'other'].includes(p.p_category);
      const amt = Number(p.p_amount);
      need(okCat && amt > 0 && amt <= 1e12 && (!p.p_description || p.p_description.length <= 200), 'بيانات المصروف غير صالحة (تأكد من النوع والمبلغ).');
      const id = ++db.seq.expenses;
      db.expenses.push({ id, category: p.p_category, amount: amt, description: (p.p_description || '').trim() || null, from_drawer: !!p.p_from_drawer, shift_id: sid, spent_at: p.p_spent_at || nowISO(), created_by: ctx.uid, created_at: nowISO() });
      return id;
    },
    report_sales(db, ctx, p) {
      need(ctx.role === 'manager', 'التقارير متاحة للمدير فقط.', '42501');
      checkRange(p.p_from, p.p_to);
      const tz = db.settings[0].timezone || 'Asia/Damascus';
      const o = db.orders.filter((x) => inRange(x.created_at, p.p_from, p.p_to));
      const ok = o.filter((x) => x.status !== 'cancelled');
      const ids = new Set(ok.map((x) => x.id));
      const li = db.order_items.filter((x) => ids.has(x.order_id));
      const prep = ok.filter((x) => x.ready_at);
      const ymd = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ts));
      const hour = (ts) => Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(ts)));
      const agg = (m, k) => [...m].map(([key, rows]) => ({ [k]: key, orders: rows.length, revenue: sum(rows, (r) => r.total) }));
      return {
        summary: {
          orders: ok.length, subtotal: sum(ok, (x) => x.subtotal), discount: sum(ok, (x) => x.discount), service: sum(ok, (x) => x.service),
          tax: sum(ok, (x) => x.tax), revenue: sum(ok, (x) => x.total), avg_order: ok.length ? Math.round(sum(ok, (x) => x.total) / ok.length) : 0,
          items_sold: sum(li, (x) => x.qty), cancelled: o.filter((x) => x.status === 'cancelled').length,
          avg_prep_min: prep.length ? Math.round(sum(prep, (x) => Date.parse(x.ready_at) - Date.parse(x.created_at)) / prep.length / 6e4 * 10) / 10 : null,
        },
        by_day: agg(groupBy(ok, (x) => ymd(x.created_at)), 'day').sort((a, b) => a.day.localeCompare(b.day)),
        by_hour: agg(groupBy(ok, (x) => hour(x.created_at)), 'hour').sort((a, b) => a.hour - b.hour),
        top_items: [...groupBy(li, (x) => x.item_name)].map(([k, rows]) => ({ item_name: k, qty: sum(rows, (r) => r.qty), revenue: sum(rows, (r) => r.line_total) })).sort((a, b) => b.qty - a.qty).slice(0, 15),
        by_category: [...groupBy(li, (x) => x.category_name || '—')].map(([k, rows]) => ({ category: k, qty: sum(rows, (r) => r.qty), revenue: sum(rows, (r) => r.line_total) })).sort((a, b) => b.revenue - a.revenue),
        by_table: agg(groupBy(ok.filter((x) => x.table_number != null), (x) => x.table_number), 'table_number').sort((a, b) => a.table_number - b.table_number),
      };
    },
    report_inventory(db, ctx, p) {
      need(ctx.role === 'manager', 'الجرد متاح للمدير فقط.', '42501');
      checkRange(p.p_from, p.p_to);
      return db.menu_items.map((mi) => {
        const mv = db.stock_movements.filter((m) => m.item_id === mi.id);
        const inP = mv.filter((m) => inRange(m.created_at, p.p_from, p.p_to));
        const by = (r) => sum(inP.filter((m) => m.reason === r), (m) => m.change);
        const soldQty = sum(db.order_items.filter((oi) => {
          if (oi.item_id !== mi.id) return false;
          const o = db.orders.find((x) => x.id === oi.order_id);
          return o && o.status !== 'cancelled' && inRange(o.created_at, p.p_from, p.p_to);
        }), (oi) => oi.qty);
        return {
          id: mi.id, name: mi.name, category: (db.categories.find((c) => c.id === mi.category_id) || {}).name, track_stock: mi.track_stock,
          current_qty: mi.stock_qty, low_stock_threshold: mi.low_stock_threshold,
          opening_qty: mi.stock_qty - sum(mv.filter((m) => Date.parse(m.created_at) >= Date.parse(p.p_from)), (m) => m.change),
          closing_qty: mi.stock_qty - sum(mv.filter((m) => Date.parse(m.created_at) >= Date.parse(p.p_to)), (m) => m.change),
          restocked: by('restock'), wasted: -by('waste'), adjusted: by('adjust'), returned: by('cancel'), sold_qty: soldQty,
        };
      }).sort((a, b) => String(a.category).localeCompare(String(b.category)) || a.name.localeCompare(b.name));
    },
    report_pnl(db, ctx, p) {
      need(ctx.role === 'manager', 'التقارير متاحة للمدير فقط.', '42501');
      checkRange(p.p_from, p.p_to);
      const paid = db.orders.filter((o) => inRange(o.paid_at, p.p_from, p.p_to) && o.status !== 'cancelled');
      const ex = db.expenses.filter((e) => inRange(e.spent_at, p.p_from, p.p_to));
      const unpaid = db.orders.filter((o) => !o.paid_at && o.status !== 'cancelled' && inRange(o.created_at, p.p_from, p.p_to));
      const revenue = sum(paid, (o) => o.total);
      const expenses = sum(ex, (e) => e.amount);
      return {
        revenue, paid_orders: paid.length,
        cash: sum(paid.filter((o) => o.payment_method === 'cash'), (o) => o.total), card: sum(paid.filter((o) => o.payment_method === 'card'), (o) => o.total),
        discounts: sum(paid, (o) => o.discount), service: sum(paid, (o) => o.service), tax: sum(paid, (o) => o.tax), expenses,
        expenses_by_category: [...groupBy(ex, (e) => e.category)].map(([k, rows]) => ({ category: k, total: sum(rows, (r) => r.amount), count: rows.length })).sort((a, b) => b.total - a.total),
        net_profit: revenue - expenses, unpaid_count: unpaid.length, unpaid_total: sum(unpaid, (o) => o.total),
        shifts: db.shifts.filter((s) => inRange(s.opened_at, p.p_from, p.p_to)).sort((a, b) => a.opened_at.localeCompare(b.opened_at))
          .map((s) => ({ id: s.id, opened_at: s.opened_at, closed_at: s.closed_at, opening_cash: s.opening_cash, expected_cash: s.expected_cash, counted_cash: s.counted_cash, difference: s.difference })),
      };
    },
    my_network_ip(db, ctx) {
      need(ctx.role, 'غير مصرّح.', '42501');
      return { ip: DEMO_IP, suggested: DEMO_IP + '/32', allowed_now: networkOk(db) };
    },
    set_wifi_lock(db, ctx, p, events) {
      need(till(ctx.role), 'هذه العملية للمدير أو الكاشير فقط.', '42501');
      const list = (p.p_networks || []).map((x) => String(x).trim()).filter(Boolean);
      need(list.length <= 10, 'الحد الأقصى 10 عناوين.');
      const nets = list.map((v) => {
        const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/);
        need(m && m.slice(1, 5).every((x) => Number(x) <= 255) && (!m[6] || Number(m[6]) <= 32), `العنوان "${v}" غير صالح. مثال صحيح: 185.12.34.56`);
        return m[5] ? v : v + '/32';
      });
      need(!(p.p_enabled && !nets.length), 'أضف عنوان شبكة واحد على الأقل قبل تفعيل القفل.');
      const s = db.settings[0];
      s.wifi_lock = !!p.p_enabled;
      s.allowed_networks = [...new Set(nets)];
      events.push(menuSignal('settings'));
      return { wifi_lock: s.wifi_lock, allowed_networks: s.allowed_networks };
    },
  };

  async function rpc(name, params) {
    await delay(80 + Math.random() * 120);
    const fn = RPC[name];
    if (!fn) return { data: null, error: { message: `function ${name} not found`, code: 'PGRST202' } };
    try {
      const db = db0();
      const events = [];
      const data = fn(db, me(), params || {}, events);
      commit(db, events);
      return { data: data === undefined ? null : clone(data), error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code || 'P0001', details: null, hint: null } };
    }
  }

  // =========================================================
  // القنوات اللحظية
  // =========================================================
  function channel(name) {
    const handlers = [];
    const ch = {
      topic: name,
      on(type, filter, cb) { handlers.push({ type, filter: filter || {}, cb }); return ch; },
      subscribe(cb) { channels.add(ch); setTimeout(() => cb && cb('SUBSCRIBED'), 30); return ch; },
      unsubscribe() { channels.delete(ch); return Promise.resolve('ok'); },
      send() { return Promise.resolve('ok'); },
      _deliver(ev) {
        handlers.forEach((h) => {
          if (h.type === 'postgres_changes' && ev.kind === 'pg' && (h.filter.table === ev.table) && (h.filter.event === '*' || h.filter.event === ev.event)) {
            setTimeout(() => h.cb({ eventType: ev.event, table: ev.table, schema: 'public', new: ev.new || {}, old: ev.old || {} }), 0);
          }
          if (h.type === 'broadcast' && ev.kind === 'broadcast' && ev.topic === name && (!h.filter.event || h.filter.event === ev.event)) {
            setTimeout(() => h.cb({ event: ev.event, payload: ev.payload, type: 'broadcast' }), 0);
          }
        });
      },
    };
    return ch;
  }

  // =========================================================
  // المساعد الذكي: ردود تجريبية جاهزة (لا اتصال بأي سيرفر)
  // =========================================================
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    if (String(url).startsWith('https://demo-assistant.invalid')) {
      await delay(700);
      let q = '';
      try { const m = JSON.parse(opts.body).messages; q = String(m[m.length - 1].content || ''); } catch (e) { /* تجاهل */ }
      const db = load();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const paid = db.orders.filter((o) => o.paid_at && Date.parse(o.paid_at) >= today.getTime());
      const rev = paid.reduce((a, o) => a + o.total, 0);
      const low = db.menu_items.filter((m) => m.track_stock && m.stock_qty <= m.low_stock_threshold).map((m) => `${m.name} (${m.stock_qty})`);
      let reply;
      if (/مخزون|ناقص|نفد/.test(q)) reply = low.length ? `الأصناف التي تحتاج توريد: ${low.join('، ')}.` : 'كل الأصناف المتتبَّعة بكميات جيدة.';
      else if (/مبيع|دخل|اليوم|محصل/.test(q)) reply = `اليوم تم تحصيل ${paid.length} طلب بإجمالي ${rev.toLocaleString('en-US')} ${db.settings[0].currency}.`;
      else reply = 'هذا مساعد تجريبي 🤖 في النظام الحقيقي يجاوب على أي سؤال عن مبيعاتك ومخزونك وطلباتك. جرّب: "كم مبيعات اليوم؟" أو "شو الناقص بالمخزون؟"';
      return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, opts);
  };

  // =========================================================
  // الواجهة: شريط "نسخة تجريبية" + دخول سريع بضغطة
  // =========================================================
  function resetDemo() {
    try {
      localStorage.removeItem(DB_KEY);
      Object.keys(localStorage).filter((k) => k.startsWith('mrblack-cart-')).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* تجاهل */ }
    cache = null;
    bc?.postMessage({ kind: 'reset' });
    location.reload();
  }
  bc?.addEventListener('message', (m) => { if (m.data && m.data.kind === 'reset') location.reload(); });

  function ui() {
    const css = document.createElement('style');
    css.textContent = `
      .pvd-bar{position:fixed;z-index:9999;bottom:10px;left:50%;transform:translateX(-50%);white-space:nowrap;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:999px;
        background:linear-gradient(120deg,#0e9f6e,#2bb3a3 50%,#5bbfe9);color:#fff;font:600 12.5px/1.2 system-ui,'Cairo',sans-serif;box-shadow:0 10px 30px -10px rgba(14,159,110,.7);direction:rtl}
      .pvd-bar button,.pvd-bar a{all:unset;cursor:pointer;background:rgba(255,255,255,.22);padding:5px 10px;border-radius:999px;font-weight:700}
      .pvd-bar button:hover,.pvd-bar a:hover{background:rgba(255,255,255,.35)}
      .pvd-quick{margin-top:14px;padding:12px;border-radius:12px;border:1px dashed currentColor;opacity:.95;text-align:center;font-size:13px}
      .pvd-quick p{margin:0 0 8px}
      .pvd-quick div{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
      .pvd-quick button{cursor:pointer;border:0;border-radius:999px;padding:7px 12px;font:inherit;font-weight:700;background:linear-gradient(120deg,#0e9f6e,#5bbfe9);color:#fff}
      @media print{.pvd-bar{display:none}}`;
    document.head.appendChild(css);
    // داخل صفحة التجربة (iframe) لا نعرض الشريط: الصفحة الأم فيها زر "من جديد"
    if (window.top === window.self) {
      const bar = document.createElement('div');
      bar.className = 'pvd-bar';
      bar.innerHTML = '🧪 نسخة تجريبية — البيانات وهمية <button type="button" data-pvd-reset title="مسح كل التجارب والبدء من جديد">↺ من جديد</button><a href="../">PrimeView ↩</a>';
      bar.querySelector('[data-pvd-reset]').onclick = () => { if (confirm('مسح كل ما جرّبته والبدء ببيانات جديدة؟')) resetDemo(); };
      document.body.appendChild(bar);
    }

    // أزرار الدخول السريع على شاشة تسجيل الدخول
    const addQuick = () => {
      const form = document.querySelector('.login-box form, form.login-box');
      if (!form || form.querySelector('.pvd-quick')) return;
      const box = document.createElement('div');
      box.className = 'pvd-quick';
      box.innerHTML = '<p>حسابات تجريبية — اضغط للدخول مباشرة</p><div>'
        + '<button type="button" data-as="manager">👔 مدير</button><button type="button" data-as="cashier">💵 كاشير</button><button type="button" data-as="kitchen">👨‍🍳 مطبخ</button></div>';
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-as]');
        if (!b) return;
        form.querySelector('[name=email]').value = ROLE_EMAIL[b.dataset.as];
        form.querySelector('[name=password]').value = PASSWORD;
        form.requestSubmit();
      });
      form.appendChild(box);
    };
    new MutationObserver(addQuick).observe(document.body, { childList: true, subtree: true });
    addQuick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();

  // =========================================================
  // الواجهة البرمجية المطابقة لـ supabase-js
  // =========================================================
  const client = {
    from: (t) => new Query(t),
    rpc,
    auth,
    channel,
    removeChannel: (ch) => { channels.delete(ch); return Promise.resolve('ok'); },
    functions: {
      async invoke() {
        await delay(200);
        const msg = 'إضافة الموظفين وتغيير كلمات السر غير متاحة في النسخة التجريبية. في النظام الحقيقي يضيف المدير موظفيه من هنا.';
        return { data: null, error: { message: msg, context: { json: async () => ({ error: msg }) } } };
      },
    },
  };
  window.supabase = { createClient: () => client };
  window.PV_DEMO = { reset: resetDemo, accounts: ROLE_EMAIL, password: PASSWORD };
})();
