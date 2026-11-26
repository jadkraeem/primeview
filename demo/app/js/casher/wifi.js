// تبويب الشبكة: قفل الطلب على واي فاي الكافيه (المدير والكاشير)
import { sb, html, setHTML, $, $$, toast, errMsg, withBusy, confirmDialog } from '../common.js';
import { loadingTpl, errorTpl, switchTpl } from './util.js';

export function mount(el, ctx) {
  let lock = false;
  let nets = [];
  let mine = null;

  async function load() {
    setHTML(el, loadingTpl());
    const [s, ip] = await Promise.all([
      sb.from('settings').select('wifi_lock, allowed_networks').maybeSingle(),
      sb.rpc('my_network_ip'),
    ]);
    if (s.error) { setHTML(el, errorTpl(s.error)); return; }
    lock = s.data.wifi_lock;
    nets = [...(s.data.allowed_networks || [])];
    mine = ip.error ? null : ip.data;
    render();
  }

  const myInList = () => mine?.ip && nets.some((n) => ipInCidr(mine.ip, n));

  function render() {
    setHTML(el, html`
      <div class="page-head"><h2>شبكة الواي فاي</h2>
        ${lock ? html`<span class="badge badge-ok">🔒 القفل مفعّل</span>` : html`<span class="badge">🔓 القفل متوقف</span>`}</div>

      <div class="card section" style="max-width:640px">
        <p style="margin-bottom:10px">عند تفعيل القفل، <b>لا يستطيع أحد رؤية المنيو أو إرسال طلب إلا من شبكة الكافيه</b>.
          من يحفظ صورة QR ويحاول الطلب من خارج الكافيه سيُرفض طلبه من قاعدة البيانات مباشرة.</p>
        <p class="muted" style="font-size:13px">لوحة الكاشير والمطبخ لا تتأثر بالقفل.</p>
      </div>

      <div class="card section" style="max-width:640px">
        <h3 style="font-size:16px;margin-bottom:8px">عنوان شبكتك الآن</h3>
        ${mine?.ip ? html`<p><b class="num" dir="ltr">${mine.ip}</b>
            ${myInList() ? html` <span class="badge badge-ok">ضمن القائمة</span>` : html` <span class="badge badge-warn">ليس ضمن القائمة</span>`}</p>
          <p class="muted" style="font-size:13px;margin:6px 0 10px">تأكد أن هذا الجهاز متصل بواي فاي الكافيه (وليس بيانات الجوال) قبل استخدام هذا العنوان.</p>
          <button class="btn" data-use-mine type="button" ${myInList() ? html`disabled` : ''}>+ استخدم شبكتي الحالية</button>`
        : html`<p class="muted">تعذّر معرفة عنوان الشبكة الحالي.</p>`}
      </div>

      <div class="card section" style="max-width:640px">
        <h3 style="font-size:16px;margin-bottom:8px">الشبكات المسموحة</h3>
        <div data-list>${nets.length ? nets.map((n, i) => html`
          <div class="row" style="margin-bottom:8px" data-i="${i}">
            <input class="input num" dir="ltr" data-net value="${n}" style="flex:1" aria-label="عنوان الشبكة">
            <button class="btn btn-sm btn-danger" data-remove type="button">حذف</button>
          </div>`) : html`<p class="muted" style="margin-bottom:8px">لا توجد عناوين بعد.</p>`}</div>
        <button class="btn btn-sm" data-add type="button" ${nets.length >= 10 ? html`disabled` : ''}>+ إضافة عنوان يدوياً</button>

        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
        <label class="row" style="justify-content:space-between;margin-bottom:14px">
          <span><b>تفعيل القفل</b><br><span class="muted" style="font-size:13px">الطلب فقط من الشبكات أعلاه</span></span>
          ${switchTpl(html`data-lock`, lock, false, 'تفعيل القفل')}
        </label>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-gold" data-save type="button">حفظ</button>
      </div>

      <div class="card" style="max-width:640px">
        <h3 style="font-size:16px;margin-bottom:8px">⚠️ مهم</h3>
        <ul class="muted" style="font-size:13px;padding-inline-start:18px;line-height:1.9">
          <li>عنوان إنترنت الكافيه قد يتغير عند إعادة تشغيل الراوتر أو من مزوّد الإنترنت. إذا اشتكى الزبائن أن المنيو لا يفتح وهم على الواي فاي، افتح هذه الصفحة من جهاز متصل بالواي فاي واضغط "استخدم شبكتي الحالية" ثم "حفظ".</li>
          <li>الزبون الذي يستخدم بيانات الجوال (4G) لن يستطيع الطلب؛ ستظهر له رسالة تطلب الاتصال بالواي فاي.</li>
          <li>إذا كان للكافيه أكثر من خط إنترنت، أضف عنوان كل خط.</li>
        </ul>
      </div>`);
  }

  function collect() {
    return $$('[data-net]', el).map((i) => i.value.trim()).filter(Boolean);
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) return load();
    if (e.target.closest('[data-use-mine]') && mine?.suggested) {
      nets = collect(); nets.push(mine.suggested); lock = $('[data-lock]', el).checked; render(); return;
    }
    if (e.target.closest('[data-add]')) { nets = collect(); nets.push(''); lock = $('[data-lock]', el).checked; render(); $$('[data-net]', el).pop()?.focus(); return; }
    const rm = e.target.closest('[data-remove]');
    if (rm) { nets = collect(); const i = Number(rm.closest('[data-i]').dataset.i); nets.splice(i, 1); lock = $('[data-lock]', el).checked; render(); return; }

    const save = e.target.closest('[data-save]');
    if (save) {
      const err = $('.form-error', el);
      err.textContent = '';
      const list = collect();
      const enable = $('[data-lock]', el).checked;
      if (enable && !list.length) { err.textContent = 'أضف عنوان شبكة واحد على الأقل قبل تفعيل القفل.'; return; }
      if (enable && mine?.ip && !list.some((n) => ipInCidr(mine.ip, n))) {
        const ok = await confirmDialog('شبكتك الحالية ليست ضمن القائمة. إذا كنت داخل الكافيه الآن فالأرجح أن العنوان خاطئ وسيُمنع الزبائن من الطلب. هل تريد المتابعة؟', { okLabel: 'متابعة على أي حال', danger: true });
        if (!ok) return;
      }
      await withBusy(save, async () => {
        const { data, error } = await sb.rpc('set_wifi_lock', { p_enabled: enable, p_networks: list });
        if (error) { err.textContent = errMsg(error); return; }
        lock = data.wifi_lock;
        nets = [...data.allowed_networks];
        ctx.settings.wifi_lock = lock;
        render();
        toast(lock ? 'تم تفعيل قفل الواي فاي' : 'تم الحفظ — القفل متوقف', 'success');
      });
    }
  });

  load();
}

/** هل العنوان ضمن الشبكة؟ (IPv4 فقط للعرض؛ التحقق الحقيقي على السيرفر) */
function ipInCidr(ip, cidr) {
  const [net, bitsStr] = String(cidr).split('/');
  if (!ip.includes('.')) return true;          // IPv6: لا نحكم محلياً، السيرفر يتحقق
  if (!net.includes('.')) return false;
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  const toInt = (s) => s.split('.').reduce((a, o) => (a << 8) + (Number(o) & 255), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(net) & mask);
}
