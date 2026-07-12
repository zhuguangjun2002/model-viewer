"""把 FlightGear 的 AC3D 飞机模型转成 glTF，并保留可动部件的枢轴。

FlightGear 的模型分两份：
  - .ac  —— AC3D 格式的几何体，纯文本，部件都有名字
  - .xml —— FlightGear 的动画定义，写明了哪些部件绕哪个轴、以哪个点为中心旋转

真正值钱的是 .xml。V-22 的短舱倾转（LesMoteurs 组，绕 (0,-1,0) 轴、
以 (-1.880, 0, 0.520) 为中心）在里面写得清清楚楚，不用去猜枢轴点。
本脚本把这些旋转组转成 glTF 里的空节点（Empty），成员挂在下面——
这样在网页里只要转那一个节点，短舱就整体倾转。

用法（Blender 无头模式）：
  blender --background --python tools/ac3d_to_gltf.py -- <in.ac> <in.xml> <out.glb>
"""

import os
import re
import sys
import xml.etree.ElementTree as ET

import bpy
import bmesh
from mathutils import Matrix, Vector

# ---------------------------------------------------------------- 坐标系
#
# 三套坐标系，别搞混：
#   AC3D      —— Y 上，模型自己的坐标
#   FlightGear —— X 朝机尾，Y 朝右翼，Z 朝上（.xml 里的 <x-m>/<y-m>/<z-m> 用这套）
#   Blender   —— Z 上（导出 glTF 时 Blender 会自己转成 glTF 的 Y 上）
#
# 所以 .ac 的顶点和 .xml 的枢轴点，要各自转到 Blender 空间才能对上。

def ac_to_blender(x, y, z):
    """AC3D (Y 上) → Blender (Z 上)。

    换算后的 Blender 空间里：X = 前后，Y = 翼展，Z = 上。
    （行列式 +1，是纯旋转，不会把模型镜像。）
    """
    return Vector((x, -z, y))


def fg_to_blender(x, y, z):
    """FlightGear 的 .xml 坐标 → Blender。

    恒等变换：FG 的 <x-m>/<y-m>/<z-m> 跟 .ac 顶点换算后落在同一个坐标系里。
    实测对照（左发动机）：
        网格 moteurG   ac_to_blender 后 = (-1.574, -7.041, 2.289)
        枢轴 HeliceGauche  xml 中心    = (-1.574, -7.041, 2.252)
    两者本就重合，不需要再转。

    （曾经这里写成 (y, x, z)，把 X/Y 对调 —— 那不仅让枢轴和网格差了 90°，
    交换两轴本身还是个镜像变换，行列式 -1。症状是短舱绕机身滚转轴翻，左右分家。）
    """
    return Vector((x, y, z))


# ---------------------------------------------------------------- AC3D 解析

class ACObject:
    def __init__(self):
        self.name = 'object'
        self.kind = 'poly'
        self.texture = None
        self.loc = Vector((0, 0, 0))
        self.rot = Matrix.Identity(3)
        self.verts = []          # AC3D 原始坐标
        self.surfs = []          # [(mat_index, [(vert_index, u, v), ...]), ...]
        self.children = []


