// تبويب الموظفين (المدير)
import {
  sb, html, setHTML, $, toast, errMsg, withBusy, confirmDialog, openModal, formData, fmtDateTime, ROLE_LABELS,
} from '../common.js';
import { loadingTpl, errorTpl, emptyTpl } from './util.js';

/** استدعاء دالة إدارة الموظفين على سيرفر Supabase */
async function callStaff(body) {
  const { data, error } = await sb.functions.invoke('manage-staff', { body });
  if (error) {
    let msg = null;
    try { msg = (await error.context.json()).error; } catch { /* ignore */ }
    throw new Error(msg || 'تعذّر الاتصال بخدمة الموظفين. تحقق من الإنترنت وحاول مرة أخرى.');
  }
  return data;
}

const roleOptions = (sel) => html`${Object.entries(ROLE_LABELS).map(([k, v]) =>
  html`<option value="${k}" ${sel === k ? html`selected` : ''}>${v}</option>`)}`;

export function mount(el, ctx) {
  let staff = [];
  const me = ctx.profile.id;

  async function load() {
    setHTML(el, loadingTpl());
    const { data, error } = await sb.from('profiles').select('id, full_name, role, active, email, created_at').order('created_at');
    if (error) { setHTML(el, errorTpl(error)); return; }
    staff = data;
    render();
  }

  function render() {
    setHTML(el, html`
      <div class="page-head"><h2>الموظفون</h2><button class="btn btn-gold" data-add type="button">+ موظف</button></div>
      <p class="muted" style="margin-bottom:12px">
        <b>مدير</b>: كل الصلاحيات · <b>كاشير</b>: الطلبات وتوفر الأصناف · <b>مطبخ</b>: شاشة المطبخ فقط. كل الموظفين يستطيعون استخدام المساعد الذكي.</p>
      ${staff.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>أُضيف</th><th></th></tr></thead>
        <tbody>${staff.map((s) => html`<tr data-id="${s.id}">
          <td><b>${s.full_name}</b>${s.id === me ? html` <span class="badge badge-gold">أنت</span>` : ''}</td>
          <td dir="ltr" style="text-align:end">${s.email ?? '—'}</td>
          <td>${ROLE_LABELS[s.role]}</td>
          <td>${s.active ? html`<span class="badge badge-ok">فعّال</span>` : html`<span class="badge badge-danger">معطّل</span>`}</td>
          <td class="num" style="font-size:12px">${fmtDateTime(s.created_at)}</td>
          <td><div class="row">
            <button class="btn btn-sm" data-edit type="button">تعديل</button>
            <button class="btn btn-sm" data-pass type="button">كلمة المرور</button>
            ${s.id !== me ? html`
              <button class="btn btn-sm ${s.active ? 'btn-danger' : 'btn-ok'}" data-toggle type="button">${s.active ? 'تعطيل' : 'تفعيل'}</button>
              <button class="btn btn-sm btn-danger" data-del type="button">حذف</button>` : ''}
          </div></td></tr>`)}</tbody></table></div>` : emptyTpl('لا يوجد موظفون')}`);
  }

  function addForm() {
    const m = openModal('موظف جديد', html`
      <form novalidate autocomplete="off">
        <div class="field"><label for="s-name">الاسم</label><input class="input" id="s-name" name="full_name" maxlength="80" required></div>
        <div class="field"><label for="s-email">البريد الإلكتروني (لتسجيل الدخول)</label>
          <input class="input" id="s-email" name="email" type="email" dir="ltr" required autocomplete="off"></div>
        <div class="field"><label for="s-pass">كلمة المرور (8 أحرف على الأقل)</label>
          <input class="input" id="s-pass" name="password" type="password" dir="ltr" minlength="8" maxlength="72" required autocomplete="new-password"></div>
        <div class="field"><label for="s-role">الدور</label><select class="input" id="s-role" name="role">${roleOptions('cashier')}</select></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">إنشاء الحساب</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      if (!d.full_name.trim()) { err.textContent = 'الاسم مطلوب.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) { err.textContent = 'البريد الإلكتروني غير صالح.'; return; }
      if (d.password.length < 8) { err.textContent = 'كلمة المرور 8 أحرف على الأقل.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        try {
          await callStaff({ action: 'create', full_name: d.full_name.trim(), email: d.email.trim(), password: d.password, role: d.role });
          m.close(); toast('تم إنشاء حساب الموظف. أعطه البريد وكلمة المرور بشكل خاص.', 'success', 6000); load();
        } catch (ex) { err.textContent = errMsg(ex); }
      });
    });
  }

  function editForm(s) {
    const m = openModal(`تعديل — ${s.full_name}`, html`
      <form novalidate>
        <div class="field"><label for="e-name">الاسم</label><input class="input" id="e-name" name="full_name" maxlength="80" required value="${s.full_name}"></div>
        <div class="field"><label for="e-role">الدور</label><select class="input" id="e-role" name="role">${roleOptions(s.role)}</select></div>
        ${s.id === me ? html`<p class="muted" style="font-size:13px;margin-bottom:10px">تنبيه: إذا غيّرت دورك من "مدير" ستفقد صلاحيات الإدارة فوراً.</p>` : ''}
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(f);
      if (!d.full_name.trim()) { err.textContent = 'الاسم مطلوب.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        const { error } = await sb.from('profiles').update({ full_name: d.full_name.trim(), role: d.role }).eq('id', s.id);
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم الحفظ', 'success');
        if (s.id === me && d.role !== 'manager') location.reload(); else load();
      });
    });
  }

  function passForm(s) {
    const m = openModal(`كلمة مرور جديدة — ${s.full_name}`, html`
      <form novalidate autocomplete="off">
        <div class="field"><label for="p-new">كلمة المرور الجديدة (8 أحرف على الأقل)</label>
          <input class="input" id="p-new" name="password" type="password" dir="ltr" minlength="8" maxlength="72" required autocomplete="new-password"></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" type="submit">تغيير</button>
      </form>`);
    const f = $('form', m.body);
    const err = $('.form-error', f);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { password } = formData(f);
      if (password.length < 8) { err.textContent = 'كلمة المرور 8 أحرف على الأقل.'; return; }
      await withBusy(f.querySelector('[type=submit]'), async () => {
        try { await callStaff({ action: 'set_password', user_id: s.id, password }); m.close(); toast('تم تغيير كلمة المرور', 'success'); }
        catch (ex) { err.textContent = errMsg(ex); }
      });
    });
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add]')) return addForm();
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const s = staff.find((x) => x.id === row.dataset.id);
    if (e.target.closest('[data-edit]')) return editForm(s);
    if (e.target.closest('[data-pass]')) return passForm(s);
    const tgl = e.target.closest('[data-toggle]');
    if (tgl) {
      const to = !s.active;
      if (!to && !(await confirmDialog(`تعطيل حساب ${s.full_name}؟ لن يستطيع تسجيل الدخول.`, { danger: true, okLabel: 'تعطيل' }))) return;
      return withBusy(tgl, async () => {
        try { await callStaff({ action: 'set_active', user_id: s.id, active: to }); toast(to ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب', 'success'); load(); }
        catch (ex) { toast(errMsg(ex), 'error'); }
      });
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (!(await confirmDialog(`حذف حساب ${s.full_name} نهائياً؟ لا يمكن التراجع. (الطلبات السابقة تبقى في التقارير)`, { danger: true, okLabel: 'حذف نهائي' }))) return;
      return withBusy(del, async () => {
        try { await callStaff({ action: 'delete', user_id: s.id }); toast('تم حذف الموظف', 'success'); load(); }
        catch (ex) { toast(errMsg(ex), 'error'); }
      });
    }
  });

  load();
}
