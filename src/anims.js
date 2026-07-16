// 动画片段面板：模型自带的每段 AnimationClip 一行，可单独播放/暂停/拖时间轴。
// 之前只会自动播 animations[0]，像 F-35 这种带 3 段动画（喷口、起落架×2）的
// 模型，后两段根本没有入口——这个面板就是为了把它们区别开。

/**
 * 生成动画面板，返回 items 供每帧刷新（updateAnims）。
 * 勾上「播」就循环播放；取消勾选会定格在当前姿态，此时可以拖滑杆逐帧看。
 */
export function renderAnims(el, mixer, clips) {
  el.innerHTML = `<div class="sec">动画（${clips.length}）</div>`;
  const items = [];

  clips.forEach((clip, i) => {
    const action = mixer.clipAction(clip);
    const name = clip.name || `片段 ${i + 1}`;

    const row = document.createElement('div');
    row.className = 'part';
    row.innerHTML = `
      <label title="${esc(name)}（${clip.duration.toFixed(2)}s）">${esc(name)}</label>
      <input type="range" min="0" max="${clip.duration.toFixed(3)}" value="0" step="0.01" />
      <span class="deg">0.0s</span>
      <label class="spin-toggle"><input type="checkbox" /> 播</label>
    `;
    el.appendChild(row);

    const slider = row.querySelector('input[type=range]');
    const timeEl = row.querySelector('.deg');
    const box = row.querySelector('.spin-toggle input');

    const item = {
      action,
      slider,
      timeEl,
      box,
      get playing() {
        return box.checked;
      },
      play() {
        box.checked = true;
        action.paused = false;
        action.play();
      },
    };

    box.addEventListener('change', () => {
      if (box.checked) {
        item.play();
      } else {
        // 暂停而不是 stop：定格当前姿态，滑杆接着从这里拖
        action.paused = true;
      }
    });

    slider.addEventListener('input', () => {
      box.checked = false;
      // 没播过的片段要先 play 再 paused，action 才会对模型生效
      action.play();
      action.paused = true;
      action.time = Number(slider.value);
      mixer.update(0); // 立刻把这一帧的姿态写到骨骼/节点上
      timeEl.textContent = `${action.time.toFixed(1)}s`;
    });

    items.push(item);
  });

  return items;
}

/** 每帧调用：正在播放的片段让滑杆和时间跟着走。 */
export function updateAnims(items) {
  for (const it of items) {
    if (!it.playing) continue;
    it.slider.value = it.action.time;
    it.timeEl.textContent = `${it.action.time.toFixed(1)}s`;
  }
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
