# 模型对比查看器

在网页里并排加载多个 3D 模型，同步转动，并用硬指标判断"哪个模型更好"。

仓库：<https://github.com/zhuguangjun2002/model-viewer>（private）
许可：代码 [MIT](LICENSE)。仓库里唯一的第三方模型 `f35.glb` 是 CC-BY-4.0；
GPL v2 的那个 V-22 已移出仓库，需自行转换（见 [THIRD-PARTY.md](THIRD-PARTY.md)）。

```bash
git clone https://github.com/zhuguangjun2002/model-viewer.git
cd model-viewer
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

> ⚠ **这个 glb 不在仓库里，得自己转一份**（下面有命令）。它是 GPL v2 的衍生件，
> 入库会让整个仓库的分发背上 copyleft 义务，所以移出去了。没有它时第一个示例
> 按钮会 404，`test:tilt` / `test:rigid` / `test:close` 也跑不了（会打印生成命令，
> 不会卡成超时）。缘由见 [THIRD-PARTY.md](THIRD-PARTY.md)。

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

第二个示例按钮是一架 V-22，能看不能动。

它能免登录直接加载，是因为有人把一个 CC-BY 的 Sketchfab 导出提交进了公开 GitHub 仓库
（`cvntrieu/Combat360`），我们通过 jsDelivr 锁定 commit 拉取。
**作者 Muhamad Mirza Arrafi，CC-BY-4.0，署名已经写在报告卡里，别删。**

注意这是个私人仓库，没有 LICENSE 文件，随时可能被删。真要用的话，
把那 5 个文件（gltf + bin + 3 张贴图）镜像到自己这边——CC-BY 允许你这么做。

### 两者对比（工具实测数据）

把两个示例并排加载，报告卡直接给出答案：

| | FlightGear 版 | Sketchfab 版 |
|---|---|---|
| 三角面 | 54,904 | 11,686 |
| Draw Call | 80 | 4 |
| 文件大小 | 2.1 MB | 2.8 MB |
| 贴图显存 | 5.7 MB | 22 MB |
| 贴图通道 | 仅颜色 | 仅颜色 |
| **可动枢轴** | **10** | **0** |
| **包围盒** | **18.8 × 5.95 × 24.6 米** | **964 × 284 × 772（非米制）** |

结论很清楚：**要做变形动画，只能用 FlightGear 版**——它是唯一有枢轴的，而且
尺度是标准米制（真实 V-22 长 17.5 米、旋翼尖间距 25.8 米，对得上）。
Sketchfab 版尺度大了约 57 倍，跟别的模型混用前必须先缩放。

代价是 FlightGear 版面数多 4.7 倍、draw call 多 20 倍（70 个网格各自为政，
可以合并材质来优化）。两者都只有颜色贴图，没有法线/粗糙度贴图——
想要金属质感得自己补 PBR 贴图。

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
- **可动枢轴 / 骨骼 / 动画** —— 对 V-22 尤其关键。能驱动部件有三条路：
  带枢轴节点（最好）、带骨骼绑定、或只能靠网格层级手动转。
  一整块网格就彻底没救——发动机短舱**转不了**，做不了直升机↔飞机的变形。
  有枢轴时，报告卡上面会直接长出一排滑杆。
- **顶点数 ≈ 面数 × 3** —— 顶点没合并，典型的 CAD 直接导出，白白浪费几倍显存。
- **包围盒** —— glTF 约定 1 单位 = 1 米，真实的 V-22 长 17.5 米。
  Sketchfab 那版的包围盒是 964 × 284 × 772，大了约 57 倍；FlightGear 版是
  18.8 × 5.95 × 24.6，标准米制。尺度不对的模型单看没事，一旦和别的模型
  放进同一场景就会像座山。这类问题在 Sketchfab 的预览页上完全看不出来。

顶部的徽章是汇总：全绿 = 能直接用，有黄 = 可用但要调，有红 = 有硬伤。

## 可动部件面板

模型里只要有带 `fgAxis` 的枢轴节点，报告卡上方就会自动生成滑杆，
旋转轴从节点的 `extras` 读，**前端不硬编码任何方向**——换个飞机也一样能用。

FlightGear 版 V-22 有 10 个：短舱倾转、机翼折叠、左右旋翼（可勾选自转）、
三组起落架、三道舱门。部件名是法语的（原作者是法国人），
`src/parts.js` 里只做显示翻译和角度范围。

## 动画面板

模型自带 AnimationClip 时，报告卡上方会生成动画面板：**每段动画一行**，
勾「播」循环播放，取消勾选定格在当前姿态，此时拖时间轴可以逐帧看。
多段可以同时播，也可以只开一段——之前只会自动播第一段，
像 F-35 示例这种带 3 段动画（喷口 + 两段起落架）的模型，后两段根本没入口。
加载后默认仍自动播第一段，行为不回退。

F-35 示例（`public/models/f35.glb`）来自 Sketchfab，
**作者 SIpriv，CC-BY-4.0，署名在报告卡里，别删**。

## 现状与下一步

**已经能用的**：并排对比 + 体检报告；FlightGear 版 V-22 的 10 个可动部件
（短舱倾转是完整验证过的，直升机 ↔ 飞机）；AC3D → glTF 转换器；三个无头浏览器测试。

**已知的坑**（不影响使用，但你回来时会撞上）：

- `npm run dev` 会跑在 **5174** 而不是 5173——5173 被你另一个项目占着。
  所以测试要写成 `URL=http://localhost:5174/ npm run test:tilt`。
