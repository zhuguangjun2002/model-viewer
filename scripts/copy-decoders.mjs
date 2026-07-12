// Draco 和 KTX2 的解码器是二进制 wasm，必须作为静态文件伺服，
// 不能走 Vite 的模块打包。从 node_modules 拷到 public/ 下。
import { cp, mkdir } from 'node:fs/promises';

const pairs = [
  ['node_modules/three/examples/jsm/libs/draco/', 'public/decoders/draco/'],
  ['node_modules/three/examples/jsm/libs/basis/', 'public/decoders/basis/'],
];

for (const [from, to] of pairs) {
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
