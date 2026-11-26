const puppeteer = require('puppeteer-core');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const path = require('path');
const V = __dirname;
const OUT = 'C:/Users/acer/Desktop/primeview/assets/work';
const mode = process.argv[2];               // preview | render
const clips = (process.argv[3] || 'menu,casher,themes').split(',');
const FPS = 30;
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (const c of clips) {
    await p.goto('file:///' + path.join(V, 'scene.html').split(path.sep).join('/') + '?clip=' + c, { waitUntil: 'networkidle0' });
    await p.evaluate(() => window.ready);
    const { dur, poster } = await p.evaluate(() => window.CLIP);
    if (mode === 'preview') {
      for (const t of [0.4, poster, dur * 0.55, dur - 0.3]) {
        await p.evaluate((t) => renderAt(t), t);
        await p.screenshot({ path: `${V}/prev-${c}-${t.toFixed(1)}.jpg`, type: 'jpeg', quality: 80 });
      }
      console.log(c, 'previews done');
      continue;
    }
    const out = `${OUT}/mrblack-${c}.mp4`;
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', '-an', out]);
    ff.stderr.on('data', (d) => process.stderr.write(d));
    const n = Math.round(dur * FPS);
    for (let i = 0; i < n; i++) {
      await p.evaluate((t) => renderAt(t), i / FPS);
      const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    await p.evaluate((t) => renderAt(t), poster);
    await p.screenshot({ path: `${OUT}/mrblack-${c}.jpg`, type: 'jpeg', quality: 80 });
    console.log(c, 'rendered', n, 'frames ->', out);
  }
  await b.close();
})().catch((e) => { console.log('FAIL', e.message); process.exit(1); });
