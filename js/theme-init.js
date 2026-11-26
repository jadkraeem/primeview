// PrimeView — اختيار الوضع قبل رسم الصفحة لتجنّب الوميض.
// الافتراضي: حسب إعداد الجهاز. الاختيار اليدوي يُحفظ.
(function () {
  var t = null;
  try { t = localStorage.getItem('pv-theme'); } catch (e) { /* تجاهل */ }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
})();
