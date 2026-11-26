// تبويب المنيو: الأقسام والأصناف (المدير) + توفر الأصناف (كل الموظفين)
import {
  sb, html, setHTML, $, money, toast, toastError, errMsg, withBusy, confirmDialog, openModal, formData, safeUrl,
} from '../common.js';
import { loadingTpl, errorTpl, emptyTpl, switchTpl, intOr } from './util.js';

export function mount(el, ctx) {
  const M = ctx.isManager;
  let cats = [];
  let items = [];
  let filterCat = 'all';
  let search = '';

  async function load() {
    setHTML(el, loadingTpl());
    const [c, i] = await Promise.all([
      sb.from('categories').select('*').order('sort').order('id'),
      sb.from('menu_items').select('*').order('sort').order('id'),
    ]);
    if (c.error || i.error) { setHTML(el, errorTpl(c.error || i.error)); return; }
    cats = c.data;
    items = i.data;
    render();
  }

  const catName = (id) => cats.find((c) => c.id === id)?.name ?? '—';

  function render() {
    const shown = items.filter((it) =>
      (filterCat === 'all' || it.category_id === Number(filterCat)) &&
      (!search || it.name.includes(search)));

    setHTML(el, html`
      <div class="page-head">
        <h2>المنيو</h2>
        ${M ? html`<div class="row">
          <button class="btn" data-add-cat type="button">+ قسم</button>
          <button class="btn btn-gold" data-add-item type="button" ${cats.length ? '' : html`disabled`}>+ صنف</button></div>` : ''}
      </div>

      ${M ? html`<div class="section"><h3>الأقسام</h3>
        ${cats.length ? html`<div class="cat-list">${cats.map((c) => html`
          <span class="cat-pill ${c.active ? '' : 'off'}" data-cat-id="${c.id}">
            <span>${c.name}</span><span class="muted num" style="font-size:12px">(${items.filter((i) => i.category_id === c.id).length})</span>
            <button class="btn btn-sm btn-ghost" data-edit-cat type="button" aria-label="تعديل">✎</button>
          </span>`)}</div>` : emptyTpl('لا توجد أقسام', 'ابدأ بإضافة قسم مثل "قهوة ساخنة".')}
      </div>` : html`<p class="muted" style="margin-bottom:12px">عند إيقاف صنف يبقى ظاهراً في منيو الزبائن مكتوباً عليه "نفد حالياً" ولا يمكن طلبه.</p>`}

      <div class="filters">
        <input class="input" type="search" placeholder="بحث عن صنف…" value="${search}" data-search style="max-width:240px">
        <select class="input" data-filter style="width:auto">
          <option value="all">كل الأقسام</option>
          ${cats.map((c) => html`<option value="${c.id}" ${String(c.id) === String(filterCat) ? html`selected` : ''}>${c.name}</option>`)}
        </select>
      </div>

      ${shown.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>الصنف</th><th>القسم</th><th>السعر</th><th>المخزون</th><th>متوفر</th>${M ? html`<th></th>` : ''}</tr></thead>
        <tbody>${shown.map((it) => html`<tr data-item-id="${it.id}">
          <td class="wrap"><b>${it.name}</b>${it.name_en ? html` <span class="muted" dir="ltr" style="font-size:12px">${it.name_en}</span>` : ''}${it.sold_out ? html` <span class="badge badge-danger">نفد</span>` : ''}${it.description ? html`<div class="muted" style="font-size:12px">${it.description}</div>` : ''}</td>
          <td>${catName(it.category_id)}</td>
          <td class="num">${money(it.price)}</td>
          <td class="num">${it.track_stock
            ? html`<span class="badge ${it.stock_qty <= 0 ? 'badge-danger' : it.stock_qty <= it.low_stock_threshold ? 'badge-warn' : ''}">${it.stock_qty}</span>`
            : html`<span class="muted">—</span>`}</td>
          <td>${switchTpl(html`data-avail`, it.available, false, 'متوفر')}</td>
          ${M ? html`<td><div class="row">
            <button class="btn btn-sm" data-edit-item type="button">تعديل</button>
            <button class="btn btn-sm btn-danger" data-del-item type="button">حذف</button></div></td>` : ''}
        </tr>`)}</tbody></table></div>`
        : emptyTpl(items.length ? 'لا توجد نتائج' : 'لا توجد أصناف بعد')}`);
  }

  // ---------- نموذج القسم ----------
  function catForm(cat = null) {
    const m = openModal(cat ? 'تعديل القسم' : 'قسم جديد', html`
      <form novalidate>
        <div class="field"><label for="c-name">اسم القسم</label>
          <input class="input" id="c-name" name="name" maxlength="60" required value="${cat?.name ?? ''}"></div>
        <div class="field"><label for="c-sort">ترتيب الظهور (الأصغر أولاً)</label>
          <input class="input" id="c-sort" name="sort" type="number" step="1" value="${cat?.sort ?? cats.length + 1}"></div>
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="active" ${cat?.active === false ? '' : html`checked`}> القسم ظاهر للزبائن</label>
        <p class="form-error" role="alert"></p>
        <div class="row">
          <button class="btn btn-gold" type="submit">حفظ</button>
          ${cat ? html`<button class="btn btn-danger" type="button" data-del>حذف القسم</button>` : ''}
        </div>
      </form>`);
    const form = $('form', m.body);
    const err = $('.form-error', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const row = { name: (f.name || '').trim(), sort: intOr(f.sort, 0), active: !!f.active };
      if (!row.name) { err.textContent = 'اسم القسم مطلوب.'; return; }
      await withBusy(form.querySelector('[type=submit]'), async () => {
        const q = cat ? sb.from('categories').update(row).eq('id', cat.id) : sb.from('categories').insert(row);
        const { error } = await q;
        if (error) { err.textContent = errMsg(error); return; }
        m.close(); toast('تم حفظ القسم', 'success'); load();
      });
    });
    $('[data-del]', form)?.addEventListener('click', async () => {
      if (!(await confirmDialog(`حذف قسم "${cat.name}"؟ لا يمكن حذف قسم يحتوي أصنافاً.`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('categories').delete().eq('id', cat.id);
      if (error) { toast(error.code === '23503' ? 'لا يمكن حذف قسم يحتوي أصنافاً. انقل الأصناف أو احذفها أولاً، أو أخفِ القسم.' : errMsg(error), 'error'); return; }
      m.close(); toast('تم حذف القسم', 'success'); load();
    });
  }

  // ---------- نموذج الصنف ----------
  function itemForm(it = null) {
    const m = openModal(it ? 'تعديل الصنف' : 'صنف جديد', html`
      <form novalidate>
        <div class="field"><label for="i-name">اسم الصنف</label>
          <input class="input" id="i-name" name="name" maxlength="80" required value="${it?.name ?? ''}"></div>
        <div class="field"><label for="i-en">الاسم بالإنكليزي (اختياري، يظهر تحت الاسم)</label>
          <input class="input" id="i-en" name="name_en" maxlength="80" dir="ltr" value="${it?.name_en ?? ''}"></div>
        <div class="grid-2">
          <div class="field"><label for="i-cat">القسم</label>
            <select class="input" id="i-cat" name="category_id">${cats.map((c) =>
              html`<option value="${c.id}" ${(it?.category_id ?? (filterCat !== 'all' ? Number(filterCat) : cats[0]?.id)) === c.id ? html`selected` : ''}>${c.name}</option>`)}</select></div>
          <div class="field"><label for="i-price">السعر (${ctx.settings.currency})</label>
            <input class="input" id="i-price" name="price" type="number" min="0" step="1" inputmode="numeric" required value="${it?.price ?? ''}"></div>
        </div>
        <div class="field"><label for="i-desc">الوصف (اختياري)</label>
          <textarea class="input" id="i-desc" name="description" maxlength="300">${it?.description ?? ''}</textarea></div>
        <div class="field"><label for="i-img">رابط صورة (اختياري، يبدأ بـ https://)</label>
          <input class="input" id="i-img" name="image_url" type="url" dir="ltr" maxlength="500" value="${it?.image_url ?? ''}"></div>
        <div class="grid-2">
          <div class="field"><label for="i-sort">ترتيب الظهور</label>
            <input class="input" id="i-sort" name="sort" type="number" step="1" value="${it?.sort ?? 0}"></div>
          <div class="field"><label for="i-low">تنبيه المخزون المنخفض عند</label>
            <input class="input" id="i-low" name="low_stock_threshold" type="number" min="0" step="1" value="${it?.low_stock_threshold ?? 5}"></div>
        </div>
        <label class="check" style="margin-bottom:8px"><input type="checkbox" name="available" ${it?.available === false ? '' : html`checked`}> متوفر للطلب (إذا أُلغي التحديد يظهر "نفد حالياً")</label><br>
        <label class="check" style="margin-bottom:8px"><input type="checkbox" name="track_stock" data-track ${it?.track_stock ? html`checked` : ''}> تتبّع المخزون لهذا الصنف</label>
        ${!it ? html`<div class="field hidden" data-initial><label for="i-qty">الكمية الافتتاحية</label>
          <input class="input" id="i-qty" name="initial_qty" type="number" min="0" step="1" value="0"></div>` : ''}
        ${it?.track_stock ? html`<p class="muted" style="font-size:13px">لتعديل الكمية استخدم تبويب "المخزون" (حتى تُسجَّل كل حركة في الجرد).</p>` : ''}
        <p class="form-error" role="alert" style="margin-top:10px"></p>
        <button class="btn btn-gold" type="submit">حفظ</button>
      </form>`);
    const form = $('form', m.body);
    const err = $('.form-error', form);
    const initial = $('[data-initial]', form);
    $('[data-track]', form).addEventListener('change', (e) => initial?.classList.toggle('hidden', !e.target.checked));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = formData(form);
      const row = {
        name: (f.name || '').trim(),
        name_en: (f.name_en || '').trim() || null,
        category_id: intOr(f.category_id),
        price: intOr(f.price),
        description: (f.description || '').trim() || null,
        image_url: (f.image_url || '').trim() || null,
        sort: intOr(f.sort, 0),
        low_stock_threshold: intOr(f.low_stock_threshold, 5),
        available: !!f.available,
        track_stock: !!f.track_stock,
      };
      if (!row.name) { err.textContent = 'اسم الصنف مطلوب.'; return; }
      if (row.price === null || row.price < 0) { err.textContent = 'أدخل سعراً صحيحاً (رقم بدون كسور).'; return; }
      if (row.image_url && !safeUrl(row.image_url)) { err.textContent = 'رابط الصورة يجب أن يبدأ بـ https://'; return; }
      if (row.low_stock_threshold === null || row.low_stock_threshold < 0) { err.textContent = 'حد التنبيه غير صالح.'; return; }
      const initQty = intOr(f.initial_qty, 0);

      await withBusy(form.querySelector('[type=submit]'), async () => {
        let saved;
        if (it) {
          const { error } = await sb.from('menu_items').update(row).eq('id', it.id);
          if (error) { err.textContent = errMsg(error); return; }
        } else {
          const { data, error } = await sb.from('menu_items').insert(row).select('id').single();
          if (error) { err.textContent = errMsg(error); return; }
          saved = data;
          if (row.track_stock && initQty > 0) {
            const { error: sErr } = await sb.rpc('adjust_stock', { p_item_id: saved.id, p_change: initQty, p_reason: 'restock', p_note: 'رصيد افتتاحي' });
            if (sErr) toast(`تم حفظ الصنف لكن تعذّر تسجيل الكمية: ${errMsg(sErr)}`, 'error');
          }
        }
        m.close(); toast('تم حفظ الصنف', 'success'); load();
      });
    });
  }

  // ---------- الأحداث ----------
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-add-cat]')) return catForm();
    if (e.target.closest('[data-add-item]')) return itemForm();
    const catEl = e.target.closest('[data-cat-id]');
    if (catEl && e.target.closest('[data-edit-cat]')) return catForm(cats.find((c) => c.id === Number(catEl.dataset.catId)));
    const row = e.target.closest('[data-item-id]');
    if (!row) return;
    const it = items.find((x) => x.id === Number(row.dataset.itemId));
    if (e.target.closest('[data-edit-item]')) return itemForm(it);
    if (e.target.closest('[data-del-item]')) {
      if (!(await confirmDialog(`حذف "${it.name}" نهائياً؟ الطلبات السابقة تبقى محفوظة في التقارير. يُفضَّل إيقافه بدلاً من حذفه.`, { danger: true, okLabel: 'حذف' }))) return;
      const { error } = await sb.from('menu_items').delete().eq('id', it.id);
      if (error) return toastError(error);
      toast('تم حذف الصنف', 'success'); load();
    }
  });

  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-filter]')) { filterCat = e.target.value; render(); return; }
    if (e.target.matches('[data-avail]')) {
      const id = Number(e.target.closest('[data-item-id]').dataset.itemId);
      const val = e.target.checked;
      e.target.disabled = true;
      const { error } = await sb.rpc('set_item_available', { p_item_id: id, p_available: val });
      e.target.disabled = false;
      if (error) { e.target.checked = !val; toastError(error); return; }
      const it = items.find((x) => x.id === id);
      if (it) { it.available = val; it.sold_out = !val || (it.track_stock && it.stock_qty <= 0); }
      toast(val ? `"${it?.name}" متوفر الآن` : `"${it?.name}" يظهر الآن للزبائن: نفد حالياً`, 'success');
      render();
    }
  });

  let searchTimer;
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-search]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      search = e.target.value.trim();
      render();
      const s = $('[data-search]', el);
      s.focus(); s.setSelectionRange(s.value.length, s.value.length);
    }, 250);
  });

  load();
}
