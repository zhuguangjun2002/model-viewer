import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',   // WSL 没有 GPU，用软件光栅化跑 WebGL
    '--enable-unsafe-swiftshader',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

// dev server 端口可能被占用而漂移，用 URL 环境变量覆盖：URL=http://localhost:5174/ npm run smoke
await page.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle0' });

// 左栏：小飞机  右栏：PBR 头盔（两个不同的模型，正好演示对比）
const panes = await page.$$('.pane');
console.log(`面板数：${panes.length}`);

const load = async (paneIdx, sampleIdx) => {
  const buttons = await panes[paneIdx].$$('.samples button');
  await buttons[sampleIdx].click();
};

await load(0, 0);
await load(1, 1);

// 等两栏的报告都渲染出来
await page.waitForFunction(
  () => [...document.querySelectorAll('.report')].filter((r) => r.querySelector('table')).length === 2,
  { timeout: 90000 },
);
await new Promise((r) => setTimeout(r, 1500));

// 把两栏的关键指标读出来
const summary = await page.evaluate(() =>
  [...document.querySelectorAll('.pane')].map((p) => ({
    name: p.querySelector('.report h2')?.childNodes[0]?.textContent?.trim(),
    grade: p.querySelector('.grade')?.textContent,
    rows: Object.fromEntries(
      [...p.querySelectorAll('.report tr')].map((tr) => [
        tr.cells[0].textContent, tr.cells[1].textContent,
      ]),
    ),
    notes: [...p.querySelectorAll('.note')].map((n) => `${n.className.replace('note ', '')}: ${n.textContent.trim()}`),
    canvasBlank: (() => {
      const c = p.querySelector('canvas');
      return !c || c.width === 0;
    })(),
  })),
);

console.log(JSON.stringify(summary, null, 2));
await page.screenshot({ path: 'smoke-shot.png' });

console.log(errors.length ? `\n❌ 报错 ${errors.length} 条：\n${errors.join('\n')}` : '\n✅ 无 console 报错');
await browser.close();
