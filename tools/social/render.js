// =========================================================
// PrimeView — توليد صور وفيديوهات السوشيال ميديا من kit.html
// التشغيل (من مجلد primeview):
//   NODE_PATH=C:/Users/acer/Desktop/MrBlack-Video/node_modules node tools/social/render.js [images|reels|all] [name,name]
// الناتج: C:/Users/acer/Desktop/PrimeView-Social/
// =========================================================
const puppeteer = require('puppeteer-core');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/acer/Desktop/PrimeView-Social';
const SITE_ASSETS = path.join(__dirname, '..', '..', 'assets');
const KIT = 'file:///' + path.join(__dirname, 'kit.html').split(path.sep).join('/');

// الأسعار كما في صفحة الإعدادات (حدّثها هنا إذا تغيّرت الأسعار ثم أعد التوليد)
const PLANS = {
  currency: '$',
  items: [
    { name: 'المنيو الرقمي', monthly: 8, setup: 50, featured: false, features: ['منيو عبر QR بهوية مقهاك', 'تعديل الأصناف والأسعار بنفسك'] },
    { name: 'نظام الطلبات', monthly: 25, setup: 120, featured: true, features: ['الطلب من الطاولة مباشرة', 'شاشة مطبخ بتنبيه صوتي'] },
    { name: 'النظام الكامل', monthly: 40, setup: 200, featured: false, features: ['محاسبة، ورديات، وأرباح', 'مخزون وجرد وتقارير'] },
  ],
};

const IMAGES = {
  'avatar': '01-profile-picture',
  'avatar-name': '02-profile-picture-with-name',
  'fb-cover': '03-facebook-cover',
  'og': '04-link-preview',
  'post-1': 'post-1-welcome',
  'post-2': 'post-2-services',
  'post-3': 'post-3-qr-menu',
  'post-4': 'post-4-kitchen-cashier',
  'post-5': 'post-5-pricing',
  'post-6': 'post-6-try-demo',
  'post-7': 'post-7-day-night',
  'post-8': 'post-8-process',
  'post-9': 'post-9-reports',
  'post-10': 'post-10-inventory',
  'post-11': 'post-11-nfc-loyalty',
  'post-12': 'post-12-why',
  'story': 'story-try-demo',
};
const REELS = { 'reel-menu': 'reel-1-qr-menu', 'reel-system': 'reel-2-cashier-system', 'reel-themes': 'reel-3-day-night' };

const mode = process.argv[2] || 'all';
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.evaluateOnNewDocument((plans) => { window.PLANS = plans; }, PLANS);
  // دقة عالية جداً: 2x لكل الصور (ملفات حادة للطباعة والشاشات الكبيرة)
  const SCALE = Number(process.env.SCALE || 2);
  const open = async (t, scale = SCALE) => {
    await p.goto(`${KIT}?t=${t}`, { waitUntil: 'networkidle0' });
    const k = await p.evaluate(() => window.KIT);
    await p.setViewport({ width: k.w, height: k.h, deviceScaleFactor: scale });
    await p.evaluate(() => window.ready);
    return k;
  };

  if (mode === 'images' || mode === 'all') {
    for (const [t, name] of Object.entries(IMAGES)) {
      if (only && !only.includes(t)) continue;
      await open(t);
      await p.screenshot({ path: `${OUT}/${name}.png` });
      if (t === 'og') await p.screenshot({ path: path.join(SITE_ASSETS, 'og.jpg'), type: 'jpeg', quality: 86 });
      console.log('✓', name);
    }
  }
  if (mode === 'reels' || mode === 'all') {
    for (const [t, name] of Object.entries(REELS)) {
      if (only && !only.includes(t)) continue;
      const k = await open(t, 1);  // الفيديو بدقة 1080 القياسية (إنستغرام يحددها)
      const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-movflags', '+faststart', '-an', `${OUT}/${name}.mp4`]);
      ff.stderr.on('data', (d) => process.stderr.write(d));
      const n = Math.round(k.dur * 30);
      for (let i = 0; i < n; i++) {
        await p.evaluate((x) => renderAt(x), i / 30);
        const buf = await p.screenshot({ type: 'jpeg', quality: 90 });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      await p.evaluate((x) => renderAt(x), k.poster);
      await p.screenshot({ path: `${OUT}/${name}-cover.jpg`, type: 'jpeg', quality: 88 });
      console.log('✓', name, n, 'frames');
    }
  }
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
