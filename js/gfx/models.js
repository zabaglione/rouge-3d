/**
 * 手続き的に組み立てる 3D モデル：プレイヤー（騎士）・アイテム・宝箱など
 * 単位は 1 = 1マス。モデルは +Z を正面、Y を上として作る。
 */
import { MeshBuilder, MAT } from './geometry.js?v=20260925_02';
import { hexToRgb } from './math.js?v=20260925_02';
import { ITEM_TYPES } from '../items/Item.js?v=20260925_02';

const STEEL = { color: hexToRgb('#d5dde6'), rough: 0.32, metal: 0.75, emissive: 0, material: MAT.METAL };
const DARK_STEEL = { color: hexToRgb('#6b7582'), rough: 0.4, metal: 0.7, emissive: 0, material: MAT.METAL };
const GOLD = { color: hexToRgb('#f2b544'), rough: 0.25, metal: 1, emissive: 0, material: MAT.METAL };
const LEATHER = { color: hexToRgb('#5a3620'), rough: 0.75, metal: 0, emissive: 0, material: MAT.PLAIN };
const CRIMSON = { color: hexToRgb('#a3131c'), rough: 0.85, metal: 0, emissive: 0, material: MAT.FABRIC };
const WOOD = { color: hexToRgb('#6b4426'), rough: 0.7, metal: 0, emissive: 0, material: MAT.WOOD };

// 騎士の腰の高さ（脚の付け根）と肩の位置
export const HIP_Y = 0.4;
export const SHOULDER = { x: 0.2, y: 0.29 };

function glow(hex, strength = 1) {
  return { color: hexToRgb(hex), rough: 0.3, metal: 0, emissive: strength, material: MAT.GLOW };
}

// --- プレイヤー：兜に羽飾り、板金鎧に紋章入りの陣羽織、剣と盾を持つ騎士 ---

// 胴体・頭（腰を原点）
function buildBody() {
  const b = new MeshBuilder();
  // 胸甲
  b.set(STEEL).push().translate(0, 0.17, 0).roundBox(0.31, 0.3, 0.21, 0.5).pop();
  // 胸の稜線
  b.set(STEEL).push().translate(0, 0.2, 0.1).rotate('z', Math.PI / 4).box(0.03, 0.03, 0.03).pop();
  // 陣羽織（前後）と金の縁
  b.set(CRIMSON).push().translate(0, 0.06, 0.112).box(0.21, 0.36, 0.015).pop();
  b.set(CRIMSON).push().translate(0, 0.06, -0.112).box(0.23, 0.36, 0.015).pop();
  b.set(GOLD).push().translate(0, -0.12, 0.121).box(0.21, 0.018, 0.006).pop();
  b.set(GOLD).push().translate(-0.105, 0.06, 0.121).box(0.012, 0.36, 0.006).pop();
  b.set(GOLD).push().translate(0.105, 0.06, 0.121).box(0.012, 0.36, 0.006).pop();
  // 紋章（金の菱形と中央の宝石）
  b.set(GOLD).push().translate(0, 0.14, 0.123).rotate('z', Math.PI / 4).box(0.075, 0.075, 0.008).pop();
  b.set(glow('#38bdf8', 1.2)).push().translate(0, 0.14, 0.128).sphere(0.017, 10, 6).pop();
  // ベルトとバックル
  b.set(LEATHER).push().translate(0, 0.01, 0).box(0.32, 0.05, 0.225).pop();
  b.set(GOLD).push().translate(0, 0.01, 0.116).box(0.05, 0.045, 0.012).pop();
  // 腰の垂れ（草摺）
  for (const sx of [-1, 1]) {
    b.set(DARK_STEEL).push().translate(sx * 0.1, -0.05, 0.02).rotate('z', sx * 0.15).roundBox(0.11, 0.1, 0.2, 0.4).pop();
  }
  // 肩当て
  for (const sx of [-1, 1]) {
    b.set(STEEL).push().translate(sx * SHOULDER.x, SHOULDER.y, 0).rotate('z', -sx * 0.35)
      .ellipsoid(0.1, 0.075, 0.105, 14, 8, 0, 0.55).pop();
    b.set(GOLD).push().translate(sx * SHOULDER.x, SHOULDER.y + 0.005, 0).rotate('z', -sx * 0.35)
      .torus(0.085, 0.008, 16, 4).pop();
  }
  // 首
  b.set(LEATHER).push().translate(0, 0.33, 0).cylinder(0.05, 0.05, 0.06, 10).pop();
  // 兜（丸い頭頂・面頬・目の隙間から漏れる光）
  const headY = 0.44;
  b.set(STEEL).push().translate(0, headY, 0).ellipsoid(0.12, 0.125, 0.125, 18, 12).pop();
  b.set(STEEL).push().translate(0, headY - 0.04, 0.02).roundBox(0.2, 0.13, 0.2, 0.5).pop();
  b.set(DARK_STEEL).push().translate(0, headY + 0.005, 0.104).box(0.17, 0.028, 0.03).pop();
  b.set(glow('#7dd3fc', 2.5)).push().translate(-0.035, headY + 0.005, 0.12).box(0.04, 0.009, 0.006).pop();
  b.set(glow('#7dd3fc', 2.5)).push().translate(0.035, headY + 0.005, 0.12).box(0.04, 0.009, 0.006).pop();
  // 面頬の通気孔
  for (let i = -2; i <= 2; i++) {
    b.set(DARK_STEEL).push().translate(i * 0.022, headY - 0.06, 0.118).box(0.008, 0.04, 0.01).pop();
  }
  // 兜の稜と金の縁
  b.set(GOLD).push().translate(0, headY + 0.02, 0).box(0.018, 0.2, 0.25).pop();
  // 羽飾り（赤い羽根を弧状に並べる）
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = 0.08 - t * 0.3;
    const y = headY + 0.13 + Math.sin(t * Math.PI) * 0.07 - t * t * 0.1;
    b.set({ ...CRIMSON, color: hexToRgb(i % 2 ? '#c81e2a' : '#e8323c') })
      .push().translate(0, y, z).rotate('x', -0.4 - t * 0.8).ellipsoid(0.03 + 0.012 * Math.sin(t * Math.PI), 0.07, 0.03, 8, 6).pop();
  }
  // 腰の小さなランタン（冒険の明かり）
  b.set(DARK_STEEL).push().translate(-0.17, -0.02, 0.07).box(0.055, 0.075, 0.055).pop();
  b.set(glow('#ffb347', 3)).push().translate(-0.17, -0.02, 0.07).box(0.04, 0.055, 0.058).pop();
  b.set(DARK_STEEL).push().translate(-0.17, 0.025, 0.07).cylinder(0.035, 0.0, 0.03, 8).pop();
  return b.toArray();
}