- 控制台有一条 favicon 404，无害，冒烟测试会把它算进"报错 1 条"。
- **`public/models/v22-fg.glb` 不在仓库里**，要自己按上面的命令转一份，否则
  第一个示例按钮和三个测试都用不了。这是为了让仓库保持纯 MIT 分发。
- git **历史**里还留着那个 glb（`git rm --cached` 不改历史）。仓库是 private 所以
  没有实际问题，但**转 public 前得先用 `git filter-repo` 从历史里抹掉并强推**。
- 许可账本在 [THIRD-PARTY.md](THIRD-PARTY.md)——**往 `public/models/` 加入库文件前先在那里登记一行**。
- 单片桨叶的变距枢轴（`PiedPale*`，6 个）被 `src/parts.js` 过滤掉了，
  嫌太细节。想要的话把那行 filter 去掉。

**下一步可以做的**（按价值排）：

1. **一键变形动画** —— 短舱从 0° 平滑转到 90°，配合旋翼转速变化。
   枢轴都现成了，只差一条时间轴。
2. **降 draw call** —— FlightGear 版有 70 个网格、80 次 draw call。
   按材质合并静态部件（机身、机翼）能砍掉一大半，可动部件必须保持独立。
3. **补 PBR 贴图** —— 两个 V-22 都只有颜色贴图，没有法线/粗糙度/金属度，
   所以在环境光下没有金属质感。得自己在 Substance Painter 之类里画。
4. **舰载收纳流程** —— 机翼折叠 + 短舱倾转的组合动画，FlightGear 的 xml 里
   参数也是现成的。

## 代码结构

```
src/
  main.js      多栏布局、相对视角同步、示例模型清单
  pane.js      单栏查看器：渲染、加载、取景、部件驱动
  loaders.js   glb/gltf/fbx/obj/stl，含 Draco / KTX2 / Meshopt 解码
  inspect.js   模型体检：面数、显存、贴图通道、可动性 → 硬指标 + 结论
  report.js    报告卡渲染
  parts.js     枢轴扫描与滑杆（读 userData.fgAxis）
  anims.js     动画面板：每段 AnimationClip 单独播放/暂停/拖时间轴
tools/
  ac3d_to_gltf.py   FlightGear .ac + .xml → glTF（在 Blender 里跑）
licenses/
  GPL-2.0.txt       v22-fg.glb 要求随附的许可正文
scripts/
  smoke.mjs / tilt-test.mjs / rigid.mjs / anim-test.mjs / close-test.mjs   无头 Chrome 测试
  require-v22.mjs   缺 v22-fg.glb 时拦下依赖它的测试，打印生成命令
```

## 测试

全部用无头 Chrome 真的加载模型、驱动 UI、量几何数据，不是单元测试的替身。
（需要系统里有 `/usr/bin/google-chrome`。端口漂移时加 `URL=http://localhost:5174/`。）

```bash
npm run dev
npm run smoke        # 加载两个模型、出报告、截图，检查控制台报错
npm run test:tilt    # 短舱倾转在几何上是否正确
npm run test:rigid   # 短舱是否整体刚性转动、机身是否纹丝不动
npm run test:anims   # F-35 的 3 段动画能否各自单独驱动不同的节点
npm run test:close   # 关掉一栏必须真正释放：Pane 可被 GC、下载被中止
npm run test:env     # 每一栏的环境光照必须一样亮（同一模型开两栏比亮度）
```

