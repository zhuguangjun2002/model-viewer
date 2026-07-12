import * as THREE from 'three';

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'clearcoatMap',
  'specularMap',
  'bumpMap',
  'displacementMap',
];

/**
 * 把一个模型拆开数一遍，得到判断"这模型好不好"所需的全部硬指标。
 */
export function inspect(root, { bytes = 0, animations = [], drawCalls = 0 } = {}) {
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  let skinnedCount = 0;
  let missingUV = 0;
  let missingNormal = 0;

  const geometries = new Set();
  const materials = new Set();
  const images = new Map(); // image -> {w, h}，按 image 去重，同一张图被多个通道复用只算一次
  const usedMaps = new Set();
  let transparent = 0;
  let doubleSided = 0;

  root.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    meshCount++;
    if (o.isSkinnedMesh) skinnedCount++;

    const g = o.geometry;
    if (g && !geometries.has(g)) {
      geometries.add(g);
      const pos = g.attributes.position;
      if (pos) {
        vertices += pos.count;
        triangles += g.index ? g.index.count / 3 : pos.count / 3;
      }
      if (!g.attributes.uv) missingUV++;
      if (!g.attributes.normal) missingNormal++;
    }

    for (const m of [o.material].flat()) {
      if (!m || materials.has(m)) continue;
      materials.add(m);
      if (m.transparent) transparent++;
      if (m.side === THREE.DoubleSide) doubleSided++;

      for (const key of MAP_KEYS) {
        const tex = m[key];
        if (!tex?.isTexture || !tex.image) continue;
        usedMaps.add(key);
        const { width: w = 0, height: h = 0 } = tex.image;
        if (w && h) images.set(tex.image, { w, h });
      }
    }
  });

  // 显存估算：贴图按 RGBA8 上传，带 mipmap 再乘 4/3。这是 GPU 上的真实占用，
  // 跟磁盘上的文件大小是两回事——一张 2K JPEG 可能只有 500KB，传到显卡上就是 22MB。
  let textureVRAM = 0;
  let maxTexEdge = 0;
  for (const { w, h } of images.values()) {
    textureVRAM += w * h * 4 * (4 / 3);
    maxTexEdge = Math.max(maxTexEdge, w, h);
  }

  let geometryVRAM = 0;
  for (const g of geometries) {
    for (const attr of Object.values(g.attributes)) {
      geometryVRAM += attr.array.BYTES_PER_ELEMENT * attr.array.length;
    }
    if (g.index) geometryVRAM += g.index.array.BYTES_PER_ELEMENT * g.index.array.length;
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

  const stats = {
    bytes,
    triangles: Math.round(triangles),
    vertices,
    meshCount,
    geometryCount: geometries.size,
    materialCount: materials.size,
    textureCount: images.size,
    maxTexEdge,
    textureVRAM,
    geometryVRAM,
    drawCalls,
    skinnedCount,
    animations: animations.map((a) => a.name || '(未命名)'),
    usedMaps,
    missingUV,
    missingNormal,
    transparent,
    doubleSided,
    size,
  };

  return { ...stats, notes: judge(stats) };
}

/**
 * 把硬指标翻译成人话。这些阈值是面向"网页实时渲染"的经验值，
 * 不是绝对标准——离线渲染的模型面数高十倍也很正常。
 */
