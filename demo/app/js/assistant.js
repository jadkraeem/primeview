// =========================================================
// Mr Black — مساعد الذكاء الاصطناعي (للموظفين المسجّلين فقط)
// =========================================================
import { sb, html, setHTML, $, withBusy } from './common.js';
import { AI_WORKER_URL } from './config.js';

const MAX_Q = 1000;      // نفس الحد المفروض في الـ Worker
const MAX_HISTORY = 10;  // آخر 10 رسائل فقط تُرسل

export function mountAssistant(profile) {
  const history = [];

  const fab = document.createElement('button');
  fab.className = 'btn btn-gold ai-fab no-print';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'المساعد الذكي');
  fab.textContent = '✦';

  const panel = document.createElement('section');
  panel.className = 'ai-panel hidden no-print';
  panel.setAttribute('aria-label', 'المساعد الذكي');
  setHTML(panel, html`
    <div class="ai-head"><b>المساعد الذكي</b>
      <div class="row"><button class="btn btn-sm btn-ghost" data-clear type="button">محادثة جديدة</button>
      <button class="btn btn-sm btn-ghost btn-icon" data-x type="button" aria-label="إغلاق">✕</button></div></div>
    <div class="ai-msgs" aria-live="polite">
      <div class="ai-msg assistant">أهلاً ${profile.full_name}! اسألني عن الطلبات، المبيعات، المخزون، المنيو، أو أي سؤال عام.</div>
    </div>
    <form class="ai-form">
      <textarea class="input" rows="1" maxlength="${MAX_Q}" placeholder="اكتب سؤالك…" aria-label="السؤال"></textarea>
      <button class="btn btn-gold" type="submit">إرسال</button>
    </form>
    <div class="ai-hint"><span data-count>0</span>/${MAX_Q} · قد يخطئ المساعد، تحقّق من الأرقام المهمة.</div>`);

  document.body.append(fab, panel);
  const msgs = $('.ai-msgs', panel);
  const form = $('form', panel);
  const ta = $('textarea', panel);

  const add = (role, text) => {
    const d = document.createElement('div');
    d.className = `ai-msg ${role}`;
    d.textContent = text;            // نص فقط: لا HTML إطلاقاً
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  };

  fab.onclick = () => { panel.classList.toggle('hidden'); if (!panel.classList.contains('hidden')) ta.focus(); };
  $('[data-x]', panel).onclick = () => panel.classList.add('hidden');
  $('[data-clear]', panel).onclick = () => {
    history.length = 0;
    [...msgs.children].slice(1).forEach((c) => c.remove());
  };
  ta.addEventListener('input', () => {
    $('[data-count]', panel).textContent = ta.value.length;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = ta.value.trim();
    if (!q) return;
    if (q.length > MAX_Q) { add('error', `السؤال طويل جداً (الحد ${MAX_Q} حرف).`); return; }
    if (AI_WORKER_URL.includes('WORKERS_SUBDOMAIN')) { add('error', 'المساعد غير مُعدّ بعد.'); return; }

    add('user', q);
    ta.value = '';
    ta.dispatchEvent(new Event('input'));
    history.push({ role: 'user', content: q });
    const pending = add('assistant', '…');

    await withBusy(form.querySelector('button'), async () => {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw Object.assign(new Error(), { status: 401 });
        const res = await fetch(AI_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(body.error || ''), { status: res.status });
        pending.textContent = body.reply || '…';
        history.push({ role: 'assistant', content: String(body.reply || '').slice(0, 2000) });
      } catch (err) {
        history.pop();
        pending.remove();
        const s = err.status;
        add('error',
          s === 401 ? 'انتهت الجلسة. سجّل الدخول من جديد.'
          : s === 403 ? 'ليس لديك صلاحية لاستخدام المساعد.'
          : s === 429 ? 'أسئلة كثيرة خلال وقت قصير. انتظر دقيقة ثم حاول.'
          : err.message && /[؀-ۿ]/.test(err.message) ? err.message
          : 'تعذّر الوصول إلى المساعد. تحقق من الإنترنت وحاول مرة أخرى.');
      }
    });
  });
}