def parse_ac3d(path):
    """AC3D 是行式文本格式，用一个游标顺序啃下来。"""
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        lines = f.read().splitlines()

    if not lines or not lines[0].startswith('AC3D'):
        raise SystemExit(f'{path} 不是 AC3D 文件')

    materials = []
    pos = 1

    def tokens(line):
        # 带引号的名字可能有空格，单独抠出来
        return re.findall(r'"[^"]*"|\S+', line)

    def parse_object():
        nonlocal pos
        obj = ACObject()
        obj.kind = tokens(lines[pos])[1]
        pos += 1

        while pos < len(lines):
            t = tokens(lines[pos])
            if not t:
                pos += 1
                continue
            key = t[0]

            if key == 'name':
                obj.name = t[1].strip('"')
            elif key == 'texture':
                obj.texture = t[1].strip('"')
            elif key == 'loc':
                obj.loc = Vector((float(t[1]), float(t[2]), float(t[3])))
            elif key == 'rot':
                v = [float(x) for x in t[1:10]]
                # AC3D 的 rot 是按行给的 3x3
                obj.rot = Matrix((v[0:3], v[3:6], v[6:9]))
            elif key == 'numvert':
                n = int(t[1])
                pos += 1
                for i in range(n):
                    a = lines[pos + i].split()
                    obj.verts.append((float(a[0]), float(a[1]), float(a[2])))
                pos += n - 1
            elif key == 'numsurf':
                n = int(t[1])
                pos += 1
                for _ in range(n):
                    mat, refs = parse_surf()
                    obj.surfs.append((mat, refs))
                continue  # parse_surf 已经把 pos 推到位了
            elif key == 'kids':
                n = int(t[1])
                pos += 1
                for _ in range(n):
                    obj.children.append(parse_object())
                return obj
            elif key == 'data':
                pos += 1  # data 后面跟一行原始数据，跳过
            pos += 1

        return obj

    def parse_surf():
        nonlocal pos
        mat = 0
        refs = []
        while pos < len(lines):
            t = tokens(lines[pos])
            if not t:
                pos += 1
                continue
            if t[0] == 'SURF':
                pos += 1
            elif t[0] == 'mat':
                mat = int(t[1])
                pos += 1
            elif t[0] == 'refs':
                n = int(t[1])
                pos += 1
                for i in range(n):
                    a = lines[pos + i].split()
                    refs.append((int(a[0]), float(a[1]), float(a[2])))
                pos += n
                return mat, refs
            else:
                pos += 1
        return mat, refs

    while pos < len(lines):
        t = tokens(lines[pos])
        if not t:
            pos += 1
            continue
        if t[0] == 'MATERIAL':
            m = re.search(r'rgb\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)', lines[pos])
            tr = re.search(r'trans\s+([\d.-]+)', lines[pos])
            materials.append({
                'rgb': tuple(float(m.group(i)) for i in (1, 2, 3)) if m else (0.8, 0.8, 0.8),
                'trans': float(tr.group(1)) if tr else 0.0,
            })
            pos += 1
        elif t[0] == 'OBJECT':
            root = parse_object()
            return root, materials
        else:
            pos += 1

    raise SystemExit('AC3D 文件里没有找到 OBJECT')


# ---------------------------------------------------------------- FlightGear 动画

def parse_fg_animations(xml_path):
    """从 FlightGear 的 xml 里挖出「组定义」和「旋转动画」。

    返回 (groups, rotations)：
      groups    组名 -> [成员部件名]
      rotations 目标名 -> {center, axis}   （已经转成 Blender 坐标）
    """
    text = open(xml_path, encoding='utf-8', errors='replace').read()
    # FG 的 xml 常有多个顶层标签，包一层再解析
    root = ET.fromstring(f'<root>{re.sub(r"<\?xml[^>]*\?>", "", text)}</root>')

    groups, rotations = {}, {}

    for anim in root.iter('animation'):
        names = [o.text.strip() for o in anim.findall('object-name') if o.text]
        gname = anim.find('name')
        atype = anim.find('type')

        # 有 <name> 而没有 <type> 的，是纯粹的分组定义
        if gname is not None and gname.text and atype is None:
            groups[gname.text.strip()] = names
            continue

        if atype is None or atype.text.strip() != 'rotate':
            continue

        c, a = anim.find('center'), anim.find('axis')
        if c is None or a is None:
            continue

        def num(node, tag):
            el = node.find(tag)
            if el is None or not el.text:
                return 0.0
            # 原作者是法国人，xml 里有些数字用逗号当小数点（'-2,4000'）
            return float(el.text.strip().replace(',', '.'))

        center = fg_to_blender(num(c, 'x-m'), num(c, 'y-m'), num(c, 'z-m'))
        axis = fg_to_blender(num(a, 'x'), num(a, 'y'), num(a, 'z'))

        for n in names:
            rotations[n] = {'center': center, 'axis': axis}

    return groups, rotations


# ---------------------------------------------------------------- 建模

