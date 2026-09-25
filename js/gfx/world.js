/**
 * ダンジョンのマップから 3D の地形（床・壁・階段・装飾）と光源を組み立てる
 * 座標：タイル (gx, gy) の中心 = ワールド (gx + 0.5, 0, gy + 0.5)。Y が上
 */
import { MeshBuilder, MAT } from './geometry.js?v=20260925_02';
import { hexToRgb } from './math.js?v=20260925_02';
import { CONFIG } from '../config.js?v=20260925_02';

export const WALL_H = 1.25;

const FLOOR_COLOR = hexToRgb('#8a826f');
const CORRIDOR_COLOR = hexToRgb('#7a6d5c');
const WALL_COLOR = hexToRgb('#8b8374');
const TOP_COLOR = hexToRgb('#2b2824');
const CAVE_FLOOR = hexToRgb('#6e6150');
const CAVE_WALL = hexToRgb('#7a6a58');
const DOOR_FRAME_COLOR = hexToRgb('#a0957f');
// 扉の開口部の高さ
export const DOOR_H = 0.95;

// タイルごとの決まった乱数
function tileRand(x, y, seed = 0) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

export function buildWorld(map) {
  const b = new MeshBuilder();
  const T = CONFIG.TILES;
  const W = map.width, H = map.height;
  // 床として作るマス（壁以外。閉じた扉のマスも床を張る）
  const walk = (x, y) => map.getTile(x, y) !== T.WALL;
  const cave = map.style === 'mines';
  const isStairs = (x, y) => map.stairs && map.stairs.x === x && map.stairs.y === y;
  // 壁として立体化するマス（歩けるマスに接している壁）
  const built = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (map.getTile(x, y) !== T.WALL) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && walk(x + dx, y + dy)) return true;
      }
    }
    return false;
  };

  const lights = [];
  const flames = [];

  // --- 床 ---
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!walk(x, y) || isStairs(x, y)) continue;
      const inRoom = !!map.getRoomAt(x, y) || map.getTile(x, y) === T.DOOR;
      b.set({
        color: cave ? CAVE_FLOOR : (inRoom ? FLOOR_COLOR : CORRIDOR_COLOR), rough: 0.9, metal: 0, emissive: 0,
        material: cave ? MAT.ROCK : (inRoom ? MAT.FLAGSTONE : MAT.COBBLE), ao: 1,
      });
      // 壁際の四隅を暗くする（頂点 AO）
      const ao = (cx, cy) => {
        let occ = 0;
        for (const [dx, dy] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
          if (!walk(x + dx, y + dy)) occ++;
        }
        return 1 - occ * 0.17;
      };
      b.quad([x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x, 0, y], [0, 1, 0],
        [ao(0, 1), ao(1, 1), ao(1, 0), ao(0, 0)]);
    }
  }

  // --- 下り階段：床に開いた穴と、青く光る奥へ降りていく石段 ---
  if (map.stairs) {
    const sx = map.stairs.x, sy = map.stairs.y;
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const d = 0.16 * (i + 1);
      const zTop = sy + 1 - i / steps, zBot = sy + 1 - (i + 1) / steps;
      const shade = 1 - i * 0.16;
      b.set({ color: WALL_COLOR.map(c => c * shade), rough: 0.9, metal: 0, emissive: 0, material: MAT.BRICK, ao: 1 });
      // 踏み面と蹴上げ（奥＝北側ほど深い）
      b.quad([sx, -d, zTop], [sx + 1, -d, zTop], [sx + 1, -d, zBot], [sx, -d, zBot], [0, 1, 0]);
      b.quad([sx, -d, zTop], [sx + 1, -d, zTop], [sx + 1, -d + 0.16, zTop], [sx, -d + 0.16, zTop], [0, 0, 1]);
    }
    // 穴の側壁
    b.set({ color: WALL_COLOR.map(c => c * 0.5), rough: 0.9, metal: 0, emissive: 0, material: MAT.BRICK, ao: 0.7 });
    b.quad([sx, -1, sy + 1], [sx, -1, sy], [sx, 0, sy], [sx, 0, sy + 1], [1, 0, 0]);
    b.quad([sx + 1, -1, sy], [sx + 1, -1, sy + 1], [sx + 1, 0, sy + 1], [sx + 1, 0, sy], [-1, 0, 0]);
    b.quad([sx, -1, sy], [sx + 1, -1, sy], [sx + 1, 0, sy], [sx, 0, sy], [0, 0, 1]);
    // 縁の石
    b.set({ color: hexToRgb('#b3aa96'), rough: 0.8, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 });
    for (const [x0, z0, w, d] of [[sx, sy + 1, 1, 0.08], [sx - 0.04, sy, 0.08, 1], [sx + 0.96, sy, 0.08, 1]]) {
      b.push().translate(x0 + w / 2, 0.03, z0 + d / 2 - (z0 === sy + 1 ? 0.04 : 0)).box(w, 0.06, d).pop();
    }
    lights.push({ x: sx + 0.5, y: -0.4, z: sy + 0.4, color: hexToRgb('#4fb4ff'), radius: 3, intensity: 1.4, flicker: 0.1, seed: 9 });
  }

  // --- 壁 ---
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!built(x, y)) continue;
      const cx = x + 0.5, cz = y + 0.5;
      // 歩けるマスに面した側だけ面を作る（それ以外は闇に溶けるので不要）
      const faces = {
        px: walk(x + 1, y), nx: walk(x - 1, y), pz: walk(x, y + 1), nz: walk(x, y - 1), py: 0, ny: 0,
      };
      // 部屋を囲む壁は石積み、通路を掘った周りは素掘りの岩肌
      let masonry = false;
      for (let dy = -1; dy <= 1 && !masonry; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = map.getTile(x + dx, y + dy);
          if ((t === T.FLOOR && map.getRoomAt(x + dx, y + dy)) || t === T.DOOR) { masonry = true; break; }
        }
      }
      if (map.style === 'maze') masonry = true;
      if (!masonry) {
        // 岩肌：高さを不揃いにして坑道らしく
        const hh = WALL_H * (cave ? 0.75 + tileRand(x, y, 11) * 0.8 : 0.95 + tileRand(x, y, 11) * 0.25);
        b.set({ color: CAVE_WALL.map(c => c * (0.85 + tileRand(x, y, 12) * 0.3)), rough: 0.9, metal: 0, emissive: 0, material: MAT.ROCK, ao: 1 });
        b.push().translate(cx, hh / 2, cz).box(1, hh, 1, faces).pop();
        b.set({ color: TOP_COLOR, rough: 0.95, metal: 0, emissive: 0, material: MAT.WALLTOP, ao: 1 });
        b.push().translate(cx, hh, cz).box(1, 0.001, 1, { py: 1 }).pop();
        continue;
      }
      b.set({ color: WALL_COLOR, rough: 0.9, metal: 0, emissive: 0, material: MAT.BRICK, ao: 1 });
      b.push().translate(cx, WALL_H / 2, cz).box(1, WALL_H, 1, faces).pop();
      // 天面
      b.set({ color: TOP_COLOR, rough: 0.95, metal: 0, emissive: 0, material: MAT.WALLTOP, ao: 1 });
      b.push().translate(cx, WALL_H, cz).box(1, 0.001, 1, { py: 1 }).pop();
      // 足元の張り出し（台座）と天端の笠石
      b.set({ color: WALL_COLOR.map(c => c * 0.8), rough: 0.9, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 0.8 });
      const ledge = (dx, dz) => {
        const w = dx ? 0.08 : 1, d = dz ? 0.08 : 1;
        b.push().translate(cx + dx * 0.53, 0.06, cz + dz * 0.53).box(w, 0.12, d).pop();
        b.push().translate(cx + dx * 0.52, WALL_H - 0.04, cz + dz * 0.52).box(dx ? 0.06 : 1.02, 0.08, dz ? 0.06 : 1.02).pop();
      };
      if (faces.px) ledge(1, 0);
      if (faces.nx) ledge(-1, 0);
      if (faces.pz) ledge(0, 1);
      if (faces.nz) ledge(0, -1);
    }
  }

  // --- 洞窟の石筍・落石（壁際に寄せて置く。通行の邪魔にはならない飾り） ---
  if (cave) {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (map.getTile(x, y) !== T.FLOOR || isStairs(x, y)) continue;
        const t = tileRand(x, y, 21);
        if (t > 0.9) buildRubble(b, x + 0.5, y + 0.5, x * 13 + y);
        else if (t > 0.86) {
          // 壁の方向へ寄せた石筍
          let ox = 0, oz = 0;
          if (map.getTile(x - 1, y) === T.WALL) ox = -0.35; else if (map.getTile(x + 1, y) === T.WALL) ox = 0.35;
          if (map.getTile(x, y - 1) === T.WALL) oz = -0.35; else if (map.getTile(x, y + 1) === T.WALL) oz = 0.35;
          if (!ox && !oz) continue;
          const h = 0.25 + tileRand(x, y, 22) * 0.45;
          b.set({ color: CAVE_WALL, rough: 0.9, metal: 0, emissive: 0, material: MAT.ROCK, ao: 1 })
            .push().translate(x + 0.5 + ox, 0, y + 0.5 + oz).cylinder(0.12, 0.01, h, 7).pop();
        }
      }
    }
  }

  // --- 扉の枠：開口部の上のまぐさ石と、両脇の石の柱 ---
  for (const door of map.doors.values()) {
    const { x, y } = door;
    const cx = x + 0.5, cz = y + 0.5;
    // 左右が壁なら南北に抜ける出入口（扉は東西方向に広がる）
    const ns = map.getTile(x - 1, y) === T.WALL && map.getTile(x + 1, y) === T.WALL;
    b.set({ color: WALL_COLOR, rough: 0.9, metal: 0, emissive: 0, material: MAT.BRICK, ao: 1 });
    b.push().translate(cx, (DOOR_H + WALL_H) / 2, cz).box(ns ? 1 : 0.9, WALL_H - DOOR_H, ns ? 0.9 : 1).pop();
    b.set({ color: TOP_COLOR, rough: 0.95, metal: 0, emissive: 0, material: MAT.WALLTOP, ao: 1 });
    b.push().translate(cx, WALL_H, cz).box(1, 0.001, 1, { py: 1 }).pop();
    b.set({ color: DOOR_FRAME_COLOR, rough: 0.85, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 });
    for (const s of [-1, 1]) {
      b.push().translate(cx + (ns ? s * 0.45 : 0), DOOR_H / 2, cz + (ns ? 0 : s * 0.45)).box(ns ? 0.1 : 0.16, DOOR_H, ns ? 0.16 : 0.1).pop();
    }
    b.push().translate(cx, DOOR_H + 0.04, cz).box(ns ? 1.0 : 0.2, 0.1, ns ? 0.2 : 1.0).pop();
    // 敷居
    b.set({ color: DOOR_FRAME_COLOR.map(c => c * 0.8), rough: 0.9, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 });
    b.push().translate(cx, 0.015, cz).box(ns ? 0.9 : 0.25, 0.03, ns ? 0.25 : 0.9).pop();
  }

  // --- 部屋の装飾：北側の壁の松明・旗、角の柱、床の瓦礫や骨 ---
  for (const r of map.rooms) {
    const wallY = r.y - 1;
    // 松明（北の壁に3〜4マスおき）。暗い部屋は火が消えている
    for (let x = r.x + 1; x < r.x + r.w - 1; x += 3) {
      if (map.getTile(x, wallY) !== T.WALL) continue;
      const tx = x + 0.5, tz = r.y + 0.02;
      buildSconce(b, tx, 0.82, tz, r.lit !== false);
      if (r.lit === false) continue;
      flames.push({ x: tx, y: 1.02, z: tz + 0.1 });
      lights.push({ x: tx, y: 1.0, z: tz + 0.35, color: hexToRgb('#ff9a3c'), radius: 5, intensity: 0.95, flicker: 0.35, seed: x * 7 + r.y });
    }
    // 旗（松明の間）
    for (let x = r.x + 2; x < r.x + r.w - 1; x += 6) {
      if (map.getTile(x, wallY) !== T.WALL) continue;
      buildBanner(b, x + 0.5, r.y + 0.03, tileRand(x, r.y) > 0.5 ? '#7f1d1d' : '#1e3a8a');
    }
    // 四隅の柱
    for (const [px, pz] of [[r.x + 0.18, r.y + 0.18], [r.x + r.w - 0.18, r.y + 0.18], [r.x + 0.18, r.y + r.h - 0.18], [r.x + r.w - 0.18, r.y + r.h - 0.18]]) {
      buildPillar(b, px, pz);
    }
    // 床の散らばり（瓦礫・骨・頭蓋骨）
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const t = tileRand(x, y, 3);
        if (t > 0.9 && !(map.stairs && map.stairs.x === x && map.stairs.y === y)) {
          const ox = x + 0.2 + tileRand(x, y, 4) * 0.6, oz = y + 0.2 + tileRand(x, y, 5) * 0.6;
          if (t > 0.975) buildSkull(b, ox, oz, tileRand(x, y, 6) * 6);
          else if (t > 0.95) buildBones(b, ox, oz, tileRand(x, y, 7) * 6);
          else buildRubble(b, ox, oz, x * 31 + y);
        }
      }
    }
  }

  return { vertices: b.toArray(), lights, flames };
}

