// 回归测试：关掉一栏必须真正释放，不许假死、不许泄漏。
//
// 曾经的两个 bug（都已修复，此测试防回归）：
// 1. removePane 先摘 DOM 再 dispose，OrbitControls 挂在 document 上的 keydown
//    监听摘不掉，死栏被 document → 监听 → controls → pane 这条链永远钉住。
// 2. 加载中途关栏不中止加载：下载和解析在后台跑完，把完整模型塞进死栏。
//
// 判据全部用 WeakRef + 强制 GC 量出来，不看 UI：
//   A) 空栏关闭        → Pane 必须可被回收
//   B) 加载完成后关闭   → Pane 必须可被回收
//   C) 加载中途关闭     → fetch 必须被中止，且 Pane 必须可被回收
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

// dev server 端口可能漂移，用 URL 环境变量覆盖：URL=http://localhost:5174/ npm run test:close
await page.goto(process.env.URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle0' });
const cdp = await page.createCDPSession();
await cdp.send('HeapProfiler.enable');

// 数模型请求实际传输的字节。abort 发生在响应体流式传输中，
// Puppeteer 的 requestfailed 不一定触发，字节数才是可靠判据。
const modelRequests = new Set();
let modelBytes = 0;
cdp.on('Network.requestWillBeSent', (e) => {
  if (e.request.url.includes('v22-fg.glb')) modelRequests.add(e.requestId);
});
cdp.on('Network.dataReceived', (e) => {
  if (modelRequests.has(e.requestId)) modelBytes += e.encodedDataLength;
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gc = async () => {
  for (let i = 0; i < 3; i++) {
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(200);
  }
};
const collected = (key) => page.evaluate((k) => window[k].deref() === undefined, key);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` —— ${detail}` : ''}`);
};

// ── A) 空栏关闭 ──
await page.evaluate(() => {
  const app = globalThis.__app;
  const p = app.addPane();
  app.removePane(p);
  window.__refA = new WeakRef(p);
});
await gc();
check('A 空栏关闭后 Pane 被回收', await collected('__refA'));

// ── B) 加载完成后关闭 ──
await page.evaluate(async () => {
  const app = globalThis.__app;
  const p = app.addPane();
  await p.loadURL('/models/v22-fg.glb');
  app.removePane(p);
  window.__refB = new WeakRef(p);
});
await gc();
check('B 载入模型后关闭 Pane 被回收', await collected('__refB'));

// ── C) 加载中途关闭 ──
// 限速到 300KB/s，2.1MB 的模型要下 ~7s；下到 0.5s 时关栏。
await cdp.send('Network.enable');
// B 环节刚下载过同一个文件，必须禁缓存，否则这次"下载"瞬间完成，中止无从测起
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 20, downloadThroughput: 300 * 1024, uploadThroughput: 256 * 1024,
});
modelBytes = 0;
await page.evaluate(() => {
  const app = globalThis.__app;
  const p = app.addPane();
  p.loadURL('/models/v22-fg.glb'); // 故意不 await，让它在加载中
  window.__c = p;
});
await sleep(500);
await page.evaluate(() => {
  globalThis.__app.removePane(window.__c);
  window.__refC = new WeakRef(window.__c);
  window.__c = null;
});
await sleep(1000); // abort 生效需要一瞬
const bytesAtClose = modelBytes;
await sleep(3000); // bug 回归的话，下载会在这段时间里继续涨
const started = bytesAtClose > 0; // 等于 0 说明压根没走网络（缓存/没发请求），测试就空了
const stopped = modelBytes === bytesAtClose;
const partial = modelBytes < 2_000_000; // 全文件 2.1MB，中止了就只会传一小截
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
});
check(
  'C1 中途关闭时下载被真正中止',
  started && stopped && partial,
  `关闭后 1s 传了 ${bytesAtClose} B，再等 3s 后 ${modelBytes} B（全文件 2182608 B）`,
);
await gc();
check('C2 中途关闭后 Pane 被回收', await collected('__refC'));

await browser.close();
if (results.every(Boolean)) {
  console.log('\n全部通过');
} else {
  console.log('\n有失败项');
  process.exit(1);
}