def build_materials(ac_materials, tex_dir):
    """AC3D 的材质 + 贴图 → Blender 的 Principled BSDF。

    AC3D 里贴图是挂在物体上的，材质只管颜色，所以最终材质是
    (材质索引, 贴图文件) 的组合，用到时才建。
    """
    cache = {}
    images = {}

    def get(mat_idx, texture):
        key = (mat_idx, texture)
        if key in cache:
            return cache[key]

        src = ac_materials[mat_idx] if mat_idx < len(ac_materials) else {'rgb': (0.8,) * 3, 'trans': 0}
        mat = bpy.data.materials.new(f'm{mat_idx}_{texture or "flat"}')
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*src['rgb'], 1.0)
        bsdf.inputs['Roughness'].default_value = 0.6
        bsdf.inputs['Metallic'].default_value = 0.0

        if src['trans'] > 0.01:
            mat.blend_method = 'BLEND'
            bsdf.inputs['Alpha'].default_value = 1.0 - src['trans']

        if texture:
            path = os.path.join(tex_dir, texture)
            if os.path.exists(path):
                if texture not in images:
                    images[texture] = bpy.data.images.load(path)
                node = mat.node_tree.nodes.new('ShaderNodeTexImage')
                node.image = images[texture]
                mat.node_tree.links.new(bsdf.inputs['Base Color'], node.outputs['Color'])
            else:
                print(f'  [warn] 贴图找不到: {path}')

        cache[key] = mat
        return mat

    return get


def build_mesh(ac_obj, get_material, parent_matrix):
    """把一个 AC3D 物体变成 Blender 网格。

    AC3D 的 UV 是按「面的每个角」存的（同一顶点在不同面上可以有不同 UV），
    所以 UV 必须建在 loop 上，不能建在顶点上——否则接缝处的贴图会撕裂。
    """
    if not ac_obj.verts or not ac_obj.surfs:
        return None

    mesh = bpy.data.meshes.new(ac_obj.name)
    bm = bmesh.new()

    bverts = [bm.verts.new(ac_to_blender(*v)) for v in ac_obj.verts]
    bm.verts.index_update()

    uv_layer = bm.loops.layers.uv.new('UVMap')
    mat_slots = {}

    for mat_idx, refs in ac_obj.surfs:
        if len(refs) < 3:
            continue  # 线段，不是面

        mat = get_material(mat_idx, ac_obj.texture)
        if mat.name not in mat_slots:
            mesh.materials.append(mat)
            mat_slots[mat.name] = len(mat_slots)

        try:
            face = bm.faces.new([bverts[r[0]] for r in refs])
        except ValueError:
            continue  # 重复面，AC3D 里偶有

        face.material_index = mat_slots[mat.name]
        face.smooth = True
        for loop, (_, u, v) in zip(face.loops, refs):
            loop[uv_layer].uv = (u, v)

    if not bm.faces:
        bm.free()
        return None

    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(ac_obj.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = parent_matrix
    return obj


def walk(ac_obj, get_material, parent_matrix, out):
    # AC3D 的 loc 是相对父物体的偏移
    local = Matrix.Translation(ac_to_blender(*ac_obj.loc))
    world = parent_matrix @ local

    obj = build_mesh(ac_obj, get_material, world)
    if obj:
        out[ac_obj.name] = obj

    for child in ac_obj.children:
        walk(child, get_material, world, out)


# ---------------------------------------------------------------- 枢轴

def blender_to_gltf_axis(v):
    """Blender (Z 上) → glTF (Y 上)。

    枢轴的旋转轴得跟着模型一起换坐标系，否则网页里一转，短舱会往错误的方向翻。
    这个值写进 glTF 的 extras，GLTFLoader 会把它放进 object.userData。
    """
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]


def smallest_container_of_mesh(mesh_name, groups_r):
    """一个网格可能同时属于好几个嵌套的组（桨叶既属于螺旋桨也属于短舱），
    只把它挂到最内层的那个组上，外层通过枢轴嵌套自然带上它。"""
    best = None
    for g, ms in groups_r.items():
        if mesh_name in ms and (best is None or len(ms) < len(groups_r[best])):
            best = g
    return best


def make_pivot(name, center, members):
    """建一个空节点当枢轴，把成员挂上去。

    这里一律直接写 matrix_basis（局部矩阵），不要去赋 matrix_world 让 Blender 反算：
    刚设完 parent、依赖图还没更新时，父物体的 matrix_world 是过期的，
    反算出来的局部矩阵会变成单位阵——枢轴的平移就这么被悄悄吞掉。

    成员的世界位置必须原样不动，只是从此跟着枢轴转，所以
    matrix_parent_inverse 取枢轴世界矩阵的逆，正好把枢轴的平移抵消掉。
    """
    pivot = bpy.data.objects.new(name, None)
    pivot.empty_display_type = 'PLAIN_AXES'
    pivot.empty_display_size = 0.8
    pivot.matrix_basis = Matrix.Translation(center)
    bpy.context.collection.objects.link(pivot)

    inv = Matrix.Translation(center).inverted()
    for m in members:
        world = m.matrix_basis.copy()  # 此刻网格还没有父物体，局部即世界
        m.parent = pivot
        m.matrix_parent_inverse = inv
        m.matrix_basis = world

    return pivot


