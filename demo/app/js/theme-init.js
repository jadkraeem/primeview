// Mr Black — اختيار الوضع (نهاري/ليلي) قبل رسم الصفحة لتجنّب الوميض.
// افتراضياً تلقائي: نهاري من 6 صباحاً حتى 6 مساءً. الاختيار اليدوي يبقى لنفس اليوم فقط.
(function () {
  var t = null;
  try {
    var saved = JSON.parse(localStorage.getItem('mrblack-theme') || 'null');
    var today = new Date().toDateString();
    if (saved && saved.day === today && (saved.t === 'light' || saved.t === 'dark')) t = saved.t;
  } catch (e) { /* تجاهل */ }
  if (!t) {
    var h = new Date().getHours();
    t = h >= 6 && h < 18 ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
})();
