import { fmt, mb } from './inspect.js';

const MAP_LABELS = {
  map: '颜色',
  normalMap: '法线',
  roughnessMap: '粗糙度',
  metalnessMap: '金属度',
  aoMap: '环境光遮蔽',
  emissiveMap: '自发光',
  alphaMap: '透明',
  clearcoatMap: '清漆',
  specularMap: '高光',
  bumpMap: '凹凸',
  displacementMap: '置换',
};

export function renderReport(el, { name, source, credit, loadMs, stats: s }) {
  const grade = overallGrade(s.notes);
  const maps = [...s.usedMaps].map((k) => MAP_LABELS[k] ?? k);

  el.innerHTML = `
    <h2>${esc(name)}<span class="grade ${grade.level}">${grade.label}</span></h2>
    <div class="sub">${esc(source)} · 加载耗时 ${Math.round(loadMs)} ms</div>
    ${credit ? `<div class="credit">${esc(credit)}</div>` : ''}

    <div class="sec">几何体</div>
    <table>
      ${row('三角面', fmt(s.triangles))}
      ${row('顶点', fmt(s.vertices))}
      ${row('网格 / 独立几何体', `${s.meshCount} / ${s.geometryCount}`)}
      ${row('Draw Call', s.drawCalls)}
      ${row('包围盒', dims(s.size))}
    </table>

    <div class="sec">材质与贴图</div>
    <table>
      ${row('材质数', s.materialCount)}
      ${row('贴图数', s.textureCount)}
      ${row('最大贴图边长', s.maxTexEdge ? `${s.maxTexEdge} px` : '—')}
      ${row('贴图通道', maps.length ? maps.join('、') : '无')}
    </table>

    <div class="sec">开销</div>
    <table>
      ${row('文件大小', s.bytes ? mb(s.bytes) : '未知')}
      ${row('贴图显存', s.textureVRAM ? mb(s.textureVRAM) : '0 MB')}
      ${row('几何显存', mb(s.geometryVRAM))}
    </table>

    <div class="sec">可动性</div>
    <table>
      ${row('可动枢轴', s.pivots || '无')}
      ${row('骨骼网格', s.skinnedCount || '无')}
      ${row('动画', s.animations.length ? s.animations.join('、') : '无')}
    </table>

    <div class="notes">
      ${s.notes.map((n) => `<div class="note ${n.level}"><span class="dot"></span><span>${esc(n.text)}</span></div>`).join('')}
    </div>
  `;
}

/** 只要有一条红，整体就是"有硬伤"；全绿才叫"能直接用"。 */
function overallGrade(notes) {
  if (notes.some((n) => n.level === 'bad')) return { level: 'bad', label: '有硬伤' };
  if (notes.some((n) => n.level === 'warn')) return { level: 'warn', label: '可用，需调整' };
  return { level: 'good', label: '能直接用' };
}

const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

const dims = (v) =>
  v.x ? `${v.x.toPrecision(3)} × ${v.y.toPrecision(3)} × ${v.z.toPrecision(3)}` : '—';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
