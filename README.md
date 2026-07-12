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

### 内置的 V-22 示例（可动）

**第一个示例按钮是一架能变形的 V-22。** 拖「短舱倾转」滑杆，0° 是直升机模式
（旋翼朝上），90° 是飞机模式（旋翼朝前），旋翼、桨叶、桨毂全跟着走。
另外还有机翼折叠、旋翼自转、起落架、货舱门，共 10 个可动部件。

它来自 **FlightGear 的开源 V-22**（GPL v2），用 `tools/ac3d_to_gltf.py` 转成 glTF。
FlightGear 的模型分两份：`.ac` 是几何体，`.xml` 是动画定义——后者写明了
哪个部件绕哪根轴、以哪个点为中心旋转。**这才是真正值钱的东西**：短舱倾转的
枢轴点和旋转轴在 xml 里写得清清楚楚，不用去猜。

转换器把这些旋转组还原成 glTF 里的嵌套枢轴节点
（机翼 → 短舱 → 旋翼 → 单片桨叶），并把旋转轴写进节点的 `extras`，
前端读 `object.userData.fgAxis` 就能拿到，不硬编码任何方向。

重新转换（需要装了 Blender；Windows 上的 Blender 可以从 WSL 直接驱动）：

```bash
git clone --depth 1 https://github.com/FGMEMBERS/V22-Osprey.git
BL="/mnt/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"
"$BL" --background --python "$(wslpath -w tools/ac3d_to_gltf.py)" -- \
  "$(wslpath -w V22-Osprey/Models/v22.ac)" \
  "$(wslpath -w V22-Osprey/Models/v22.xml)" \
  "$(wslpath -w public/models/v22-fg.glb)"
```

### 另一个 V-22 示例（静态）

第二个示例按钮是一架 V-22（11,686 面，带贴图），能看不能动。

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

## 测试

全部用无头 Chrome 真的加载模型、驱动 UI、量几何数据，不是单元测试的替身。
（需要系统里有 `/usr/bin/google-chrome`。端口漂移时加 `URL=http://localhost:5174/`。）

```bash
npm run dev
npm run smoke        # 加载两个模型、出报告、截图，检查控制台报错
npm run test:tilt    # 短舱倾转在几何上是否正确
npm run test:rigid   # 短舱是否整体刚性转动、机身是否纹丝不动
```

`test:tilt` 的判据全部是量出来的，不靠肉眼：

- 旋翼必须**跟着**短舱走（层级挂错的话它会原地不动）
- 0° 时旋翼轴垂直（桨盘水平）= 直升机模式
- 90° 时旋翼轴顺着机身（桨盘竖直）= 飞机模式
- 短舱必须朝**机头**倒，不能朝机尾（机身轴向由前起落架和尾部货舱门的位置现推，不写死）

`test:rigid` 量的是包围盒中心之间的距离：短舱内部任意两个部件的间距在任何角度下
都必须不变，机翼/机身/尾翼则必须完全不动。这条抓的是坐标系错位——
曾经枢轴和网格差了 90°，短舱会绕机身滚转轴翻，左右分家，但只测枢轴节点是测不出来的。