// 脚（腰の関節を原点に下へ伸びる）
function buildLeg() {
  const b = new MeshBuilder();
  b.set(LEATHER).push().translate(0, -0.1, 0).roundBox(0.1, 0.2, 0.11, 0.5).pop();
  b.set(STEEL).push().translate(0, -0.12, 0.02).roundBox(0.11, 0.15, 0.08, 0.5).pop();
  b.set(STEEL).push().translate(0, -0.2, 0.05).sphere(0.04, 10, 6).pop();
  b.set(STEEL).push().translate(0, -0.29, 0.005).roundBox(0.1, 0.18, 0.11, 0.5).pop();
  // ブーツ
  b.set(DARK_STEEL).push().translate(0, -0.36, 0.035).roundBox(0.115, 0.08, 0.2, 0.6).pop();
  b.set(GOLD).push().translate(0, -0.33, 0.0).box(0.118, 0.012, 0.13).pop();
  return b.toArray();
}

// 腕（肩の関節を原点に下へ伸びる）
function buildArm() {
  const b = new MeshBuilder();
  b.set(LEATHER).push().translate(0, -0.09, 0).roundBox(0.08, 0.18, 0.085, 0.5).pop();
  b.set(STEEL).push().translate(0, -0.2, 0).sphere(0.045, 10, 6).pop();
  b.set(STEEL).push().translate(0, -0.26, 0.01).roundBox(0.085, 0.14, 0.09, 0.5).pop();
  // 籠手
  b.set(DARK_STEEL).push().translate(0, -0.34, 0.015).roundBox(0.09, 0.07, 0.1, 0.6).pop();
  return b.toArray();
}

