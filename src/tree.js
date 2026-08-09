/* 场景树 + 点击拾取。
 *
 * 起因是 C-17：那份 glb 有 351 个具名零件（tialdoor1_110＝尾舱坡道、bearing_45＝风扇转子……），
 * 「模型能不能被有效控制」这个问题，答案全在**零件叫什么、边界在哪**。原先这个查看器只把
 * FlightGear 那套 `fgAxis` 枢轴做成了滑杆，非枢轴的节点在界面上完全看不见——
 * 拿一份 Sketchfab 来的模型进来，等于两眼一抹黑。
 *
 * 这里补两件事，都不改模型：
 *   · 场景树：列出所有具名节点（`Object_12` 这种自动名折进它的具名祖先里），
 *     带三角形数和显隐勾选，点一行就把那件高亮出来；
 *   · 点击拾取：在画面上点哪儿，就报出**最近的具名祖先**的名字——
 *     这正是"我说的这个零件名，对应的是不是你看到的那一块"的对照方式。
 *
 * 高亮用**克隆材质 + emissive**，不动原材质（原材质多个 mesh 共用，直接改会连累别人）。 */
import * as THREE from 'three';

const AUTO_NAME = /^(Object|Mesh|Node|mesh|node)[_.]?\d*$/;

/** 沿父链找最近的"人起的名字"；一路到 root 都没有就返回 null。 */
export function namedAncestor(obj, root) {
  for (let p = obj; p && p !== root.parent; p = p.parent) {
    if (p.name && !AUTO_NAME.test(p.name)) return p;
  }
  return null;
}

function trisOf(obj) {
  let t = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    t += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  return Math.round(t);
}

/** 收集要上树的节点：具名的，或者虽无名但直接挂着 mesh 的顶层块。 */
export function collectNodes(root) {
  const out = [];
  const walk = (o, depth) => {
    const named = o.name && !AUTO_NAME.test(o.name);
    // 具名节点才占一行；它下面那些 Object_N 折进来（三角形数已经含在 trisOf 里）
    if (named && o !== root) { out.push({ obj: o, name: o.name, tris: trisOf(o), depth }); depth += 1; }
    for (const c of o.children) walk(c, depth);
  };
  walk(root, 0);
  return out;
}

/**
 * 把场景树渲染进 panel。
 * @returns {{select(name): void, dispose(): void}}
 */
export function renderTree(panel, root, onSelect) {
  const nodes = collectNodes(root);
  panel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'part tree-head';
  head.innerHTML = `<label>场景树（${nodes.length} 个具名件）</label>` +
    '<input class="tree-filter" type="text" placeholder="过滤名字…" /><span class="tree-hint">点画面拾取</span>';
  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'tree-list';
  panel.appendChild(list);

  let hl = null;           // 当前高亮：{mesh, mat} 数组
  const clearHighlight = () => {
    if (!hl) return;
    for (const { mesh, mat } of hl) mesh.material = mat;
    hl = null;
  };
  const highlight = (obj) => {
    clearHighlight();
    hl = [];
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      hl.push({ mesh: o, mat: o.material });
      /* 克隆一份再点亮：材质在 glTF 里是共享的，直接改 emissive 会把用同一材质的
       * 其它零件一起点亮，那就等于没高亮。 */
      const m = Array.isArray(o.material) ? o.material[0].clone() : o.material.clone();
      /* 0.55 不是 1：染色版的静态件本来就是浅灰，emissive 拉满会整块烧成纯白、
       * 反而看不出选中的是哪一件（第一版就是白花花一片）。 */
      if (m.emissive) { m.emissive.setHex(0x2b6bff); m.emissiveIntensity = 0.55; }
      else m.color?.setHex(0x2b6bff);
      o.material = m;
    });
  };

  const rows = new Map();
  for (const n of nodes) {
    const row = document.createElement('div');
    row.className = 'part tree-row';
    row.style.paddingLeft = `${6 + Math.min(n.depth, 6) * 10}px`;
    row.innerHTML = `<label title="${n.name}">${n.name}</label>` +
      `<span class="tree-tris">${n.tris.toLocaleString()}</span>`;
    const eye = document.createElement('input');
    eye.type = 'checkbox'; eye.checked = true; eye.title = '显示/隐藏';
    eye.addEventListener('change', () => { n.obj.visible = eye.checked; });
    row.appendChild(eye);
    row.querySelector('label').addEventListener('click', () => {
      highlight(n.obj);
      for (const r of rows.values()) r.classList.remove('sel');
      row.classList.add('sel');
      row.scrollIntoView({ block: 'nearest' });
      onSelect?.(n);
    });
    rows.set(n.name, row);
    list.appendChild(row);
  }

  head.querySelector('.tree-filter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const [name, row] of rows) row.hidden = q && !name.toLowerCase().includes(q);
  });

  return {
    select(name) {
      const row = rows.get(name);
      if (row) row.querySelector('label').click();
      else clearHighlight();
    },
    dispose: clearHighlight,
  };
}

/** 画面点击 → 最近的具名祖先。返回 {name, node, point, material} 或 null。 */
export function pickAt(ev, renderer, camera, root) {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster();
  rc.setFromCamera(ndc, camera);
  const hit = rc.intersectObject(root, true).find((h) => h.object.visible);
  if (!hit) return null;
  const node = namedAncestor(hit.object, root);
  return {
    name: node?.name ?? hit.object.name ?? '(无名)',
    node: node ?? hit.object,
    point: hit.point,
    material: Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material,
  };
}
