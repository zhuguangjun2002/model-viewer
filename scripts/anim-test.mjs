// 验证动画面板：加载 F-35（3 段动画），逐段单独播放，
// 量各段动画目标节点的四元数/位移是否真的只在播放那一段时变化。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(process.env.URL ?? 'http://localhost:5199/', { waitUntil: 'networkidle0' });

// 直接往第一栏加载 F-35
await page.evaluate(() => globalThis.__app.panes[0].loadURL('/models/f35.glb'));
await page.waitForFunction(
  () => document.querySelector('.pane .report table') !== null,
  { timeout: 60000 },
);

// 面板上应有 3 行动画控件
const panel = await page.evaluate(() => {
  const pane = document.querySelector('.pane');
  const rows = [...pane.querySelectorAll('.parts-panel .part')];
  return rows.map((r) => ({
    label: r.querySelector('label').textContent,
    max: r.querySelector('input[type=range]').max,
    checked: r.querySelector('.spin-toggle input').checked,
  }));
});
console.log('动画面板行：', JSON.stringify(panel, null, 2));

// 快照整个模型的节点姿态（四元数+位置），返回 name -> 序列化串
const snapshot = () =>
  page.evaluate(() => {
    const out = {};
    globalThis.__app.panes[0].model.traverse((o) => {
      out[o.uuid] = {
        name: o.name,
        q: o.quaternion.toArray().map((v) => v.toFixed(4)).join(','),
        p: o.position.toArray().map((v) => v.toFixed(4)).join(','),
      };
    });
    return out;
  });

// 只播第 idx 段，其他全部暂停；等 600ms 后对比姿态
const soloPlay = async (idx) => {
  await page.evaluate((i) => {
    const items = globalThis.__app.panes[0].animItems;
    items.forEach((it, j) => {
      it.box.checked = j === i;
      if (j === i) it.play();
      else it.action.paused = true;
    });
  }, idx);
};

// 全部暂停，取基准
await page.evaluate(() => {
  for (const it of globalThis.__app.panes[0].animItems) {
    it.box.checked = false;
    it.action.paused = true;
  }
});
await new Promise((r) => setTimeout(r, 300));
const base = await snapshot();

const moved = [];
for (let i = 0; i < 3; i++) {
  await soloPlay(i);
  await new Promise((r) => setTimeout(r, 700));
  const now = await snapshot();
  const changed = Object.keys(now).filter(
    (k) => now[k].q !== base[k].q || now[k].p !== base[k].p,
  ).map((k) => now[k].name);
  moved.push(changed);
  // 暂停当前段，姿态定格——不重置也没关系，下一轮对比仍以 base 为参照，
  // 所以每轮先把上一轮的时间拨回 0 再对比
  await page.evaluate((i) => {
    const it = globalThis.__app.panes[0].animItems[i];
    it.box.checked = false;
    it.action.play();
    it.action.paused = true;
    it.action.time = 0;
    globalThis.__app.panes[0].mixer.update(0);
  }, i);
  await new Promise((r) => setTimeout(r, 200));
}

moved.forEach((names, i) => {
  console.log(`\n片段 ${i} 播放时动了 ${names.length} 个节点：${names.slice(0, 12).join('、')}`);
});

// 断言:每段都动了节点,且三段动的节点集合不完全相同
const sets = moved.map((m) => new Set(m));
const allMoved = moved.every((m) => m.length > 0);
const distinct =
  JSON.stringify([...sets[0]].sort()) !== JSON.stringify([...sets[1]].sort()) ||
  JSON.stringify([...sets[1]].sort()) !== JSON.stringify([...sets[2]].sort());
console.log(allMoved && distinct
  ? '\n✅ 三段动画都能单独驱动，且驱动的部件不同'
  : '\n❌ 有动画没生效或无法区分');

await page.screenshot({ path: 'f35-anim.png' });
console.log(errors.length ? `\n❌ 报错：\n${errors.join('\n')}` : '无 console 报错');
await browser.close();
process.exit(allMoved && distinct ? 0 : 1);