function buildSconce(b, x, y, z, lit = true) {
  const iron = { color: hexToRgb('#3b3f46'), rough: 0.4, metal: 1, emissive: 0, material: MAT.METAL, ao: 1 };
  b.set(iron).push().translate(x, y, z + 0.02).box(0.12, 0.2, 0.04).pop();
  b.set(iron).push().translate(x, y + 0.05, z + 0.08).rotate('x', 0.5).box(0.035, 0.035, 0.16).pop();
  b.set({ color: hexToRgb('#4a2e1a'), rough: 0.8, metal: 0, emissive: 0, material: MAT.WOOD, ao: 1 })
    .push().translate(x, y + 0.03, z + 0.12).rotate('x', 0.25).cylinder(0.025, 0.035, 0.18, 8).pop();
  if (lit) {
    b.set({ color: hexToRgb('#ff8c2a'), rough: 0.5, metal: 0, emissive: 2.5, material: MAT.GLOW, ao: 1 })
      .push().translate(x, y + 0.2, z + 0.1).sphere(0.04, 8, 6).pop();
  } else {
    // 燃え尽きた松明の炭
    b.set({ color: [0.05, 0.04, 0.04], rough: 1, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 })
      .push().translate(x, y + 0.2, z + 0.1).sphere(0.035, 8, 6).pop();
  }
}

