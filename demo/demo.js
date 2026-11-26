// PrimeView — صفحة التجربة: التبويبات، الظهور عند التمرير، إعادة الضبط
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ظهور ناعم
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  $$('.reveal').forEach(function (el, i) { el.style.setProperty('--d', (i % 4) * 0.08 + 's'); io.observe(el); });

  // تبويبات المطبخ / الكاشير
  var tabs = $('.live-tabs');
  var pill = $('.tabs-pill');
  var URLS = { kitchen: ['المطبخ', 'app/kitchen.html?as=kitchen'], casher: ['الكاشير والإدارة', 'app/casher.html?as=manager'] };
  function place() {
    var on = tabs.querySelector('.is-on');
    pill.style.insetInlineStart = (tabs.getBoundingClientRect().right - on.getBoundingClientRect().right) + 'px';
    pill.style.width = on.offsetWidth + 'px';
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    var v = b.dataset.view;
    $$('.live-tabs [data-view]').forEach(function (x) { x.classList.toggle('is-on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    $$('.screen-frame .view').forEach(function (f) {
      var on = f.dataset.view === v;
      if (on && !f.src && f.dataset.src) f.src = f.dataset.src;   // الكاشير يُحمَّل عند أول فتح
      f.classList.toggle('is-on', on);
    });
    $('#screenUrl').textContent = URLS[v][0];
    $('#openFull').href = URLS[v][1];
    place();
  });
  place();
  addEventListener('resize', place);
  if (document.fonts) document.fonts.ready.then(place);

  // إعادة الضبط: نفس مفتاح قاعدة البيانات الوهمية
  $('#resetBtn').addEventListener('click', function () {
    if (!confirm('مسح كل ما جرّبته والبدء ببيانات جديدة؟')) return;
    try {
      localStorage.removeItem('pv-demo-db-v1');
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('mrblack-cart-') === 0) localStorage.removeItem(k); });
    } catch (e) { /* تجاهل */ }
    try { new BroadcastChannel('pv-demo').postMessage({ kind: 'reset' }); } catch (e) { /* تجاهل */ }
    location.reload();
  });

  // الوضع النهاري/الليلي
  $('#themeBtn').addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pv-theme', next); } catch (e) { /* تجاهل */ }
  });
})();
