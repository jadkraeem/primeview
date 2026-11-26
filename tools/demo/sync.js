// =========================================================
// PrimeView — نسخ نظام الكافيه إلى النسخة التجريبية
// يقرأ من مجلد Mr Black (لا يعدّل فيه شيئاً) ويكتب في demo/app.
// التغييرات الوحيدة على النسخة:
//   1. مكتبة Supabase تُستبدل بقاعدة البيانات الوهمية vendor/demo-backend.js
//   2. config.js بلا أي رابط أو مفتاح حقيقي
//   3. سياسة الأمان (CSP) لا تسمح بأي اتصال خارجي
// التشغيل:  node tools/demo/sync.js
// =========================================================
const fs = require('fs');
const path = require('path');

const SRC = process.env.CAFE_SRC || 'C:/Users/acer/Desktop/cafeteria';
const OUT = path.join(__dirname, '..', '..', 'demo', 'app');

const copyDir = (from, to, skip = () => false) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    if (skip(a)) continue;
    if (f.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b);
  }
};

copyDir(path.join(SRC, 'css'), path.join(OUT, 'css'));
copyDir(path.join(SRC, 'js'), path.join(OUT, 'js'), (p) => path.basename(p) === 'config.js');
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(SRC, 'vendor', 'qrcode.js'), path.join(OUT, 'vendor', 'qrcode.js'));

fs.writeFileSync(path.join(OUT, 'js', 'config.js'), `// النسخة التجريبية: لا يوجد أي سيرفر حقيقي. كل البيانات وهمية داخل المتصفح.
export const SUPABASE_URL = 'https://demo.invalid';
export const SUPABASE_PUBLISHABLE_KEY = 'demo';
export const AI_WORKER_URL = 'https://demo-assistant.invalid';
export const STAFF_FUNCTION_URL = 'https://demo.invalid/functions/v1/manage-staff';
`);

for (const page of ['index.html', 'casher.html', 'kitchen.html']) {
  let html = fs.readFileSync(path.join(SRC, page), 'utf8');
  const before = html;
  html = html.replace('<script src="vendor/supabase.js"></script>', '<script src="vendor/demo-backend.js"></script>');
  if (html === before) throw new Error(`${page}: لم أجد سطر مكتبة Supabase`);
  html = html.replace(/connect-src [^;"]+/, "connect-src 'self'");
  html = html.replace('<title>', '<meta name="robots" content="noindex">\n  <title>تجربة | ');
  fs.writeFileSync(path.join(OUT, page), html);
}

// تأكد أنه لا يوجد أي رابط أو مفتاح حقيقي في النسخة
const leaks = [];
const scan = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((f) => {
  const p = path.join(dir, f.name);
  if (f.isDirectory()) return scan(p);
  if (!/\.(js|html|css)$/.test(f.name) || f.name === 'qrcode.js') return;
  const t = fs.readFileSync(p, 'utf8');
  if (/wsgpvqwapdpmpqsdjbks|sb_publishable_|workers\.dev/.test(t)) leaks.push(path.relative(OUT, p));
});
scan(OUT);
if (leaks.length) throw new Error('روابط حقيقية ما زالت موجودة في: ' + leaks.join(', '));
console.log('تم نسخ النظام إلى', OUT);
