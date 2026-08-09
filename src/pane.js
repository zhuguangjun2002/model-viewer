import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadFromURL, loadFromFiles } from './loaders.js';
import { inspect } from './inspect.js';
import { renderReport } from './report.js';
import { renderTree, pickAt } from './tree.js';
import { findPivots, renderParts, updateSpin } from './parts.js';
import { renderAnims, updateAnims } from './anims.js';

// 环境贴图（IBL）是 PBR 材质看起来"有质感"的一半原因：金属面反射的其实是周围环境。
// RoomEnvironment 是 three 内置的程序化房间，不用下载任何 HDR 文件就能有像样的反射。
let envMap = null;
function getEnvMap(renderer) {
  if (!envMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envMap;
}

export class Pane {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.model = null;
    this.mixer = null;
    this.pivots = [];
    this.animItems = [];
    this.clock = new THREE.Clock();
    this.loadGen = 0; // 每次发起加载 +1，迟到的结果对不上号就丢弃
    this.disposed = false;

    const host = el.querySelector('.canvas-host');
    this.host = host;
    this.reportEl = el.querySelector('.report');
    this.loadingEl = el.querySelector('.loading');
    this.pctEl = el.querySelector('.pct');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14161a);
    this.scene.environment = getEnvMap(this.renderer);

    // 环境贴图只提供柔和的漫反射和反射，加一盏平行光才有明确的高光和方向感。
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(4, 6, 3);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
    this.camera.position.set(4, 2.4, 5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', () => app.onCameraChange(this));

    this.grid = new THREE.GridHelper(20, 20, 0x3a4048, 0x23272e);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.scene.add(this.grid);

    /* 点画面拾取零件名。用 pointerdown/up 的位移判「是点击还是拖动」——
     * 直接监听 click 会被 OrbitControls 的转动一起触发，转一下就弹一次名字。 */
    let downAt = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!downAt || !this.model) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4) return;                       // 拖过就是在转视角，不算拾取
      const hit = pickAt(e, this.renderer, this.camera, this.model);
      if (!hit) { this.#showPick(null); return; }
      this.tree?.select(hit.name);                 // 树里同步选中并高亮
      this.#showPick(hit.name, null, hit.material?.name);
    });

    this.#wireUI();
    this.resize();
  }

  /** 左下角那行拾取结果。name 传 null 就清空。 */
  #showPick(name, tris, matName) {
    let el = this.el.querySelector('.pick-line');
    if (!el) {
      el = document.createElement('div');
      el.className = 'pick-line';
      this.host.appendChild(el);
    }
    if (!name) { el.textContent = ''; return; }
    const bits = [`<b>${name}</b>`];
    if (tris != null) bits.push(`${tris.toLocaleString()} tris`);
    if (matName) bits.push(`材质 ${matName}`);
    el.innerHTML = bits.join('　');
  }

  #wireUI() {
    const urlInput = this.el.querySelector('.url');
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && urlInput.value.trim()) {
        this.loadURL(urlInput.value.trim());
      }
    });

    this.el.querySelector('.pick').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true; // .gltf 是散装的，得连 .bin 和贴图一起选
      input.accept = '.glb,.gltf,.bin,.fbx,.obj,.mtl,.stl,.png,.jpg,.jpeg,.webp,.ktx2';
      input.addEventListener('change', () => {
        if (input.files.length) this.loadFiles([...input.files]);
      });
      input.click();
    });

    this.el.querySelector('.close').addEventListener('click', () => this.app.removePane(this));

    // 每栏各自接收拖放，这样拖到哪栏就加载到哪栏
    this.el.addEventListener('dragover', (e) => e.preventDefault());
    this.el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.classList.remove('dragging');
      if (e.dataTransfer.files.length) this.loadFiles([...e.dataTransfer.files]);
    });
  }

  async loadURL(url, credit) {
    this.el.querySelector('.url').value = url;
    await this.#load(
      (onProgress, signal) => loadFromURL(url, this.renderer, onProgress, signal),
      url.split('/').pop().split('?')[0],
      url,
      credit,
    );
  }

  async loadFiles(files) {
    await this.#load(
      (onProgress) => loadFromFiles(files, this.renderer, onProgress),
      null,
      `本地文件 · ${files.length} 个`,
    );
  }

  async #load(run, fallbackName, source, credit) {
    this.#clearModel();
    // 关栏或换模型时上一次加载必须作废：.glb 的 fetch 用 signal 真中止，
    // 其余格式中止不了下载，就靠 gen 号在结果回来时整个丢弃。
    this.loadAbort?.abort();
    const ac = (this.loadAbort = new AbortController());
    const gen = ++this.loadGen;
    this.loadingEl.hidden = false;
    this.pctEl.textContent = '0%';

    try {
      const t0 = performance.now();
      const result = await run((p) => {
        this.pctEl.textContent = `${Math.round(p * 100)}%`;
      }, ac.signal);
      if (this.disposed || gen !== this.loadGen) {
        // 结果迟到了：栏已关闭，或已改载别的模型。释放掉，别塞进死栏。
        disposeTree(result.scene);
        return;
      }
      const loadMs = performance.now() - t0;

      // 从 URL 加载时进度回调拿不到文件大小（服务器不一定给 content-length），
      // 就用 Performance API 去查这次请求实际传了多少字节。
      const bytes = result.bytes ?? guessBytes(source);

      this.model = result.scene;
      this.scene.add(this.model);
      this.frameCamera();

      if (result.animations?.length) {
        this.mixer = new THREE.AnimationMixer(this.model);
      }

      this.applyWireframe(this.app.wireframe);
      this.el.classList.add('has-model');

      // draw call 必须真渲染一帧才知道，先渲染再统计
      this.renderer.info.reset();
      this.renderer.render(this.scene, this.camera);
      const drawCalls = this.renderer.info.render.calls;

      // 枢轴要先扫出来，报告卡才能把「可动性」算进评级
      this.pivots = findPivots(this.model);

      this.stats = inspect(this.model, {
        bytes,
        animations: result.animations ?? [],
        drawCalls,
        pivots: this.pivots.length,
      });
      renderReport(this.reportEl, {
        name: result.name ?? fallbackName ?? '模型',
        source,
        credit,
        loadMs,
        stats: this.stats,
      });

      /* 场景树：所有具名零件一行一个（带三角形数和显隐勾选）。
       * 枢轴滑杆只覆盖 FlightGear 那套带 fgAxis 的节点，Sketchfab 来的模型一个都没有——
       * 那类模型「有没有可控的零件」以前在这个界面上完全看不出来。 */
      const treePanel = document.createElement('div');
      treePanel.className = 'parts-panel tree';
      this.reportEl.prepend(treePanel);
      this.tree = renderTree(treePanel, this.model, (n) => this.#showPick(n.name, n.tris));

      // 转换器把 FlightGear 的旋转轴写进了节点 extras，这里做成滑杆
      if (this.pivots.length) {
        const panel = document.createElement('div');
        panel.className = 'parts-panel';
        this.reportEl.prepend(panel);
        renderParts(panel, this.pivots);
      }

      // 模型自带的动画片段：每段一行，可单独播放/拖时间轴看
      if (result.animations?.length) {
        const panel = document.createElement('div');
        panel.className = 'parts-panel anims';
        this.reportEl.prepend(panel);
        this.animItems = renderAnims(panel, this.mixer, result.animations);
        this.animItems[0].play(); // 保持原先"加载即播第一段"的行为
      }

      this.app.onPaneLoaded();
    } catch (err) {
      // 主动中止（关栏/换模型）抛的错不是失败，不用展示
      if (this.disposed || gen !== this.loadGen) return;
      console.error(err);
      this.reportEl.innerHTML = `<h2>加载失败</h2><p class="sub">${escape(err.message)}</p>`;
    } finally {
      this.loadingEl.hidden = true;
    }
  }

  #clearModel() {
    if (!this.model) return;
    this.tree?.dispose();
    this.tree = null;
    this.scene.remove(this.model);
    disposeTree(this.model);
    this.model = null;
    this.mixer = null;
    this.stats = null;
    this.pivots = [];
    this.animItems = [];
    this.el.classList.remove('has-model');
    this.reportEl.innerHTML = '';
  }

  /** 把相机摆到刚好框住模型的位置，不管模型原本是 1 米还是 1000 米。 */
  frameCamera() {
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    // 用垂直和水平两个 FOV 里更严的那个算距离，宽扁的飞机才不会被裁掉翼尖
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.25;

    this.camera.near = dist / 100;
    this.camera.far = dist * 100;
    this.camera.updateProjectionMatrix();

    // 记下这个模型的"标准取景"，同步视角时用它把距离归一化：
    // 17 米的飞机和 2 米的头盔要看起来一样大，靠的就是各自除以自己的 radius。
    this.focus = { center: center.clone(), radius };

    const dir = new THREE.Vector3(1, 0.45, 1).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.controls.target.copy(center);
    this.controls.update();

    // 网格跟着模型的尺度走，不然 17 米的飞机配 20 单位的网格看着就没参照
    this.scene.remove(this.grid);
    const span = Math.max(size.x, size.z) * 2;
    this.grid = new THREE.GridHelper(span, 20, 0x3a4048, 0x23272e);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.5;
    this.grid.position.set(center.x, box.min.y, center.z);
    this.scene.add(this.grid);
  }

  /**
   * 视角的"相对"表示：绕模型转到了什么角度、拉远到了自身尺寸的几倍。
   * 同步视角传的是这个，而不是绝对坐标——否则大小悬殊的两个模型会一个贴脸一个米粒。
   */
  getOrbit() {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    return { theta: s.theta, phi: s.phi, zoom: s.radius / (this.focus?.radius || 1) };
  }

  setOrbit({ theta, phi, zoom }) {
    const radius = (this.focus?.radius || 1) * zoom;
    const offset = new THREE.Vector3().setFromSpherical(new THREE.Spherical(radius, phi, theta));
    this.camera.position.copy(this.controls.target).add(offset);
    this.controls.update();
  }

  applyWireframe(on) {
    this.model?.traverse((o) => {
      for (const m of [o.material].flat()) {
        if (m && 'wireframe' in m) m.wireframe = on;
      }
    });
  }

  applyEnv(on) {
    this.scene.environment = on ? getEnvMap(this.renderer) : null;
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(autoRotate) {
    this.controls.autoRotate = autoRotate;
    this.controls.autoRotateSpeed = 1.2;
    const dt = this.clock.getDelta();
    this.mixer?.update(dt);
    updateAnims(this.animItems);
    updateSpin(this.pivots, dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.loadAbort?.abort(); // 正在下载就中止，别让它在后台跑完再塞进死栏
    this.#clearModel();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** 释放一棵子树的几何/材质/贴图。加载结果被丢弃时它还没进场景，也要走这里。 */
function disposeTree(root) {
  root?.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

function guessBytes(source) {
  const entry = performance.getEntriesByType('resource').findLast((e) => e.name === source);
  return entry?.encodedBodySize || entry?.transferSize || 0;
}

const escape = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
