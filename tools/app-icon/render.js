// =========================================================
// PrimeView — أيقونات التطبيق من شعار المقهى
// القاعدة: أيقونة أي تطبيق نعمله = شعار المقهى نفسه (نفس الخط والألوان والنص).
// التشغيل:
//   NODE_PATH=C:/Users/acer/Desktop/MrBlack-Video/node_modules node render.js <brand.json> <outDir>
// brand.json مثال: brands/daily-dose.json
// الناتج: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
// =========================================================
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const [brandFile, OUT] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
const KIT = 'file:///' + path.join(__dirname, 'logo-icon.html').split(path.sep).join('/');
// [المقاس, الوضع, الاسم] — الوضع: 0 مدوّر، 1 أندرويد قابل للقص، 2 آيفون مربع
const jobs = [[512, 0, 'icon-512.png'], [192, 0, 'icon-192.png'], [512, 1, 'icon-maskable-512.png'], [180, 2, 'apple-touch-icon.png']];
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  for (const [size, mask, name] of jobs) {
    await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await p.goto(`${KIT}?size=${size}&maskable=${mask}&cfg=${encodeURIComponent(JSON.stringify(cfg))}`, { waitUntil: 'networkidle0' });
    await p.evaluate(() => window.ready);
    // آيفون يقصّ الزوايا بنفسه، فأيقونته مربعة كاملة بلا شفافية
    await p.screenshot({ path: path.join(OUT, name), omitBackground: mask === 0, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('✓', name);
  }
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
