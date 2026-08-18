// public/models/v22-fg.glb 不在仓库里 —— 它是 GPL v2 的衍生件，为了让本仓库
// 保持纯 MIT 分发而没有入库（缘由见 THIRD-PARTY.md）。
// 但 tilt / rigid / close 三个测试都靠它，缺了会卡成一句莫名其妙的 puppeteer 超时。
// 所以先探一下，缺了就直接说清楚怎么补。
export async function requireV22(baseUrl) {
  const url = new URL('/models/v22-fg.glb', baseUrl).href;
  let ok = false;
  try {
    // 不能只看状态码：Vite 的 SPA fallback 会把缺失的文件回成 200 + index.html。
    // 读前 4 字节验 glTF 魔数才作数（顺带也挡住转坏了的 glb）。
    const res = await fetch(url, { headers: { Range: 'bytes=0-3' } });
    const magic = new TextDecoder().decode(await res.arrayBuffer());
    ok = res.ok && magic === 'glTF';
  } catch {
    console.error(`\n❌ 连不上 dev server（${baseUrl}）——先 npm run dev。`);
    console.error('   端口漂移时用 URL=http://localhost:5174/ 覆盖。\n');
    process.exit(1);
  }
  if (ok) return;

  console.error(`\n❌ 缺少 public/models/v22-fg.glb —— 这个测试没它跑不了。`);
  console.error('   该文件是 GPL v2 的衍生件，故意没有入库，需要自己转一份：\n');
  console.error('     git clone --depth 1 https://github.com/FGMEMBERS/V22-Osprey.git');
  console.error('     BL="/mnt/c/Program Files/Blender Foundation/Blender 5.1/blender.exe"');
  console.error('     "$BL" --background --python "$(wslpath -w tools/ac3d_to_gltf.py)" -- \\');
  console.error('       "$(wslpath -w V22-Osprey/Models/v22.ac)" \\');
  console.error('       "$(wslpath -w V22-Osprey/Models/v22.xml)" \\');
  console.error('       "$(wslpath -w public/models/v22-fg.glb)"\n');
  console.error('   详见 README 的「关于 V-22 Osprey」和 THIRD-PARTY.md。\n');
  process.exit(1);
}
