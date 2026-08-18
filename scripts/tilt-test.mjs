// 验证短舱倾转在几何上是真的正确，而不是"看着动了就行"。
//
// 判据（不靠肉眼）：
//   直升机模式 —— 旋翼轴接近垂直（世界 Y），桨毂在机翼上方
//   飞机模式   —— 旋翼轴接近水平且指向机头，桨毂在机翼前方
// 另外旋翼桨毂必须跟着短舱一起动；如果层级挂错（旋翼是短舱的兄弟节点），
// 它会纹丝不动 —— 这个测试就是抓这个的。
import puppeteer from 'puppeteer-core';
import { requireV22 } from './require-v22.mjs';

await requireV22(process.env.URL ?? 'http://localhost:5173/');

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle0' });

await page.$eval('.pane:last-child .close', (e) => e.click());
await page.$eval('.pane .samples button', (e) => e.click());
await page.waitForFunction(() => document.querySelector('.report table'), { timeout: 60000 });

// 机头朝哪个轴，不硬编码：用前起落架和尾部货舱门的位置现推。
// 这样坐标系约定一改，测试不会跟着悄悄失效。
const nose = await page.evaluate(() => {
  const m = globalThis.__app.panes[0].model;
  m.updateMatrixWorld(true);
  const at = (n) => { const e = m.getObjectByName(n).matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const [g, r] = [at('TrainAvant'), at('PorteCargoHaute')]; // 前起落架 vs 尾部货舱斜板
  const d = g.map((v, i) => v - r[i]);
  const len = Math.hypot(...d);
  const axis = d.map((v) => v / len).map((v) => Math.round(v));
  return { axis, i: axis.findIndex((v) => v !== 0) };
});
console.log(`机身轴向：机头指向 ${JSON.stringify(nose.axis)}（由前起落架 − 尾部货舱门推出）`);

const probe = async (deg) =>
  page.evaluate(async (d) => {
    const { setAngle } = await import('/src/parts.js');
    const pane = globalThis.__app.panes[0];

    const tilt = pane.pivots.find((p) => p.name === 'LesMoteurs');
    setAngle(tilt, d);
    pane.model.updateMatrixWorld(true);

    const hub = pane.model.getObjectByName('HeliceGauche');
    const spin = pane.pivots.find((p) => p.name === 'HeliceGauche');

    // 直接读世界矩阵，绕开在浏览器里 import 'three' 的模块解析问题。
    // e 是列主序的 4x4：前 3 列是基向量，第 4 列是平移。
    const e = hub.matrixWorld.elements;
    const { x, y, z } = spin.axis; // 旋翼自转轴（局部）
    const axis = [
      e[0] * x + e[4] * y + e[8] * z,
      e[1] * x + e[5] * y + e[9] * z,
      e[2] * x + e[6] * y + e[10] * z,
    ];
    const len = Math.hypot(...axis) || 1;
    const r = (n) => Math.round(n * 100) / 100;
    return {
      axis: axis.map((v) => r(v / len)),
      pos: [r(e[12]), r(e[13]), r(e[14])],
    };
  }, deg);

const a = await probe(0);
const b = await probe(90);

// glTF 世界坐标 Y 向上。机身轴向由上面推出，不写死。
const vert = (v) => Math.abs(v.axis[1]);                    // 越接近 1 = 旋翼轴垂直、桨盘水平（直升机）
const along = (v) => Math.abs(v.axis[nose.i]);              // 越接近 1 = 旋翼轴顺着机身（飞机）
const fwd = (p) => p[nose.i] * nose.axis[nose.i];           // 沿机头方向的投影
const moved = Math.hypot(...a.pos.map((v, i) => v - b.pos[i]));

console.log(`  0°: 旋翼轴 ${JSON.stringify(a.axis)}  桨毂 ${JSON.stringify(a.pos)}  轴垂直度 ${vert(a).toFixed(2)}`);
console.log(` 90°: 旋翼轴 ${JSON.stringify(b.axis)}  桨毂 ${JSON.stringify(b.pos)}  轴垂直度 ${vert(b).toFixed(2)}`);
console.log(`桨毂随短舱移动了 ${moved.toFixed(2)} m`);

const ok = [];
ok.push([moved > 0.5, `旋翼跟着短舱动了（${moved.toFixed(2)} m）—— 层级正确`]);
ok.push([vert(a) > 0.9, '0° 是直升机模式（旋翼轴垂直、桨盘水平）']);
ok.push([along(b) > 0.9, '90° 是飞机模式（旋翼轴顺着机身、桨盘竖直）']);
// 变成飞机模式时短舱必须朝机头倒。轴的正负号只代表转向（顺/逆时针），
// 左右旋翼本来就反向旋转（抵消扭矩），别拿符号当错误——只看桨毂往哪边挪。
ok.push([fwd(b.pos) > fwd(a.pos), `短舱朝机头倒（桨毂沿机身前移 ${(fwd(b.pos) - fwd(a.pos)).toFixed(2)} m）`]);

for (const [pass, msg] of ok) console.log(`${pass ? '✅' : '❌'} ${msg}`);

for (const deg of [0, 45, 90]) {
  await probe(deg);
  await page.screenshot({ path: `tilt-${deg}.png` });
}
console.log('已截图 tilt-0/45/90.png');

await browser.close();
process.exit(ok.every(([p]) => p) ? 0 : 1);
