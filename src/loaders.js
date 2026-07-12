import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// 免费模型站给的格式很杂：Sketchfab 给 glTF，Free3D/TurboSquid 常给 OBJ/FBX，
// GrabCAD 给 CAD 导出的 STL。四种都收，省得来回转格式。
const extOf = (name) => name.split('?')[0].split('.').pop().toLowerCase();

function makeGLTFLoader(manager, renderer) {
  const draco = new DRACOLoader(manager).setDecoderPath('/decoders/draco/');
  const ktx2 = new KTX2Loader(manager)
    .setTranscoderPath('/decoders/basis/')
    .detectSupport(renderer);

  return new GLTFLoader(manager)
    .setDRACOLoader(draco)
    .setKTX2Loader(ktx2)
    .setMeshoptDecoder(MeshoptDecoder);
}

/**
 * 从 URL 加载模型。
 * @returns {Promise<{scene: THREE.Object3D, animations: THREE.AnimationClip[]}>}
 */
export async function loadFromURL(url, renderer, onProgress) {
  const manager = new THREE.LoadingManager();
  const ext = extOf(url);

  // .glb 是单文件，自己 fetch 更好：能拿到准确的字节数和真实进度。
  // （跨域资源的 Performance API 读不到大小，除非服务器给了 Timing-Allow-Origin。）
  if (ext === 'glb') {
    const { buffer, bytes } = await fetchWithProgress(url, onProgress);
    const gltf = await makeGLTFLoader(manager, renderer).parseAsync(buffer, '');
    return { scene: gltf.scene, animations: gltf.animations ?? [], bytes };
  }

  return loadWith(manager, url, ext, renderer, onProgress);
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} —— 链接取不到文件`);

  const total = Number(res.headers.get('content-length')) || 0;
  const chunks = [];
  let loaded = 0;

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total) onProgress?.(loaded / total);
  }

  const buffer = await new Blob(chunks).arrayBuffer();
  return { buffer, bytes: loaded };
}

/**
 * 从拖进来的一堆 File 加载。
 *
 * .gltf 是"散装"的：一个 json + 一个 .bin + 一堆贴图，靠相对路径互相引用。
 * 浏览器里没有文件系统，所以要把每个文件转成 blob: URL，再教 LoadingManager
 * 把模型里写的相对路径改写成对应的 blob: URL。.glb 是打包好的，没这个问题。
 */
export async function loadFromFiles(files, renderer, onProgress) {
  const blobs = new Map(); // 归一化后的路径 -> blob URL
  for (const f of files) {
    const path = (f.webkitRelativePath || f.name).replace(/^.*?[\\/]/, '');
    blobs.set(normalize(path), URL.createObjectURL(f));
    blobs.set(normalize(f.name), URL.createObjectURL(f));
  }

  const root = [...files].find((f) => /\.(glb|gltf|fbx|obj|stl)$/i.test(f.name));
  if (!root) throw new Error('没找到可识别的模型文件（.glb/.gltf/.fbx/.obj/.stl）');

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    return blobs.get(normalize(decodeURIComponent(url))) ?? url;
  });

  const result = await loadWith(
    manager,
    URL.createObjectURL(root),
    extOf(root.name),
    renderer,
    onProgress,
    blobs,
  );
  result.bytes = [...files].reduce((n, f) => n + f.size, 0);
  result.name = root.name;
  return result;
}

const normalize = (p) => p.replace(/\\/g, '/').replace(/^\.?\//, '').split('/').pop();

async function loadWith(manager, url, ext, renderer, onProgress, blobs) {
  const progress = (e) => onProgress?.(e.lengthComputable ? e.loaded / e.total : 0);

  switch (ext) {
    case 'glb':
    case 'gltf': {
      const gltf = await makeGLTFLoader(manager, renderer).loadAsync(url, progress);
      return { scene: gltf.scene, animations: gltf.animations ?? [] };
    }
    case 'fbx': {
      const scene = await new FBXLoader(manager).loadAsync(url, progress);
      return { scene, animations: scene.animations ?? [] };
    }
    case 'obj': {
      // OBJ 的材质在单独的 .mtl 里。有就用，没有就给个默认灰材质。
      const loader = new OBJLoader(manager);
      const mtl = blobs && [...blobs.keys()].find((k) => k.endsWith('.mtl'));
      if (mtl) {
        const materials = await new MTLLoader(manager).loadAsync(blobs.get(mtl));
        materials.preload();
        loader.setMaterials(materials);
      }
      return { scene: await loader.loadAsync(url, progress), animations: [] };
    }
    case 'stl': {
      // STL 只有三角面，连法线都不一定对，更没有 UV 和材质。
      const geometry = await new STLLoader(manager).loadAsync(url, progress);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.1, roughness: 0.65 }),
      );
      const scene = new THREE.Group();
      scene.add(mesh);
      return { scene, animations: [] };
    }
    default:
      throw new Error(`不支持的格式：.${ext}`);
  }
}