def nest_pivot(child, parent, child_center, parent_center):
    """把一个枢轴挂到另一个枢轴下面（短舱 → 机翼，旋翼 → 短舱）。

    枢轴都是纯平移，所以局部偏移就是「子中心 − 父中心」，直接算，
    不用碰 matrix_world。
    """
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.matrix_basis = Matrix.Translation(child_center - parent_center)


# ---------------------------------------------------------------- 主流程

def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    if len(argv) != 3:
        raise SystemExit('用法: ... -- <in.ac> <in.xml> <out.glb>')
    ac_path, xml_path, out_path = argv

    bpy.ops.wm.read_factory_settings(use_empty=True)

    print(f'解析 {ac_path}')
    root, ac_materials = parse_ac3d(ac_path)
    groups, rotations = parse_fg_animations(xml_path)
    print(f'  材质 {len(ac_materials)} 个 · 分组 {len(groups)} 个 · 旋转动画 {len(rotations)} 条')

    get_material = build_materials(ac_materials, os.path.dirname(ac_path))

    objects = {}
    walk(root, get_material, Matrix.Identity(4), objects)
    print(f'  建出 {len(objects)} 个网格')

    # 把 FlightGear 定义的旋转组变成枢轴节点。
    #
    # 这些组是嵌套的：短舱(LesMoteurs) ⊃ 螺旋桨(HeliceGauche) ⊃ 单片桨叶(PiedPale*)。
    # 如果把它们建成兄弟节点，短舱一倾转，螺旋桨会留在原地——所以必须按
    # 成员集合的包含关系还原出真正的父子树。
    groups_r = {g: set(m) for g, m in groups.items()
                if g in rotations and any(n in objects for n in m)}

    def smallest_container(name, members):
        """找出真正包含 members 的、最小的那个组。"""
        best = None
        for g, ms in groups_r.items():
            if g == name or not members < ms:      # 必须是真子集
                continue
            if best is None or len(ms) < len(groups_r[best]):
                best = g
        return best

    # 先按成员数从大到小建枢轴（父的先建），再挂接
    order = sorted(groups_r, key=lambda g: -len(groups_r[g]))
    pivot_objs, pivots = {}, []

    for gname in order:
        members = groups_r[gname]
        # 网格只挂给「最小的包含它的组」，避免被外层组抢走
        own = [objects[n] for n in members
               if n in objects
               and smallest_container_of_mesh(n, groups_r) == gname]
        r = rotations[gname]
        pivot = make_pivot(gname, r['center'], own)
        # Blender 的自定义属性会被 glTF 导出器写进节点 extras，
        # 网页端读 object.userData.fgAxis 就能拿到旋转轴，不用在前端硬编码。
        pivot['fgAxis'] = blender_to_gltf_axis(r['axis'].normalized())
        pivot_objs[gname] = pivot
        pivots.append((gname, r, [objects[n] for n in members if n in objects]))

    # 枢轴之间再按包含关系嵌套
    for gname in order:
        parent = smallest_container(gname, groups_r[gname])
        if parent:
            nest_pivot(pivot_objs[gname], pivot_objs[parent],
                       rotations[gname]['center'], rotations[parent]['center'])
            print(f'  枢轴 {gname} → 挂在 {parent} 下')
        else:
            print(f'  枢轴 {gname}（顶层）· 中心 {tuple(round(v, 3) for v in rotations[gname]["center"])}')

    bpy.context.view_layer.update()  # 导出前把依赖图刷新到位

    if not pivots:
        print('  [warn] 一个枢轴都没建出来')

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_yup=True,
        export_apply=False,           # 保住层级，别把变换烘进网格
        export_texture_dir='',
        export_materials='EXPORT',
        export_extras=True,           # 把 fgAxis 带出去
    )
    size = os.path.getsize(out_path)
    print(f'导出 {out_path} · {size / 1024 / 1024:.2f} MB')

    # 自检：枢轴该落在短舱附近，不该飘在天上
    for gname, r, objs in pivots:
        pts = [o.matrix_world.translation for o in objs]
        avg = sum(pts, Vector()) / len(pts)
        print(f'  自检 {gname}: 枢轴到成员几何中心 {(avg - r["center"]).length:.2f} m')


main()
