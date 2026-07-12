// 量几何体包围盒中心的世界坐标 —— 不能量物体原点：
// 这批网格的原点都在世界原点，顶点坐标直接是绝对值，原点读数毫无意义。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
await p.goto(process.env.URL ?? 'http://localhost:5173/', {waitUntil:'networkidle0'});
await p.$eval('.pane .samples button', e => e.click());
await p.waitForFunction(() => document.querySelector('.report table'), {timeout:60000});

const snap = (deg) => p.evaluate(async (d) => {
  const { setAngle } = await import('/src/parts.js');
  const pane = globalThis.__app.panes[0];
  setAngle(pane.pivots.find(x => x.name === 'LesMoteurs'), d);
  pane.model.updateMatrixWorld(true);

  const centre = (o) => {
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const { min, max } = g.boundingBox, e = o.matrixWorld.elements;
    let cx=0, cy=0, cz=0;
    for (const x of [min.x,max.x]) for (const y of [min.y,max.y]) for (const z of [min.z,max.z]) {
      cx += e[0]*x+e[4]*y+e[8]*z+e[12];
      cy += e[1]*x+e[5]*y+e[9]*z+e[13];
      cz += e[2]*x+e[6]*y+e[10]*z+e[14];
    }
    return [cx/8, cy/8, cz/8];
  };
  const out = {};
  for (const n of ['moteurG','paleG1','propdiscG','bolG','aile','fuselage','derive'])
    { const o = pane.model.getObjectByName(n); if (o?.geometry) out[n] = centre(o); }
  return out;
}, deg);

const a = await snap(0), c = await snap(90);
const dist = (u,v) => Math.hypot(u[0]-v[0], u[1]-v[1], u[2]-v[2]);
const r = n => Math.round(n*100)/100;

console.log('几何中心（0° → 90°）:');
for (const k of Object.keys(a))
  console.log(`  ${k.padEnd(10)} 移动 ${r(dist(a[k],c[k])).toFixed(2)} m   ${a[k].map(r)} → ${c[k].map(r)}`);

const nac = ['moteurG','paleG1','propdiscG','bolG'];
console.log('\n刚体检验（短舱内部间距）:');
let bad = 0;
for (let i=0;i<nac.length;i++) for (let j=i+1;j<nac.length;j++) {
  const d0 = dist(a[nac[i]],a[nac[j]]), d9 = dist(c[nac[i]],c[nac[j]]);
  if (Math.abs(d0-d9) > 0.01) { bad++; console.log(`  ❌ ${nac[i]}–${nac[j]}: ${r(d0)} → ${r(d9)} m`); }
}
console.log(bad ? `  ${bad} 对间距变了 —— 短舱散架了` : '  ✅ 间距全部不变 —— 短舱整体刚性转动');
const still = ['aile','fuselage','derive'].filter(k => dist(a[k],c[k]) > 0.01);
console.log(still.length ? `  ❌ 机身部件不该动，但动了: ${still}` : '  ✅ 机翼/机身/尾翼纹丝不动');
await b.close();