function buildBanner(b, x, z, hex) {
  const cloth = { color: hexToRgb(hex), rough: 0.9, metal: 0, emissive: 0, material: MAT.FABRIC, ao: 1 };
  const gold = { color: hexToRgb('#d4a017'), rough: 0.35, metal: 0.9, emissive: 0, material: MAT.METAL, ao: 1 };
  b.set(gold).push().translate(x, 1.08, z + 0.04).rotate('z', Math.PI / 2).translate(0, -0.26, 0).cylinder(0.018, 0.018, 0.52, 8).pop();
  // 布（下端を燕尾に切った形）
  const top = 1.06, bot = 0.35, w = 0.2;
  b.set(cloth);
  b.quad([x - w, bot + 0.1, z + 0.035], [x, bot + 0.2, z + 0.035], [x, top, z + 0.035], [x - w, top, z + 0.035], [0, 0, 1]);
  b.quad([x, bot + 0.2, z + 0.035], [x + w, bot + 0.1, z + 0.035], [x + w, top, z + 0.035], [x, top, z + 0.035], [0, 0, 1]);
  b.quad([x - w, bot, z + 0.035], [x - w * 0.2, bot + 0.2, z + 0.035], [x - w * 0.2, bot + 0.2, z + 0.035], [x - w, bot + 0.1, z + 0.035], [0, 0, 1]);
  // 紋章
  b.set(gold).push().translate(x, 0.78, z + 0.045).rotate('z', Math.PI / 4).box(0.12, 0.12, 0.01).pop();
  b.set({ ...gold, color: hexToRgb(hex).map(c => c * 0.6) }).push().translate(x, 0.78, z + 0.05).rotate('z', Math.PI / 4).box(0.07, 0.07, 0.01).pop();
  b.set(gold).push().translate(x, bot + 0.12, z + 0.04).box(w * 2, 0.02, 0.01).pop();
}