// 剣（握りを原点に +Y 方向へ刃が伸びる）
const BLADE_STYLES = {
  wpn_short_sword: { len: 0.42, width: 0.05, blade: '#dbe4ee', rune: '#7dd3fc' },
  wpn_broadsword: { len: 0.52, width: 0.07, blade: '#e2e8f0', rune: '#a5b4fc' },
  wpn_bastard_sword: { len: 0.6, width: 0.06, blade: '#cbd5e1', rune: '#c4b5fd' },
  wpn_flamberge: { len: 0.62, width: 0.065, blade: '#fca5a5', rune: '#fb923c', wavy: true },
};
export function buildSword(id) {
  const st = BLADE_STYLES[id] || BLADE_STYLES.wpn_short_sword;
  const b = new MeshBuilder();
  // 柄頭・握り・鍔
  b.set(GOLD).push().translate(0, -0.07, 0).sphere(0.022, 10, 6).pop();
  b.set(LEATHER).push().translate(0, -0.06, 0).cylinder(0.016, 0.016, 0.09, 8).pop();
  b.set(GOLD).push().translate(0, 0.035, 0).roundBox(0.17, 0.028, 0.035, 0.5).pop();
  b.set(glow(st.rune, 2)).push().translate(0, 0.035, 0.018).sphere(0.012, 8, 6).pop();
  // 刃（先細りの多角形を押し出し、中央に光る溝）
  const w = st.width / 2;
  const pts = [];
  const segs = st.wavy ? 10 : 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const wave = st.wavy ? Math.sin(t * Math.PI * 4) * 0.012 : 0;
    pts.push([w * (1 - t * 0.25) + wave, 0.05 + t * (st.len - 0.08)]);
  }
  pts.push([0, 0.05 + st.len]);
  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const wave = st.wavy ? Math.sin(t * Math.PI * 4) * 0.012 : 0;
    pts.push([-w * (1 - t * 0.25) + wave, 0.05 + t * (st.len - 0.08)]);
  }
  b.set({ color: hexToRgb(st.blade), rough: 0.12, metal: 1, emissive: 0, material: MAT.METAL });
  // 凸多角形として押し出すため、左右の半分に分けて描く
  const half = Math.floor(pts.length / 2);
  b.extrude(pts.slice(0, half + 1).concat([[0, 0.05]]), 0.014);
  b.extrude(pts.slice(half).concat([[0, 0.05]]), 0.014);
  b.set(glow(st.rune, 1.6)).push().translate(0, 0.05 + st.len * 0.4, 0).box(0.008, st.len * 0.6, 0.018).pop();
  return b.toArray();
}

// 盾（腕に付ける。+Z が表）
const SHIELD_STYLES = {
  shd_buckler: { shape: 'round', r: 0.13, face: '#1e3a8a', rim: GOLD },
  shd_round: { shape: 'round', r: 0.16, face: '#7c2d12', rim: STEEL },
  shd_kite: { shape: 'kite', r: 0.19, face: '#1e40af', rim: GOLD },
  shd_tower: { shape: 'tower', r: 0.22, face: '#374151', rim: GOLD },
};
export function buildShield(id) {
  const st = SHIELD_STYLES[id] || SHIELD_STYLES.shd_buckler;
  const b = new MeshBuilder();
  const face = { color: hexToRgb(st.face), rough: 0.5, metal: 0.3, emissive: 0, material: MAT.PLAIN };
  if (st.shape === 'round') {
    b.set(face).push().rotate('x', Math.PI / 2).cylinder(st.r, st.r, 0.03, 20).pop();
    b.set(st.rim).push().translate(0, 0, 0.015).rotate('x', Math.PI / 2).torus(st.r, 0.014, 24, 6).pop();
    b.set(STEEL).push().translate(0, 0, 0.03).ellipsoid(0.045, 0.045, 0.03, 12, 8).pop();
  } else {
    const r = st.r;
    const pts = st.shape === 'kite'
      ? [[0, -r * 1.3], [r * 0.8, -r * 0.2], [r * 0.85, r * 0.7], [0, r * 0.85], [-r * 0.85, r * 0.7], [-r * 0.8, -r * 0.2]]
      : [[-r * 0.8, -r * 1.1], [r * 0.8, -r * 1.1], [r * 0.85, r * 0.9], [0, r * 1.05], [-r * 0.85, r * 0.9]];
    b.set(st.rim).push().scale(1.1, 1.08, 1).extrude(pts, 0.03).pop();
    b.set(face).push().translate(0, 0, 0.01).extrude(pts, 0.03).pop();
    // 紋章：金の十字
    b.set(GOLD).push().translate(0, 0, 0.03).box(0.03, r * 1.4, 0.01).pop();
    b.set(GOLD).push().translate(0, r * 0.25, 0.03).box(r * 1.1, 0.03, 0.01).pop();
  }
  return b.toArray();
}

