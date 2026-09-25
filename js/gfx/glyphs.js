/**
 * 敵の見た目：NetHack の記号（モンスタークラス文字）を立体化する
 *
 * 各文字を 2D の符号付き距離場（SDF）としてアトラスに焼き、シェーダーで厚みを付けて
 * レイマーチングすることで、角の丸い立体文字として描く。
 */

// モンスター ID → NetHack のクラス文字
export const MONSTER_GLYPHS = {
  slime: 'P',          // プディング類（グリーンスライム）
  horned_rabbit: 'r',  // 齧歯類・小動物
  cave_bat: 'B',       // 蝙蝠・鳥
  giant_ant: 'a',      // 蟻・昆虫
  kobold: 'k',         // コボルド
  skeleton_archer: 'Z', // ゾンビ・スケルトン
  phantom: 'X',        // 壁をすり抜けるゾーン（xorn）
  rust_monster: 'R',   // 錆の怪物
  orc: 'o',            // オーク
  leprechaun: 'l',     // レプラコーン
  nymph: 'n',          // ニンフ
  wraith: 'W',         // レイス
  mimic: 'm',          // ミミック
  shadow_stalker: 'E', // ストーカー（元素霊）
  gargoyle: 'g',       // ガーゴイル
  troll: 'T',          // トロール
  vampire: 'V',        // ヴァンパイア
  hydra: 'N',          // ナーガ・大蛇
  medusa: '@',         // メドゥーサは人型の '@'
  dragon: 'D',         // ドラゴン
  ice_monster: '\'',   // ゴーレム
  beholder: 'e',       // 浮遊する眼
  lich: 'L',           // リッチ
  arch_demon: '&',     // 大悪魔
  minotaur: 'H',       // 巨人類（迷路のミノタウロス）
};

// 罠（NetHack では '^'）
export const TRAP_GLYPH = '^';

const CELL = 128;        // 1文字あたりのピクセル数
const SPREAD = 14;       // 距離場の広がり（ピクセル）
const FONT = `700 ${Math.round(CELL * 0.8)}px "DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace`;

// 1次元の距離変換（Felzenszwalb & Huttenlocher）
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// 2次元の二乗距離変換（grid: 0 = 対象, INF = それ以外）
function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}

// float32 → float16 のビット列（距離場を 16bit 浮動小数で持ち、側面の縞を防ぐ）
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >> 16) & 0x8000;
  const exp = ((x >> 23) & 0xff) - 127 + 15;
  const mant = x & 0x7fffff;
  if (exp <= 0) return sign;
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | (mant >> 13);
}

/**
 * 文字ごとの SDF をアトラスに焼く
 * 戻り値: { width, height, data(Uint16Array: r16float), rects: { char: [u0, v0, u1, v1] } }
 * 値の意味: 0.5 が輪郭、1 に近いほど内側、0 に近いほど外側（±SPREAD px）
 */
export function buildGlyphAtlas(chars) {
  const cols = 8;
  const rows = Math.ceil(chars.length / cols);
  const width = cols * CELL, height = rows * CELL;
  const data = new Uint16Array(width * height);
  const rects = {};

  const canvas = document.createElement('canvas');
  canvas.width = CELL;
  canvas.height = CELL;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const INF = 1e20;

  chars.forEach((ch, i) => {
    g.clearRect(0, 0, CELL, CELL);
    g.fillStyle = '#fff';
    g.font = FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 小文字は大文字と同じくらいの存在感になるよう少し持ち上げる
    g.fillText(ch, CELL / 2, CELL * 0.5);
    const img = g.getImageData(0, 0, CELL, CELL).data;

    const inside = new Float64Array(CELL * CELL);
    const outside = new Float64Array(CELL * CELL);
    for (let p = 0; p < CELL * CELL; p++) {
      const a = img[p * 4 + 3] / 255;
      inside[p] = a > 0.5 ? INF : 0;   // 内側の点から輪郭（外側）までの距離
      outside[p] = a > 0.5 ? 0 : INF;  // 外側の点から文字までの距離
    }
    edt2d(inside, CELL, CELL);
    edt2d(outside, CELL, CELL);

    const ox = (i % cols) * CELL, oy = Math.floor(i / cols) * CELL;
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const p = y * CELL + x;
        const dist = Math.sqrt(outside[p]) - Math.sqrt(inside[p]); // 外側が正
        const val = Math.max(0, Math.min(1, 0.5 - dist / (2 * SPREAD)));
        data[(oy + y) * width + ox + x] = toHalf(val);
      }
    }
    rects[ch] = [ox / width, oy / height, (ox + CELL) / width, (oy + CELL) / height];
  });

  return { width, height, data, rects, spreadUv: SPREAD / CELL };
}
