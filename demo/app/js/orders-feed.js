// =========================================================
// Mr Black — تغذية الطلبات اللحظية (مشتركة بين الكاشير والمطبخ)
//   mode 'kitchen': جديد / قيد التحضير / جاهز
//   mode 'till'   : كل طلب لم يُغلق بعد = غير مُسلَّم، أو مُسلَّم وغير مدفوع
//   بدون حدّ زمني: الطلب المعلّق يبقى ظاهراً حتى يُغلق مهما طال.
// =========================================================
import { sb } from './common.js';

export const ORDER_SELECT = 'id, table_number, order_type, created_by, status, subtotal, discount, service, tax, total, created_at, started_at, ready_at, served_at, cancelled_at, paid_at, payment_method, amount_received, change_due, order_items(id, item_name, qty, note, unit_price, unit_discount, line_total)';

const KITCHEN = ['new', 'preparing', 'ready'];
export const isOpenFor = (mode) => (o) => (mode === 'kitchen'
  ? KITCHEN.includes(o.status)
  : KITCHEN.includes(o.status) || (o.status === 'served' && !o.paid_at));

export function startOrdersFeed({ mode = 'till', onChange, onConn, onError }) {
  const isOpen = isOpenFor(mode);
  const orders = new Map();
  let firstLoad = true;

  const emit = (newIds = []) => {
    const list = [...orders.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    onChange(list, { newIds });
  };

  async function reloadAll() {
    let q = sb.from('orders').select(ORDER_SELECT).order('created_at').limit(500);
    q = mode === 'kitchen'
      ? q.in('status', KITCHEN)
      : q.or('status.in.(new,preparing,ready),and(status.eq.served,paid_at.is.null)');
    const { data, error } = await q;
    if (error) { onError?.(error); return; }
    const newIds = firstLoad ? [] : data.filter((o) => !orders.has(o.id) && o.status === 'new').map((o) => o.id);
    orders.clear();
    data.forEach((o) => orders.set(o.id, o));
    firstLoad = false;
    emit(newIds);
  }

  async function fetchOne(id) {
    const { data, error } = await sb.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
    if (error) { onError?.(error); return; }
    if (!data) return;
    const isNew = !orders.has(id) && data.status === 'new';
    if (isOpen(data)) orders.set(id, data); else orders.delete(id);
    emit(isNew ? [id] : []);
  }

  const channel = sb.channel(`orders-feed-${mode}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => fetchOne(p.new.id))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
      const cur = orders.get(p.new.id);
      const next = cur ? { ...cur, ...p.new } : null;
      if (next && !isOpen(next)) { orders.delete(p.new.id); emit(); }
      else if (next) { orders.set(p.new.id, next); emit(); }
      else fetchOne(p.new.id);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { onConn?.('on'); reloadAll(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onConn?.('off');
    });

  onConn?.('connecting');
  reloadAll();
  const timer = setInterval(reloadAll, 30000);   // إعادة مزامنة احتياطية
  window.addEventListener('online', reloadAll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadAll(); });

  return {
    reload: reloadAll,
    get(id) { return orders.get(id); },
    patch(id, fields) {
      const cur = orders.get(id);
      if (!cur) return;
      const next = { ...cur, ...fields };
      if (isOpen(next)) orders.set(id, next); else orders.delete(id);
      emit();
    },
    stop() { clearInterval(timer); sb.removeChannel(channel); },
  };
}

export async function changeStatus(id, status) {
  const { error } = await sb.rpc('set_order_status', { p_order_id: id, p_status: status });
  if (error) throw error;
}

/** "طاولة 4" أو "سفري" */
export const orderPlace = (o) => (o.order_type === 'takeaway' ? 'سفري 🥡' : `طاولة ${o.table_number}`);