// マント（毎フレーム揺らすため、格子の頂点座標を返す関数）
export const CAPE_COLS = 7;
export const CAPE_ROWS = 9;
export function writeCape(b, time, sway, lift) {
  const topW = 0.32, botW = 0.5, len = 0.62;
  const P = [];
  for (let r = 0; r <= CAPE_ROWS; r++) {
    const v = r / CAPE_ROWS;
    const row = [];
    for (let c = 0; c <= CAPE_COLS; c++) {
      const u = c / CAPE_COLS - 0.5;
      const w = topW + (botW - topW) * v;
      const wave = Math.sin(time * 5 + u * 4 + v * 3) * 0.025 * v + Math.sin(time * 9.3 + u * 7) * 0.01 * v;
      const back = -0.13 - v * v * (0.08 + lift) - wave;
      row.push([u * w + Math.sin(time * 3 + v * 2) * sway * v, SHOULDER.y + 0.02 - v * len + v * v * lift * 0.5, back]);
    }
    P.push(row);
  }
  for (let r = 0; r < CAPE_ROWS; r++) {
    for (let c = 0; c < CAPE_COLS; c++) {
      const a = P[r][c], bb = P[r][c + 1], cc = P[r + 1][c + 1], d = P[r + 1][c];
      const e1 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]];
      const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      // 裾に金の縁取り
      b.set(r === CAPE_ROWS - 1 ? { ...CRIMSON, color: hexToRgb('#d4a017'), material: MAT.METAL, metal: 0.8, rough: 0.35 } : CRIMSON);
      b.quad(a, d, cc, bb, [-n[0], -n[1], -n[2]]);
    }
  }
}

export function buildPlayerParts() {
  return {
    body: buildBody(),
    leg: buildLeg(),
    arm: buildArm(),
  };
}

// --- アイテム ---

function buildPotion(hex) {
  const b = new MeshBuilder();
  const liquid = glow(hex, 1.3);
  const glass = { color: [0.75, 0.85, 0.95], rough: 0.05, metal: 0.6, emissive: 0.05, material: MAT.PLAIN };
  b.set(liquid).push().translate(0, 0.11, 0).sphere(0.1, 16, 10).pop();
  b.set(glass).push().translate(0, 0.19, 0).cylinder(0.035, 0.03, 0.09, 12).pop();
  b.set(glass).push().translate(0, 0.28, 0).torus(0.033, 0.01, 12, 5).pop();
  b.set({ ...WOOD, color: hexToRgb('#a0764a') }).push().translate(0, 0.27, 0).cylinder(0.028, 0.032, 0.05, 10).pop();
  // ラベル
  b.set({ color: hexToRgb('#f3e7c4'), rough: 0.8, metal: 0, emissive: 0, material: MAT.PARCHMENT })
    .push().translate(0, 0.11, 0.098).box(0.08, 0.05, 0.006).pop();
  return b;
}

function buildScroll(hex) {
  const b = new MeshBuilder();
  const paper = { color: hexToRgb('#e9d8a6'), rough: 0.85, metal: 0, emissive: 0, material: MAT.PARCHMENT };
  b.set(paper).push().translate(-0.15, 0.08, 0).rotate('z', -Math.PI / 2).cylinder(0.055, 0.055, 0.3, 16).pop();
  b.set(WOOD).push().translate(-0.18, 0.08, 0).rotate('z', -Math.PI / 2).cylinder(0.02, 0.02, 0.36, 8).pop();
  for (const x of [-0.18, 0.18]) b.set(GOLD).push().translate(x, 0.08, 0).sphere(0.028, 8, 6).pop();
  b.set(glow(hex, 0.8)).push().translate(0, 0.08, 0).rotate('z', Math.PI / 2).torus(0.058, 0.012, 16, 5).pop();
  b.set({ color: hexToRgb('#b91c1c'), rough: 0.4, metal: 0, emissive: 0.2, material: MAT.PLAIN })
    .push().translate(0, 0.08, 0.066).rotate('x', Math.PI / 2).cylinder(0.03, 0.03, 0.012, 12).pop();
  return b;
}

