// تبويب الفعاليات (المدير والكاشير) — تظهر للزبائن في صندوق "الفعاليات" بصفحة المنيو
import { sb, html, setHTML, $, toast, toastError, errMsg, withBusy, confirmDialog, openModal, formData, fmtDateTime } from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, switchTpl } from './util.js';

function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function mount(el) {
  let events = [];

  async function load() {
    setHTML(el, loadingTpl());
    const { data, error } = await sb.from('events').select('*').order('starts_at', { ascending: true, nullsFirst: true });
    if (error) { setHTML(el, errorTpl(error)); return; }
    events = data;
    render();
  }

  function status(e) {
    const now = Date.now();
    if (!e.active) return html`<span class="badge">موقوفة</span>`;
    if (e.ends_at && new Date(e.ends_at) <= now) return html`<span class="badge badge-danger">انتهت</span>`;
    if (e.starts_at && new Date(e.starts_at) > now) return html`<span class="badge badge-warn">قادمة</span>`;
    return html`<span class="badge badge-ok">ظاهرة الآن</span>`;
  }

  function render() {
    setHTML(el, html`
      <div class="page-head"><h2>الفعاليات</h2><button class="btn btn-gold" data-add type="button">+ فعالية</button></div>
      <p class="muted" style="margin-bottom:12px">الفعاليات المفعّلة وغير المنتهية تظهر للزبائن في صندوق "🎉 الفعاليات" بصفحة المنيو.</p>
      ${events.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>الفعالية</th><th>الموعد</th><th>الحالة</th><th>تفعيل</th><th></th></tr></thead>
        <tbody>${events.map((e) => html`<tr data-id="${e.id}">
          <td class="wrap"><b>${e.title}</b>${e.description ? html`<div class="muted" style="font-size:12px">${e.description}</div>` : ''}</td>
          <td class="num" style="font-size:12px">${e.starts_at ? fmtDateTime(e.starts_at) : '—'}<br>${e.ends_at ? `حتى ${fmtDateTime(e.ends_at)}` : 'بدون نهاية'}</td>
          <td>${status(e)}</td>
          <td>${switchTpl(html`data-active`, e.active, false, 'تفعيل')}</td>
          <td><div class="row"><button class="btn btn-sm" data-edit type="button">تعديل</button>
            <button class="btn btn-sm btn-danger" data-del type="button">حذف</button></div></td></tr>`)}
        </tbody></table></div>` : emptyTpl('لا توجد فعاليات', 'أضف فعالية مثل: أمسية موسيقية، نقل مباراة، ورشة قهوة…')}`);
  }

  function form(ev = null) {
    const m = openModal(ev ? 'تعديل الفعالية' : 'فعالية جديدة', html`
      <form novalidate>
        <div class="field"><label for="ev-title">عنوان الفعالية</label>
          <input class="input" id="ev-title" name="title" maxlength="80" required value="${ev?.title ?? ''}"></div>
        <div class="field"><label for="ev-desc">تفاصيل (اختياري)</label>
          <textarea class="input" id="ev-desc" name="description" maxlength="300">${ev?.description ?? ''}</textarea></div>
        <div class="grid-2">
          <div class="field"><label for="ev-start">تبدأ (اختياري)</label>
            <input class="input" id="ev-start" name="starts_at" type="datetime-local" value="${toLocalInput(ev?.starts_at)}"></div>
          <div class="field"><label for="ev-end">تنتهي (اختياري — تختفي بعدها تلقائياً)</label>
            <input class="input" id="ev-end" name="ends_at" type="datetime-local" value="${toLocalInput(ev?.ends_at)}"></div>
        </div>
        <label class="check" style="margin-bottom:12px"><input type="checkbox" name="active" ${ev?.active === false ? '' : html`checked`}> ظاهرة للزبائن</label>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      const row = {
        title: (d.title || '').trim(),
        description: (d.description || '').trim() || null,
        starts_at: d.starts_at ? new Date(d.starts_at).toISOString() : null,
        ends_at: d.ends_at ? new Date(d.ends_at).toISOString() : null,
        active: !!d.active,
      };
      if (!row.title) { err.textContent = 'عنوان الفعالية مطلوب.'; return; }
      if (row.starts_at && row.ends_at && row.ends_at <= row.starts_at) { err.textContent = 'وقت النهاية يجب أن يكون بعد البداية.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = ev ? await sb.from('events').update(row).eq('id', ev.id) : await sb.from('events').insert(row);
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم حفظ الفعالية', 'success'); load();
      });
    });
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add]')) return form();
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const ev = events.find((x) => x.id === Number(row.dataset.id));
    if (e.target.closest('[data-edit]')) return form(ev);
    if (e.target.closest('[data-del]')) {
      if (!(await confirmDialog(`حذف الفعالية "${ev.title}"؟`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('events').delete().eq('id', ev.id);
      if (error) return toastError(error);
      toast('تم حذف الفعالية', 'success'); load();
    }
  });
  el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-active]')) return;
    const id = Number(e.target.closest('[data-id]').dataset.id);
    const val = e.target.checked;
    const { error } = await sb.from('events').update({ active: val }).eq('id', id);
    if (error) { e.target.checked = !val; toastError(error); return; }
    events.find((x) => x.id === id).active = val;
    render();
  });

  load();
}
