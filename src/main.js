import { Pane } from './pane.js';

// 免登录、可直接热链的示例模型。
// Sketchfab 上那几个 V-22 都要登录才能下，没法写死 URL；下面这个 V-22 是有人把
// CC-BY 的 Sketchfab 导出提交进了公开 GitHub 仓库，才得以直接 fetch。
// 用 jsDelivr 并锁定 commit：那是个私人仓库，主分支随时可能被改写或删掉。
const V22 =
  'https://cdn.jsdelivr.net/gh/cvntrieu/Combat360@056d88a1ae5549ada31caa74a12b33810212ccdc/models/V22/scene.gltf';

const SAMPLES = [
  {
    // 由 FlightGear 的开源 V-22 转来（tools/ac3d_to_gltf.py），
    // 保留了短舱倾转、旋翼、起落架、舱门的枢轴——能真的动起来
    label: 'V-22（FlightGear · 可动）',
    url: '/models/v22-fg.glb',
    credit: 'V-22 模型来自 FlightGear V22-Osprey 项目，GPL v2',
  },
  {
    label: 'V-22（Sketchfab · 静态）',
    url: V22,
    // CC-BY 要求署名，这行不能删
    credit: 'V-22 模型 © Muhamad Mirza Arrafi，CC-BY-4.0',
  },
  {
    // 带 3 段独立动画（喷口 + 两段起落架），正好演示动画面板的分段控制
    label: 'F-35（3 段动画）',
    url: '/models/f35.glb',
    // CC-BY 要求署名，这行不能删
    credit: 'F-35 模型 © SIpriv（Sketchfab），CC-BY-4.0',
  },
  {
    label: '小飞机（Cesium Air）',
    url: 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumAir/Cesium_Air.glb',
  },
  {
    label: 'PBR 材质样板（破损头盔）',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  },
  {
    label: '带动画（LittlestTokyo）',
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/LittlestTokyo.glb',
  },
];

class App {
  constructor() {
    this.panes = [];
    this.wireframe = false;
    this.autoRotate = false;
    this.syncing = false;

    this.container = document.getElementById('panes');
    this.tpl = document.getElementById('pane-tpl');

    this.syncEl = document.getElementById('sync');
    this.wireEl = document.getElementById('wire');
    this.rotateEl = document.getElementById('rotate');
    this.envEl = document.getElementById('env');

    this.wireEl.addEventListener('change', () => {
      this.wireframe = this.wireEl.checked;
      for (const p of this.panes) p.applyWireframe(this.wireframe);
    });
    this.rotateEl.addEventListener('change', () => {
      this.autoRotate = this.rotateEl.checked;
    });
    this.envEl.addEventListener('change', () => {
      for (const p of this.panes) p.applyEnv(this.envEl.checked);
    });
    document.getElementById('add-pane').addEventListener('click', () => this.addPane());

    // 拖到窗口任意位置都提示，但真正的 drop 由各栏自己处理
    document.addEventListener('dragover', (e) => {
      e.preventDefault();
      document.body.classList.add('dragging');
    });
    document.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) document.body.classList.remove('dragging');
    });
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      document.body.classList.remove('dragging');
    });

    addEventListener('resize', () => {
      for (const p of this.panes) p.resize();
    });

    this.addPane();
    this.addPane();
    this.#tick();
  }

  addPane() {
    if (this.panes.length >= 4) return; // 每栏一个 WebGL 上下文，浏览器上限有限
    const el = this.tpl.content.firstElementChild.cloneNode(true);
    this.container.appendChild(el);

    const pane = new Pane(el, this);
    this.panes.push(pane);

    // 空栏里放几个一键加载的示例
    const samples = document.createElement('div');
    samples.className = 'samples';
    for (const s of SAMPLES) {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.addEventListener('click', () => pane.loadURL(s.url, s.credit));
      samples.appendChild(b);
    }
    el.querySelector('.empty').appendChild(samples);

    for (const p of this.panes) p.resize();
    return pane;
  }

  removePane(pane) {
    if (this.panes.length <= 1) return;
    this.panes = this.panes.filter((p) => p !== pane);
    pane.el.remove();
    pane.dispose();
    for (const p of this.panes) p.resize();
  }

  /**
   * 同步视角：一栏转动时把相机状态抄给其他栏。
   * syncing 这个标志位是必须的——不然 controls.update() 会再次触发 change 事件，
   * 两栏互相通知，形成死循环。
   */
  onCameraChange(source) {
    if (!this.syncEl.checked || this.syncing) return;
    this.syncing = true;
    const orbit = source.getOrbit();
    for (const p of this.panes) {
      if (p !== source) p.setOrbit(orbit);
    }
    this.syncing = false;
  }

  onPaneLoaded() {
    // 新模型刚 frameCamera 过，是它自己的标准取景；把这个视角推给其他栏，
    // 各栏按自身尺度换算，两边就在"同一个角度、同样的相对远近"上了。
    if (!this.syncEl.checked) return;
    const loaded = this.panes.filter((p) => p.model);
    if (loaded.length > 1) this.onCameraChange(loaded.at(-1));
  }

  #tick = () => {
    requestAnimationFrame(this.#tick);
    for (const p of this.panes) p.update(this.autoRotate);
  };
}

const app = new App();

// 给自动化测试用的钩子（scripts/tilt-test.mjs 要靠它量枢轴的世界姿态）
globalThis.__app = app;