function buildStaff(hex) {
  const b = new MeshBuilder();
  b.set(WOOD).push().translate(0, -0.05, 0).cylinder(0.02, 0.026, 0.5, 8).pop();
  b.set(GOLD).push().translate(0, 0.42, 0).torus(0.035, 0.01, 12, 5).pop();
  b.set(GOLD).push().translate(0, 0.15, 0).torus(0.028, 0.008, 12, 5).pop();
  // 先端の結晶（八面体）
  b.set(glow(hex, 2)).push().translate(0, 0.5, 0).scale(0.06, 0.1, 0.06).ellipsoid(1, 1, 1, 4, 2).pop();
  return b;
}

function buildArrows() {
  const b = new MeshBuilder();
  for (let i = -1; i <= 1; i++) {
    b.push().translate(i * 0.04, 0, 0).rotate('z', i * 0.08);
    b.set(WOOD).cylinder(0.01, 0.01, 0.42, 6);
    b.set(STEEL).push().translate(0, 0.42, 0).cylinder(0.025, 0, 0.06, 6).pop();
    b.set({ ...CRIMSON, color: hexToRgb('#e5e7eb') }).push().translate(0, 0.03, 0).box(0.05, 0.08, 0.004).pop();
    b.pop();
  }
  b.set(LEATHER).push().translate(0, 0.2, 0).torus(0.06, 0.012, 12, 5).pop();
  return b;
}

function buildGoldPile() {
  const b = new MeshBuilder();
  const coin = { ...GOLD, color: hexToRgb('#ffc94d') };
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.12 * (1 - i / 20);
    b.set(coin).push().translate(Math.cos(a) * r, 0.01 + i * 0.012, Math.sin(a) * r)
      .rotate('x', (rnd() - 0.5) * 0.8).rotate('z', (rnd() - 0.5) * 0.8)
      .cylinder(0.05, 0.05, 0.012, 14).pop();
  }
  // 宝石を1つ
  b.set(glow('#34d399', 1.5)).push().translate(0.03, 0.2, 0).scale(0.04, 0.05, 0.04).ellipsoid(1, 1, 1, 6, 3).pop();
  return b;
}

function buildFood(id) {
  const b = new MeshBuilder();
  if (id === 'food_feast') {
    b.set({ color: hexToRgb('#8b3a1a'), rough: 0.55, metal: 0, emissive: 0, material: MAT.PLAIN })
      .push().translate(0.04, 0.1, 0).ellipsoid(0.13, 0.1, 0.1, 16, 10).pop();
    b.set({ color: hexToRgb('#efe6d2'), rough: 0.6, metal: 0, emissive: 0, material: MAT.PLAIN });
    b.push().translate(-0.12, 0.1, 0).rotate('z', Math.PI / 2).cylinder(0.02, 0.02, 0.12, 8).pop();
    b.push().translate(-0.2, 0.12, 0.02).sphere(0.03, 8, 6).pop();
    b.push().translate(-0.2, 0.08, -0.02).sphere(0.03, 8, 6).pop();
  } else if (id === 'food_bread') {
    b.set({ color: hexToRgb('#c9832e'), rough: 0.8, metal: 0, emissive: 0, material: MAT.PLAIN })
      .push().translate(0, 0.08, 0).ellipsoid(0.17, 0.08, 0.1, 16, 10).pop();
    for (let i = -1; i <= 1; i++) {
      b.set({ color: hexToRgb('#f1d29a'), rough: 0.9, metal: 0, emissive: 0, material: MAT.PLAIN })
        .push().translate(i * 0.06, 0.155, 0).rotate('y', 0.6).box(0.015, 0.01, 0.12).pop();
    }
  } else {
    // 携帯食：布包みと紐
    b.set({ ...CRIMSON, color: hexToRgb('#a8905f'), material: MAT.FABRIC })
      .push().translate(0, 0.08, 0).roundBox(0.26, 0.14, 0.18, 0.35).pop();
    b.set(LEATHER).push().translate(0, 0.08, 0).box(0.03, 0.15, 0.19).pop();
    b.set(LEATHER).push().translate(0, 0.08, 0).box(0.27, 0.15, 0.03).pop();
  }
  return b;
}