function buildPillar(b, x, z) {
  const stone = { color: hexToRgb('#a39a88'), rough: 0.85, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  b.set({ ...stone, ao: 0.8 }).push().translate(x, 0.06, z).box(0.3, 0.12, 0.3).pop();
  b.set(stone).push().translate(x, 0.12, z).cylinder(0.1, 0.09, 1.0, 12, false).pop();
  // 縦溝の代わりに輪を2本
  b.set({ ...stone, color: hexToRgb('#8c8474') }).push().translate(x, 0.3, z).torus(0.105, 0.012, 14, 4).pop();
  b.set({ ...stone, color: hexToRgb('#8c8474') }).push().translate(x, 0.95, z).torus(0.1, 0.012, 14, 4).pop();
  b.set(stone).push().translate(x, 1.16, z).box(0.26, 0.08, 0.26).pop();
}

function buildRubble(b, x, z, seed) {
  const stone = { color: hexToRgb('#7d7566'), rough: 0.95, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  for (let i = 0; i < 4; i++) {
    const r = 0.03 + tileRand(seed, i, 1) * 0.05;
    b.set(stone).push().translate(x + (tileRand(seed, i, 2) - 0.5) * 0.3, r * 0.5, z + (tileRand(seed, i, 3) - 0.5) * 0.3)
      .rotate('y', tileRand(seed, i, 4) * 3).ellipsoid(r * 1.3, r * 0.8, r, 6, 4).pop();
  }
}

function buildBones(b, x, z, rot) {
  const bone = { color: hexToRgb('#d9cfb8'), rough: 0.7, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  b.push().translate(x, 0.015, z).rotate('y', rot);
  for (const [dx, a] of [[0, 0], [0.05, 0.9]]) {
    b.set(bone).push().translate(dx, 0, 0).rotate('y', a).rotate('z', Math.PI / 2).translate(0, -0.1, 0).cylinder(0.012, 0.012, 0.2, 6).pop();
    b.set(bone).push().translate(dx, 0, 0).rotate('y', a).translate(0.1, 0, 0).sphere(0.02, 6, 4).pop();
    b.set(bone).push().translate(dx, 0, 0).rotate('y', a).translate(-0.1, 0, 0).sphere(0.02, 6, 4).pop();
  }
  b.pop();
}

function buildSkull(b, x, z, rot) {
  const bone = { color: hexToRgb('#e3d8c0'), rough: 0.6, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  const dark = { color: [0.02, 0.02, 0.02], rough: 1, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  b.push().translate(x, 0.06, z).rotate('y', rot);
  b.set(bone).ellipsoid(0.07, 0.065, 0.08, 12, 8);
  b.set(bone).push().translate(0, -0.035, 0.045).box(0.07, 0.04, 0.05).pop();
  b.set(dark).push().translate(-0.025, 0.0, 0.066).sphere(0.017, 6, 4).pop();
  b.set(dark).push().translate(0.025, 0.0, 0.066).sphere(0.017, 6, 4).pop();
  b.pop();
}
