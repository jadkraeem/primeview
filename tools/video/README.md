# صناعة فيديوهات "أعمالنا"

يحوّل لقطات شاشة حقيقية إلى فيديوهات قصيرة متحركة (1280×800، mp4) مع شعار PrimeView.

- `scene.html`: المشاهد (menu، casher، themes). كل مشهد له `build()` و `at(t)`.
- `render.js`: يصوّر المشهد إطاراً إطاراً ويحوّله إلى mp4 في `assets/work/`.

التشغيل (يحتاج puppeteer-core و ffmpeg-static من مجلد MrBlack-Video):

```
NODE_PATH=C:/Users/acer/Desktop/MrBlack-Video/node_modules node render.js preview   # صور للمراجعة
NODE_PATH=C:/Users/acer/Desktop/MrBlack-Video/node_modules node render.js render    # الفيديوهات
```

استعمل لقطات من حساب تجريبي فقط، بدون بيانات زبائن حقيقية.