// アイテム種別ごとのモデル（原点は床面の中心）
export function buildItemModel(item) {
  const hex = item.color || '#fbbf24';
  let b;
  switch (item.type) {
    case ITEM_TYPES.WEAPON: {
      b = new MeshBuilder();
      b.data = Array.from(buildSword(item.id));
      return b.toArray();
    }
    case ITEM_TYPES.SHIELD: {
      b = new MeshBuilder();
      b.data = Array.from(buildShield(item.id));
      return b.toArray();
    }
    case ITEM_TYPES.FOOD: b = buildFood(item.id); break;
    case ITEM_TYPES.HERB: b = buildPotion(hex); break;
    case ITEM_TYPES.SCROLL: b = buildScroll(hex); break;
    case ITEM_TYPES.STAFF: b = buildStaff(hex); break;
    case ITEM_TYPES.ARROW: b = buildArrows(); break;
    case ITEM_TYPES.GOLD: b = buildGoldPile(); break;
    default: b = buildPotion(hex);
  }
  return b.toArray();
}

// ミミックが化けている宝箱
export function buildChest() {
  const b = new MeshBuilder();
  b.set(WOOD).push().translate(0, 0.14, 0).box(0.5, 0.28, 0.34).pop();
  b.set(WOOD).push().translate(0.25, 0.28, 0).rotate('z', Math.PI / 2).cylinder(0.17, 0.17, 0.5, 14).pop();
  for (const x of [-0.19, 0.19]) {
    b.set(DARK_STEEL).push().translate(x, 0.14, 0).box(0.04, 0.29, 0.35).pop();
    b.set(DARK_STEEL).push().translate(x + 0.02, 0.28, 0).rotate('z', Math.PI / 2).cylinder(0.175, 0.175, 0.04, 14).pop();
  }
  b.set(GOLD).push().translate(0, 0.27, 0.175).box(0.07, 0.09, 0.02).pop();
  return b.toArray();
}

// --- 扉と地形（NetHack の `+` `{` `_` `#` `|`） ---

const STONE_LIGHT = { color: hexToRgb('#a89f8c'), rough: 0.85, metal: 0, emissive: 0, material: MAT.PLAIN };
const STONE_DARK = { color: hexToRgb('#6f675a'), rough: 0.9, metal: 0, emissive: 0, material: MAT.PLAIN };
const IRON = { color: hexToRgb('#3f444c'), rough: 0.45, metal: 0.9, emissive: 0, material: MAT.METAL };

// 木の扉（蝶番を原点に +X 方向へ 0.86 の幅）
export function buildDoorLeaf(locked = false) {
  const b = new MeshBuilder();
  const w = 0.86, h = 0.9;
  for (let i = 0; i < 5; i++) {
    const pw = w / 5;
    const shade = 0.85 + (i % 2) * 0.12;
    b.set({ ...WOOD, color: hexToRgb('#6b4426').map(c => c * shade) })
      .push().translate(pw * (i + 0.5), h / 2, 0).box(pw - 0.008, h, 0.07).pop();
  }
  for (const y of [0.18, 0.72]) b.set(IRON).push().translate(w / 2, y, 0).box(w, 0.05, 0.085).pop();
  // 取っ手の輪と錠前
  b.set(IRON).push().translate(w - 0.13, 0.47, 0.05).rotate('x', Math.PI / 2).torus(0.045, 0.01, 12, 5).pop();
  b.set(IRON).push().translate(w - 0.13, 0.47, -0.05).rotate('x', Math.PI / 2).torus(0.045, 0.01, 12, 5).pop();
  if (locked) {
    b.set({ ...GOLD, color: hexToRgb('#b08d3c') }).push().translate(w - 0.13, 0.36, 0.05).box(0.07, 0.09, 0.03).pop();
    b.set({ ...GOLD, color: hexToRgb('#b08d3c') }).push().translate(w - 0.13, 0.36, -0.05).box(0.07, 0.09, 0.03).pop();
  }
  return b.toArray();
}

// 蹴破られた扉の残骸（床に散らばる板）
export function buildBrokenDoor() {
  const b = new MeshBuilder();
  const planks = [[-0.25, 0.1, 0.4], [0.05, -0.15, -0.3], [0.25, 0.2, 1.2], [-0.05, 0.3, 2.0]];
  for (const [x, z, r] of planks) {
    b.set(WOOD).push().translate(x, 0.02, z).rotate('y', r).box(0.14, 0.035, 0.55).pop();
  }
  b.set(IRON).push().translate(0.1, 0.03, 0.05).rotate('y', 0.7).box(0.5, 0.02, 0.05).pop();
  return b.toArray();
}

