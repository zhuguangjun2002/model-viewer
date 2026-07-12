import * as THREE from 'three';

// FlightGear 的部件名是法语。这里只做显示翻译和角度范围，
// 旋转轴一律从 glTF 的 extras 读（转换器写进去的），前端不硬编码方向。
//
// 短舱倾转：0° = 直升机模式（旋翼朝上），90° = 飞机模式（旋翼朝前）。
const PARTS = {
  LesMoteurs:      { label: '短舱倾转', min: 0,    max: 90,  spin: false },
  LesAiles:        { label: '机翼折叠', min: 0,    max: 90,  spin: false },
  HeliceGauche:    { label: '左旋翼',   min: -180, max: 180, spin: true },
  HeliceDroite:    { label: '右旋翼',   min: -180, max: 180, spin: true },
  TrainAvant:      { label: '前起落架', min: 0,    max: 90,  spin: false },
  GearLeftAll:     { label: '左主起落架', min: 0,  max: 90,  spin: false },
  GearRightAll:    { label: '右主起落架', min: 0,  max: 90,  spin: false },
  PorteCargoHaute: { label: '货舱门（上）', min: -90, max: 90, spin: false },
  PorteCargoBasse: { label: '货舱门（下）', min: -90, max: 90, spin: false },
  PorteCrewHaute:  { label: '舱门',     min: -90,  max: 90,  spin: false },
};

/**
 * 扫出模型里所有带 fgAxis 的枢轴节点。
 * 这些是转换器根据 FlightGear 的动画定义建出来的，转它们就能驱动部件。
 */
export function findPivots(root) {
  const pivots = [];
  root.traverse((o) => {
    const axis = o.userData?.fgAxis;
    if (!Array.isArray(axis) || axis.length !== 3) return;

    const meta = PARTS[o.name] ?? { label: o.name, min: -180, max: 180, spin: false };
    pivots.push({
      node: o,
      name: o.name,
      ...meta,
      axis: new THREE.Vector3(...axis).normalize(),
      base: o.quaternion.clone(), // 枢轴的初始朝向，所有旋转都叠在它上面
      angle: 0,
    });
  });
  // 单片桨叶的变距太细节，默认不显示，只留主要部件
  return pivots.filter((p) => !/^PiedPale/.test(p.name));
}

export function setAngle(pivot, deg) {
  pivot.angle = deg;
  const q = new THREE.Quaternion().setFromAxisAngle(pivot.axis, THREE.MathUtils.degToRad(deg));
  pivot.node.quaternion.copy(pivot.base).multiply(q);
}

/**
 * 生成部件控制面板。旋翼给一个「转」的勾选框，其余给滑杆。
 */
export function renderParts(el, pivots, onSpinChange) {
  if (!pivots.length) {
    el.innerHTML = '<div class="sec">可动部件</div><div class="dim">此模型没有可驱动的枢轴</div>';
    return;
  }

  el.innerHTML = `<div class="sec">可动部件（${pivots.length}）</div>`;

  for (const p of pivots) {
    const row = document.createElement('div');
    row.className = 'part';
    row.innerHTML = `
      <label>${p.label}</label>
      <input type="range" min="${p.min}" max="${p.max}" value="0" step="1" />
      <span class="deg">0°</span>
      ${p.spin ? '<label class="spin-toggle"><input type="checkbox" /> 转</label>' : ''}
    `;

    const slider = row.querySelector('input[type=range]');
    const deg = row.querySelector('.deg');
    slider.addEventListener('input', () => {
      setAngle(p, Number(slider.value));
      deg.textContent = `${slider.value}°`;
    });

    if (p.spin) {
      const box = row.querySelector('.spin-toggle input');
      box.addEventListener('change', () => {
        p.spinning = box.checked;
        slider.disabled = box.checked;
        onSpinChange?.();
      });
    }

    el.appendChild(row);
  }
}

/** 每帧调用：让勾了「转」的旋翼自己转起来。 */
export function updateSpin(pivots, dt) {
  for (const p of pivots) {
    if (!p.spinning) continue;
    setAngle(p, (p.angle + dt * 360) % 360); // 每秒一圈，太快了看着像静止（频闪）
  }
}
