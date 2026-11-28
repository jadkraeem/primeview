// =========================================================
// PrimeView — عامل الخدمة (Service Worker) للتطبيق
// الاستراتيجية: الشبكة أولاً.
//   - مع الإنترنت: كل ملف من السيرفر (آخر نسخة دائماً)، وتُحفظ نسخة احتياطية.
//   - بدون إنترنت: آخر نسخة محفوظة، أو صفحة "لا يوجد اتصال" بهوية PrimeView.
// لا يلمس: Supabase والخطوط (نطاقات أخرى)، أي طلب غير GET، وطلبات الفيديو المجزّأة (Range).
// عند تغيير منطق هذا الملف: غيّر رقم النسخة حتى تُحذف النسخ القديمة.
// =========================================================
const CACHE = 'primeview-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_PAGE = '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>لا يوجد اتصال | PrimeView</title>'
  + '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6efe3;color:#1b2b2c;font-family:IBM Plex Sans Arabic,system-ui,sans-serif;text-align:center;padding:24px">'
  + '<div>'
  + '<div style="display:inline-grid;place-items:center;width:64px;height:64px;border-radius:20px;background:linear-gradient(120deg,#0e9f6e,#2bb3a3 50%,#5bbfe9)">'
  + '<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#f6efe3"><span style="width:10px;height:10px;border-radius:50%;background:#0e9f6e"></span></span></div>'
  + '<div dir="ltr" style="font-family:Readex Pro,system-ui,sans-serif;font-weight:700;font-size:30px;margin-top:14px">Prime<span style="color:#0e9f6e">View</span></div>'
  + '<h2 style="margin:14px 0 6px;font-size:20px">لا يوجد اتصال بالإنترنت</h2>'
  + '<p style="color:#66675c;margin:0">تحقق من الشبكة ثم أعد فتح التطبيق.</p>'
  + '</div></body></html>';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return;          // الفيديو يُبثّ على أجزاء: نتركه للمتصفح
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const isPage = req.mode === 'navigate';
        const cached = await caches.match(req, { ignoreSearch: isPage });
        if (cached) return cached;
        if (isPage) return new Response(OFFLINE_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        return Response.error();
      }),
  );
});