// 噴水 `{`：石の水盤と中央の柱、光る水面
export function buildFountain() {
  const b = new MeshBuilder();
  b.set(STONE_LIGHT).push().cylinder(0.42, 0.44, 0.08, 20).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.08, 0).torus(0.38, 0.05, 24, 8).pop();
  b.set(STONE_DARK).push().translate(0, 0.02, 0).cylinder(0.36, 0.36, 0.1, 20).pop();
  b.set({ color: hexToRgb('#3b82f6'), rough: 0.05, metal: 0.3, emissive: 0.35, material: MAT.GLOW })
    .push().translate(0, 0.1, 0).cylinder(0.35, 0.35, 0.02, 20).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.1, 0).cylinder(0.07, 0.06, 0.38, 12).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.48, 0).cylinder(0.08, 0.16, 0.08, 16).pop();
  b.set({ color: hexToRgb('#60a5fa'), rough: 0.05, metal: 0.3, emissive: 0.6, material: MAT.GLOW })
    .push().translate(0, 0.555, 0).cylinder(0.14, 0.14, 0.01, 16).pop();
  return b.toArray();
}

// 祭壇 `_`：石の台と祭壇布、燭台
export function buildAltar() {
  const b = new MeshBuilder();
  b.set(STONE_DARK).push().translate(0, 0.04, 0).box(0.8, 0.08, 0.55).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.28, 0).box(0.68, 0.42, 0.42).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.51, 0).box(0.76, 0.05, 0.5).pop();
  b.set({ ...CRIMSON, color: hexToRgb('#6d1a36') }).push().translate(0, 0.54, 0).box(0.3, 0.012, 0.52).pop();
  b.set({ ...CRIMSON, color: hexToRgb('#6d1a36') }).push().translate(0, 0.42, 0.255).box(0.3, 0.24, 0.012).pop();
  b.set(GOLD).push().translate(0, 0.43, 0.263).rotate('z', Math.PI / 4).box(0.06, 0.06, 0.006).pop();
  for (const x of [-0.28, 0.28]) {
    b.set(GOLD).push().translate(x, 0.535, 0).cylinder(0.035, 0.02, 0.05, 10).pop();
    b.set({ color: hexToRgb('#f3ead2'), rough: 0.6, metal: 0, emissive: 0.1, material: MAT.PLAIN })
      .push().translate(x, 0.58, 0).cylinder(0.018, 0.018, 0.12, 8).pop();
  }
  return b.toArray();
}

// 流し台 `#`
export function buildSink() {
  const b = new MeshBuilder();
  b.set(STONE_LIGHT).push().cylinder(0.08, 0.1, 0.45, 12).pop();
  b.set({ color: hexToRgb('#d9dee5'), rough: 0.2, metal: 0.4, emissive: 0, material: MAT.PLAIN })
    .push().translate(0, 0.5, 0).ellipsoid(0.26, 0.09, 0.2, 18, 8, 0.5, 1).pop();
  b.set({ color: hexToRgb('#d9dee5'), rough: 0.2, metal: 0.4, emissive: 0, material: MAT.PLAIN })
    .push().translate(0, 0.5, 0).torus(0.23, 0.025, 20, 6).pop();
  b.set(STEEL).push().translate(0, 0.5, -0.17).cylinder(0.018, 0.018, 0.16, 8).pop();
  b.set(STEEL).push().translate(0, 0.66, -0.17).rotate('x', Math.PI / 2).cylinder(0.016, 0.016, 0.12, 8).pop();
  return b.toArray();
}

// 墓 `|`：墓石と盛り土
export function buildGrave() {
  const b = new MeshBuilder();
  b.set({ color: hexToRgb('#4a3a28'), rough: 1, metal: 0, emissive: 0, material: MAT.PLAIN })
    .push().translate(0, 0, 0.08).ellipsoid(0.28, 0.08, 0.38, 14, 8, 0, 0.5).pop();
  b.set(STONE_DARK).push().translate(0, 0.28, -0.3).box(0.34, 0.5, 0.08).pop();
  b.set(STONE_DARK).push().translate(0, 0.53, -0.3).rotate('x', Math.PI / 2).translate(0, -0.04, 0).cylinder(0.17, 0.17, 0.08, 16).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.38, -0.255).box(0.035, 0.22, 0.01).pop();
  b.set(STONE_LIGHT).push().translate(0, 0.43, -0.255).box(0.14, 0.035, 0.01).pop();
  return b.toArray();
}
