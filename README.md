# 模型对比查看器

在网页里并排加载多个 3D 模型，同步转动，并用硬指标判断"哪个模型更好"。

```bash
npm install
npm run dev
```

支持 `.glb` / `.gltf` / `.fbx` / `.obj` / `.stl`，直接拖进任意一栏即可。
`.gltf` 是散装格式（json + .bin + 贴图），拖的时候要把这些文件**一起选中**。

---

## 关于 V-22 Osprey

**你最初看到的那个模型下载不了。**
`sketchfab.com/3d-models/bell-boeing-v-22-osprey-28c5c68b96714104839f277ff76bc4fb`（作者 Araon）
是 view-only 的，页面上没有下载入口，只能在线预览。

### 内置的 V-22 示例

第一个示例按钮就是一架真 V-22（11,686 面，带贴图），点了就能看。

它能免登录直接加载，是因为有人把一个 CC-BY 的 Sketchfab 导出提交进了公开 GitHub 仓库
（`cvntrieu/Combat360`），我们通过 jsDelivr 锁定 commit 拉取。
**作者 Muhamad Mirza Arrafi，CC-BY-4.0，署名已经写在报告卡里，别删。**

注意这是个私人仓库，没有 LICENSE 文件，随时可能被删。真要用的话，
把那 5 个文件（gltf + bin + 3 张贴图）镜像到自己这边——CC-BY 允许你这么做。

### 其他能下载的 V-22

以下 4 个也是**真能免费下载**的（Sketchfab 需要注册一个免费账号，下载时选 glTF/GLB 格式）：

| 模型 | 三角面 | 许可 | 特点 |
|---|---|---|---|
| [Timing (@Tyme0022)](https://sketchfab.com/3d-models/v-22-osprey-399c3a03a89c4426b8d8ff161750cea2) | 19.9k | CC-BY | **带骨骼绑定** —— 唯一能驱动发动机短舱旋转的。网页首选 |
| [Spark_Customs](https://sketchfab.com/3d-models/bell-boeing-v-22-osprey-da060b381eae4bc098dae95bf922f2ee) | 98.8k | CC-BY | 细节最高，适合做静态展示/近景 |
| [SB-129 (@hrd4588)](https://sketchfab.com/3d-models/v-22-osprey-jgsdf-e8c0fc4869a34cb0b3a2282ee88c070b) | 48.8k | CC-BY | 日本自卫队涂装，折中之选 |
| [helijah](https://sketchfab.com/3d-models/bell-boeing-v22-osprey-cd5134ab74404e54bc548e381d09ad56) | 102.7k | Sketchfab "Free Standard" | 下载量最高，但**许可不是 CC，商用前务必看条款** |

CC-BY 要求署名，商用可以。用之前把作者名字放进页面。

**没有 V-22 的站**（省得白跑）：NASA 3D Resources（只有航天器）、Smithsonian 3D（CC0，但只有历史机型）、
Poly Pizza（低多边形，无倾转旋翼机）、Khronos glTF 示例库（根本没有飞机）。
GrabCAD 有 V-22，但都是 CAD 实体模型——没贴图、面数爆炸，得先重拓扑，不值得。

---

## 报告怎么读

每栏下面的报告卡是判断"模型好不好"的依据。几条关键的：

- **三角面** —— 网页实时渲染的舒适区是 6 万以内。20 万以上手机会掉帧。
- **Draw Call** —— 比面数更能决定帧率。每换一次材质就是一次 draw call，超过 100 就该合并网格了。
- **贴图显存** —— 和文件大小是两码事。一张 2K 的 JPEG 在磁盘上可能只有 500KB，
  传到显卡上就是 22MB（未压缩 RGBA + mipmap）。这一栏才是设备真正要扛的。
- **贴图通道** —— 只有"颜色"说明是老式贴图，材质会发平。
  有"法线 + 粗糙度 + 金属度"才是 PBR，在环境光下才有金属和磨损的质感。
- **骨骼 / 动画** —— 对 V-22 尤其关键：没骨骼、又只有一个网格，
  就意味着发动机短舱**转不了**，做不了直升机↔飞机的变形动画。
- **顶点数 ≈ 面数 × 3** —— 顶点没合并，典型的 CAD 直接导出，白白浪费几倍显存。
- **包围盒** —— glTF 约定 1 单位 = 1 米，真实的 V-22 长约 17 米。
  内置那个 V-22 示例的包围盒是 964 × 284 × 772，大了约 57 倍——单看没事，
  一旦和别的模型放进同一场景就会像座山。这类问题在 Sketchfab 的预览页上完全看不出来。

顶部的徽章是汇总：全绿 = 能直接用，有黄 = 可用但要调，有红 = 有硬伤。

## 冒烟测试

```bash
npm run dev
npm run smoke              # 端口是 5173 时
URL=http://localhost:5174/ npm run smoke   # 端口漂移时
```

用无头 Chrome 真的加载两个模型、读出报告、截图到 `smoke-shot.png`，并检查控制台报错。
（需要系统里有 `/usr/bin/google-chrome`。)
