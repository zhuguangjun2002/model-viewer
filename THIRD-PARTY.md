# 第三方素材与许可

本项目**代码**是 MIT（见 [LICENSE](LICENSE)）。
但 `public/models/` 下的模型文件是别人的作品，各自带着**不同的、更严格的**许可。
这份清单是它们的账本——公开发布或分发本仓库前，逐条对一遍。

代码和这些模型是 **aggregation（聚合）关系，不是派生关系**：查看器在运行时加载
它们，和加载你自己拖进来的任意一份 glb 没有区别，代码里没有任何一行是从这些
模型派生出来的。所以 GPL v2 的传染性不及于本项目代码（GPL v2 第 2 节末段，
"mere aggregation of another work not based on the Program"）。
但**那个 GPL 文件本身**仍然是 GPL，下面的义务照单执行。

---

## `public/models/v22-fg.glb` —— GPL v2 ⚠

可变形的那架 V-22，10 个可动枢轴，本项目的主力示例。

| | |
|---|---|
| **许可** | **GNU General Public License v2.0** —— 正文见 [`licenses/GPL-2.0.txt`](licenses/GPL-2.0.txt) |
| 原作者 | BARANGER Emmanuel（网名 helijah），2007-08-06 初版，2014-03-16 修订 |
| 贡献者 | Maik Justus（动画与 FDM）、Detlef Faber（FDM 与贴图）、Oliver Thurau（3D 与 FDM 升级） |
| 上游 | <https://github.com/FGMEMBERS/V22-Osprey>（FlightGear 机库，仓库根目录有 `COPYING`） |
| 锁定版本 | commit `c7205d5a9aa8894478cc44bcd562a1c99e953f0e`（2015-10-08） |
| 作者主页 | <http://helijah.free.fr/flightgear/hangar.htm> |

这个 `.glb` 是上游 `Models/v22.ac` + `Models/v22.xml` 经 `tools/ac3d_to_gltf.py`
转换得到的，**属于 GPL v2 意义上的衍生作品**，因此它自己必须继续以 GPL v2 分发。

### 分发它时必须做到的三件事

1. **随附许可正文** —— 保留 `licenses/GPL-2.0.txt`（GPL v2 第 1 节）。
2. **保留署名与许可声明** —— 保留本文件里这一节，别删作者名。
3. **提供"源码"** —— GPL 说的 source 是"便于修改的首选形式"。对这个 glb 而言
   首选形式**不是 glb 本身**，而是上游那两个原始文件。上面已锁定 commit，
   任何人可据此取得完全对应的版本：

   ```bash
   git clone https://github.com/FGMEMBERS/V22-Osprey.git
   cd V22-Osprey && git checkout c7205d5a9aa8894478cc44bcd562a1c99e953f0e
   # 需要的是 Models/v22.ac（几何）和 Models/v22.xml（动画定义）
   ```

   施加于其上的"修改"就是本仓库里的 `tools/ac3d_to_gltf.py`（MIT，
   见下方说明），重新生成的命令在 [README](README.md#关于-v-22-osprey) 里。

> **转换器本身不是 GPL。** `tools/ac3d_to_gltf.py` 是从零写的 AC3D/XML 解析器，
> 没有复制 FlightGear 的任何代码。工具不会因为处理了 GPL 数据就变成 GPL
> （否则每个编译器都得是 GPL 的）。它是 MIT，随本项目代码走。

> **想彻底摆脱这条义务**：把 `public/models/v22-fg.glb` 从 git 里删掉，
> 让用户按 README 的命令自己转一份。代价是内置的 V-22 示例按钮开箱即失效。

---

## `public/models/f35.glb` —— CC-BY-4.0

带 3 段动画（喷口 + 两段起落架）的 F-35，动画面板的示例。

| | |
|---|---|
| **许可** | **Creative Commons Attribution 4.0 International** —— <https://creativecommons.org/licenses/by/4.0/> |
| 作者 | **SIpriv** |
| 来源 | Sketchfab |

CC-BY 只有一条硬性义务：**署名**。署名已经写在该栏的报告卡里
（字符串定义在 `src/main.js` 的 `SAMPLES`，由 `src/report.js` 渲染），**改 UI 时别把它删了**——删掉即违反许可。
商用可以，改动可以，但署名必须跟着走。

---

## 运行时从外部加载的模型（不在本仓库内）

以下模型不随仓库分发，是示例按钮在运行时热链拉取的。**不构成再分发**，
义务比上面轻，但既然界面上展示了它们，署名照给——全部写在 `src/main.js` 的 `SAMPLES` 里。

### V-22（Sketchfab 静态版）

通过 jsDelivr 从公开 GitHub 仓库 `cvntrieu/Combat360`（锁定 commit）拉取。

| | |
|---|---|
| **许可** | **CC-BY-4.0** |
| 作者 | **Muhamad Mirza Arrafi** |
| 署名 | 已写在报告卡里，别删 |

注意那是个第三方私人仓库，**没有 LICENSE 文件，随时可能消失**。
真要长期依赖，就把那 5 个文件（gltf + bin + 3 张贴图）镜像到自己这边并在此登记——
CC-BY 允许你这么做。

### 其余三个示例

| 模型 | 作者 | 许可 |
|---|---|---|
| Cesium Air | CesiumGS | Apache-2.0（`CesiumGS/cesium` 仓库整体许可；`LICENSE.md` 未对该素材单列） |
| Littlest Tokyo | Glen Fox | CC-BY-4.0（three.js 示例页署明 "CC Attribution"） |
| **Damaged Helmet** | **theblueturtle_ (2016) / ctxwing (2018)** | **CC-BY-NC-4.0 + CC-BY-4.0** ⚠ |

⚠ **Damaged Helmet 带 NC（NonCommercial）条款**——Khronos 示例库的
`Models/DamagedHelmet/README.md` 里写得明白：2016 年的原始模型是
theblueturtle_ 的 **CC-BY-NC-4.0**，2018 年 ctxwing 的 glTF 转换才是 CC-BY-4.0。
NC 是叠加的，取严：**这个模型禁止商用**。
它在本项目里只作 PBR 材质参照（"有法线/粗糙度/金属度长什么样"），
别把它搬进任何商业项目。真需要一个能商用的 PBR 样板，从 Khronos 示例库里
另挑一个纯 CC0 / CC-BY 的换掉。

---

## 未入库的文件

`public/models/c17-*.glb` 由 `.gitignore` 挡在仓库外，由另一个项目的
`染色脚本` 生成，不随本仓库分发，因此不在此清单内。
新增任何模型文件到 `public/models/` 并打算入库时，**先在这里加一行**。