function judge(s) {
  const notes = [];
  const say = (level, text) => notes.push({ level, text });

  // 面数
  if (s.triangles === 0) {
    say('bad', '没有任何几何体，模型是空的');
  } else if (s.triangles < 1_000) {
    say('warn', `只有 ${fmt(s.triangles)} 个三角面，细节可能过于简陋`);
  } else if (s.triangles <= 60_000) {
    say('good', `${fmt(s.triangles)} 面，网页实时渲染的理想区间`);
  } else if (s.triangles <= 200_000) {
    say('warn', `${fmt(s.triangles)} 面偏重，单个模型没问题，但别在场景里放多个`);
  } else {
    say('bad', `${fmt(s.triangles)} 面太重了，手机上会掉帧，建议先减面`);
  }

  // 顶点/面比：正常约 0.5–0.7。明显偏高说明顶点没合并（每个面各自一套顶点），
  // 常见于 CAD 导出的 STL，白白多占几倍显存。
  if (s.triangles > 100 && s.vertices / s.triangles > 1.2) {
    say('warn', '顶点没有合并（顶点数≈面数×3），八成是 CAD 直接导出的，显存浪费严重');
  }

  // Draw call：每次切材质就多一次 draw call，是网页 3D 最常见的性能杀手。
  if (s.drawCalls > 100) {
    say('bad', `${s.drawCalls} 次 draw call 太多了，需要合并网格/材质`);
  } else if (s.drawCalls > 40) {
    say('warn', `${s.drawCalls} 次 draw call 偏多，合并材质可以改善`);
  } else if (s.drawCalls > 0) {
    say('good', `${s.drawCalls} 次 draw call，很干净`);
  }

  // 贴图与 PBR
  if (s.textureCount === 0) {
    say('bad', '一张贴图都没有，只有纯色材质——想要照片级效果得自己画贴图');
  } else {
    const has = (k) => s.usedMaps.has(k);
    const pbr = ['normalMap', 'roughnessMap', 'metalnessMap'].filter(has);
    if (pbr.length >= 2) {
      say('good', `PBR 贴图齐全（${pbr.join(' / ')}），在环境光照下会有正确的金属和粗糙度表现`);
    } else if (has('normalMap')) {
      say('warn', '有法线贴图但缺粗糙度/金属度贴图，材质质感会偏平');
    } else {
      say('warn', '只有颜色贴图，没有法线/粗糙度贴图——光影细节全靠几何体撑，质感有限');
    }

    if (s.maxTexEdge >= 4096) {
      say('warn', `最大贴图 ${s.maxTexEdge}px，显存吃紧，网页上一般降到 2K 就够`);
    }
    if (s.textureVRAM > 128 * 1024 * 1024) {
      say('bad', `贴图占 ${mb(s.textureVRAM)} 显存，低端设备可能直接崩，建议压成 KTX2`);
    } else if (s.textureVRAM > 48 * 1024 * 1024) {
      say('warn', `贴图占 ${mb(s.textureVRAM)} 显存，考虑转 KTX2/Basis 压缩纹理`);
    }
  }

  // 拓扑健康度
  if (s.missingUV > 0) {
    say('bad', `${s.missingUV} 个网格没有 UV，无法贴图，只能上纯色`);
  }
  if (s.missingNormal > 0) {
    say('warn', `${s.missingNormal} 个网格缺法线，光照会不正常`);
  }

  // 骨骼与动画——对 V-22 来说这条最关键：没骨骼就转不了发动机短舱
  if (s.animations.length > 0) {
    say('good', `自带 ${s.animations.length} 段动画：${s.animations.join('、')}`);
  }
  if (s.skinnedCount > 0) {
    say('good', '带骨骼绑定，可以驱动关节做动画（比如 V-22 的发动机短舱旋转）');
  } else if (s.meshCount > 1) {
    say('warn', '没有骨骼，但模型分了多个网格——仍可以按网格层级手动旋转部件');
  } else if (s.meshCount === 1) {
    say('bad', '整个模型是一整块网格，没有骨骼也没有部件划分，任何部位都动不了');
  }

  // 尺度：glTF 约定 1 单位 = 1 米。一架 V-22 长约 17 米，最大的客机也就 80 米，
  // 所以最长边超过 200 基本可以断定不是米制（多半是从 3ds Max/厘米/英寸导出的）。
  // 这类模型单看没问题，一旦和别的模型放进同一场景就会大得离谱。
  const maxDim = Math.max(s.size.x, s.size.y, s.size.z);
  if (maxDim > 0 && (maxDim < 0.05 || maxDim > 200)) {
    say(
      'warn',
      `包围盒最长边 ${maxDim.toPrecision(3)} 单位，不是米制（glTF 约定 1 单位 = 1 米），和其他模型混用前必须先缩放`,
    );
  }

  return notes;
}

const fmt = (n) => n.toLocaleString('en-US');
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export { fmt, mb };
