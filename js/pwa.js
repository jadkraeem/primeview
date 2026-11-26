// =========================================================
// PrimeView — تفعيل التطبيق (PWA)
// 1) تسجيل عامل الخدمة (sw.js)
// 2) زر "ثبّت التطبيق" على صفحة الإعدادات فقط (لصاحب الموقع)، لا يزعج زوّار الموقع
//    - أندرويد/كروم: نافذة التثبيت الرسمية
//    - آيفون: تلميح «مشاركة ← إضافة إلى الشاشة الرئيسية»
// =========================================================
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* غير مدعوم: الموقع يعمل عادي */ });
    });
  }

  var page = (location.pathname.split('/').pop() || 'index.html');
  var installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (page !== 'admin.html' || installed) return;

  var KEY = 'pv-install-hint';
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5) return; } catch (e) { /* تجاهل */ }
  function remember() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* تجاهل */ } }

  var css = document.createElement('style');
  css.textContent =
    '.pv-install{position:fixed;z-index:9000;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;'
    + 'max-width:calc(100% - 24px);padding:8px 8px 8px 14px;border-radius:999px;background:var(--card,#fffaf2);color:var(--text,#1b2b2c);'
    + 'box-shadow:0 14px 34px -12px rgba(30,40,30,.45),inset 0 0 0 1px var(--line,#e3d6bf);font:600 14px/1.4 "IBM Plex Sans Arabic",system-ui,sans-serif;direction:rtl}'
    + '.pv-install b{color:var(--emerald-ink,#0a7552)}'
    + '.pv-install button{border:0;cursor:pointer;font:inherit;border-radius:999px;padding:7px 14px}'
    + '.pv-install .pv-go{background:linear-gradient(120deg,#0e9f6e,#2bb3a3 50%,#5bbfe9);color:#fff;font-weight:800}'
    + '.pv-install .pv-x{background:transparent;color:var(--muted,#66675c);padding:7px 10px}';

  function show(html, onGo) {
    if (document.querySelector('.pv-install')) return;
    document.head.appendChild(css);
    var el = document.createElement('div');
    el.className = 'pv-install';
    el.setAttribute('role', 'status');
    el.innerHTML = html + (onGo ? '<button type="button" class="pv-go">ثبّت</button>' : '')
      + '<button type="button" class="pv-x" aria-label="إغلاق">✕</button>';
    el.querySelector('.pv-x').onclick = function () { remember(); el.remove(); };
    if (onGo) el.querySelector('.pv-go').onclick = function () { onGo(el); };
    document.body.appendChild(el);
  }

  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    var promptEvent = e;
    show('📲 ثبّت <b>إعدادات PrimeView</b> كتطبيق على هذا الجهاز', function (el) {
      el.remove();
      promptEvent.prompt();
      promptEvent.userChoice.finally(remember);
    });
  });

  var ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    addEventListener('load', function () {
      setTimeout(function () { show('📲 للتثبيت كتطبيق: اضغط <b>مشاركة ⬆️</b> ثم <b>«إضافة إلى الشاشة الرئيسية»</b>'); }, 2500);
    });
  }
})();
