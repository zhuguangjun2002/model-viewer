/* 「每一栏的环境光照都一样吗」——把同一个模型同时开在两栏，量两块画布的亮度。
 *
 *   npm run dev            （另一个终端）
 *   npm run test:env       或  URL=http://localhost:5174/ npm run test:env
 *
 * ── 为什么要有这条 ────────────────────────────────────────────
 * 环境贴图（PMREM）是**渲染目标纹理**，绑死在生成它的那个 WebGL 上下文里。
 * 每一栏都有自己的 renderer / 自己的上下文，所以贴图**必须每栏各生成一份**。
 * 以前是模块级单例：第一栏生成、后面几栏共用 —— 第二栏拿到的是"别人上下文里的纹理"，
 * 等于没有 IBL，整个模型发灰发暗。
 * ⚠ 这个病**只看第一栏永远发现不了**，而且不报任何错。只能同时开两栏、比亮度。 */
import puppeteer from 'puppeteer-core';

const URL = process.env.URL ?? 'http://localhost:5173/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });

/* 两栏开**同一个**模型：亮度只要有差，就只可能是渲染这一侧的事。 */
const panes = await page.$$('.pane');
for (const p of panes.slice(0, 2)) {
  const b = await p.$$('.samples button');
  await b[0].click();                          // 第一个样例（V-22 FlightGear）
}
await page.waitForFunction(
  () => [...document.querySelectorAll('.report')].filter((r) => r.querySelector('table')).length >= 2,
  { timeout: 90000 },
);
await new Promise((r) => setTimeout(r, 2000));  // 等动画/阻尼停下来

/** 一块画布的平均亮度（0~1）。只取模型所在的中间区域，别把大片背景算进来。 */
const lum = async (i) => {
  const shot = await (await page.$$('.pane canvas'))[i].screenshot({ encoding: 'binary' });
  const png = await import('node:zlib').then(() => shot);
  return png;                                   // 交给下面统一算
};
const shots = [await lum(0), await lum(1)];

/* 不引第三方图片库：把 PNG 交回页面，用 canvas 解码取像素。 */
const means = [];
for (const buf of shots) {
  const b64 = Buffer.from(buf).toString('base64');
  means.push(await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    /* 只量中间 60%×60%：模型在那儿，四周基本是背景。 */
    const x0 = (img.width * 0.2) | 0, y0 = (img.height * 0.2) | 0;
    const w = (img.width * 0.6) | 0, h = (img.height * 0.6) | 0;
    const d = g.getImageData(x0, y0, w, h).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 4) / 255;
  }, b64));
}

const [a, b] = means;
const diff = Math.abs(a - b) / Math.max(a, b);
console.log(`第一栏平均亮度 ${a.toFixed(4)}   第二栏 ${b.toFixed(4)}   相对差 ${(diff * 100).toFixed(1)}%`);
if (errors.length) console.log('页面报错：\n  ' + errors.join('\n  '));

const OK = diff <= 0.05;
console.log(OK ? '✓ 两栏亮度一致（环境光照每栏各一份）'
  : '✗ 两栏亮度差太多 —— 多半又是环境贴图跨上下文共用了（见 pane.js 的 getEnvMap）');
await browser.close();
process.exit(OK && !errors.length ? 0 : 1);