`test:anims` 的判据：全部暂停取基准姿态，逐段单独播放后快照所有节点的
四元数和位置——每段都必须有节点动了，且三段动的节点集合互不相同
（实测 3 / 9 / 16 个节点）。

`test:tilt` 的判据全部是量出来的，不靠肉眼：

- 旋翼必须**跟着**短舱走（层级挂错的话它会原地不动）
- 0° 时旋翼轴垂直（桨盘水平）= 直升机模式
- 90° 时旋翼轴顺着机身（桨盘竖直）= 飞机模式
- 短舱必须朝**机头**倒，不能朝机尾（机身轴向由前起落架和尾部货舱门的位置现推，不写死）

`test:rigid` 量的是包围盒中心之间的距离：短舱内部任意两个部件的间距在任何角度下
都必须不变，机翼/机身/尾翼则必须完全不动。这条抓的是坐标系错位——
曾经枢轴和网格差了 90°，短舱会绕机身滚转轴翻，左右分家，但只测枢轴节点是测不出来的。

`test:close` 的判据是 WeakRef + 强制 GC，不看 UI。它防的是两个真出过的泄漏
（用堆快照的保留链定位到的）：

- **关栏顺序**：`removePane` 必须先 `dispose()` 再摘 DOM。OrbitControls 用
  `domElement.getRootNode()` 找 document 来移除它挂在 document 上的 keydown
  监听；el 先离开文档的话监听摘不掉，整个 Pane（renderer、scene、DOM）会被
  document → 监听 → controls → pane 这条链永远钉住，关一栏漏一栏。
- **中途关栏**：加载必须作废（fetch 用 AbortController 真中止，其余格式靠
  gen 号丢弃迟到的结果），否则下载和解析在后台跑完，把完整模型塞进死栏——
  大模型解析还会阻塞主线程几秒，这就是"叉掉模型后假死"的来源。

`test:env` 是 2026-08-12 修「第二栏发灰发暗」时加的。环境贴图（PMREM）是**渲染目标纹理**，
绑死在生成它的那个 WebGL 上下文里；每栏都有自己的 renderer / 自己的上下文，
所以贴图**必须每栏各生成一份**。原来是模块级单例（第一栏生成、后面共用），
第二栏拿到的是"别人上下文里的纹理"，等于没有 IBL。

⚠ **这个病只看第一栏永远发现不了，而且不报任何错**——控制台干净、模型也照常显示，
只是灰了一档。所以判据是「同一个模型开两栏，两块画布的平均亮度相对差 ≤5%」。
A/B 实测：撤掉修复第二栏暗 **24%**，修好后差 **0.0%**。

## 场景树 + 点击拾取（2026-08-09 加）

原先这个查看器只把 FlightGear 那套带 `fgAxis` 的枢轴做成滑杆，**非枢轴节点在界面上完全看不见**。
拿一份 Sketchfab 来的模型进来（比如 351 个具名件的 C-17），"这模型能不能被有效控制"
根本无从判断。补了两样，都在 `src/tree.js`：

- **场景树**：报告卡上方多一块面板，列出所有具名节点（`Object_12` 这种自动名折进具名祖先里），
  带三角形数、显隐勾选、名字过滤框；点一行就把那件高亮（克隆材质改 emissive，不动原材质）。
- **点击拾取**：在画面上点哪儿，左下角就报出**最近的具名祖先**名字和材质名，树里同步选中。
  用 `pointerdown/up` 的位移判「点击 vs 拖动」——直接听 `click` 会被 OrbitControls 的转动带出来。

顺带加了 **hash 直开**：`#model=/models/xxx.glb`，多栏用逗号分开。审片时同一份 glb 要反复开，
改一版按 F5 就是新的一版，不用每次拖文件。

典型用法（核对 C-17 的零件划分）：

```
http://localhost:5174/#model=/models/c17-slim-paint.glb
```

那份 glb 是**按子动画分组染的色**（红＝尾舱坡道、黄＝坡道延伸板、黄绿＝上方蚌壳门、
绿＝起落架、粉＝登机/跳伞门、橙＝发动机反推、品红＝已被删掉的舱内线缆管路……），
点哪块报哪块的名字，一眼能核对"我说的零件名对不对得上你看到的那一块"。
它由另一个项目的染色脚本生成——按子动画分组给零件刷上不同颜色，专门为这种核对场景准备的。

**注意**：那份染色件里还留着原始的 10 秒母动画，加载即自动播第一段——
零件会自己动。想静态看就把动画面板那行的「播」勾掉。
