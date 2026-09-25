/**
 * 手続き的メッシュ生成（外部モデルファイルを使わずにキャラクター・アイテム・ダンジョンを組み立てる）
 *
 * 頂点フォーマット（14 float = 56 byte）
 *   position.xyz, normal.xyz, color.rgb + roughness, metallic, emissive, material, ao
 */
export const VERTEX_FLOATS = 14;
export const VERTEX_STRIDE = VERTEX_FLOATS * 4;

// シェーダー側の手続きテクスチャの種類
export const MAT = {
  PLAIN: 0,
  FLAGSTONE: 1, // 部屋の敷石
  BRICK: 2,     // 石積みの壁
  COBBLE: 3,    // 通路の荒い石
  WOOD: 4,
  METAL: 5,
  FABRIC: 6,
  GLOW: 7,      // 自発光（炎・魔法・液体）
  WALLTOP: 8,   // 壁の天面
  PARCHMENT: 9,
};

export class MeshBuilder {
  constructor() {
    this.data = [];
    this.stack = [];
    // 現在の変換（3x4 行列：列優先 m[0..11] = 3列 + 平行移動）
    this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    this.mat = { color: [0.8, 0.8, 0.8], rough: 0.7, metal: 0, emissive: 0, material: MAT.PLAIN, ao: 1 };
  }

  get vertexCount() {
    return this.data.length / VERTEX_FLOATS;
  }

  // 材質の設定（指定した項目だけ上書き）
  set(props) {
    this.mat = { ...this.mat, ...props };
    return this;
  }

  push() {
    this.stack.push({ m: this.m.slice(), mat: { ...this.mat } });
    return this;
  }

  pop() {
    const s = this.stack.pop();
    this.m = s.m;
    this.mat = s.mat;
    return this;
  }

  // m = m * T
  translate(x, y, z) {
    const m = this.m;
    m[9] += m[0] * x + m[3] * y + m[6] * z;
    m[10] += m[1] * x + m[4] * y + m[7] * z;
    m[11] += m[2] * x + m[5] * y + m[8] * z;
    return this;
  }

  scale(x, y = x, z = x) {
    const m = this.m;
    for (let i = 0; i < 3; i++) {
      m[i] *= x;
      m[3 + i] *= y;
      m[6 + i] *= z;
    }
    return this;
  }

  rotate(axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    let r;
    if (axis === 'x') r = [1, 0, 0, 0, c, s, 0, -s, c];
    else if (axis === 'y') r = [c, 0, -s, 0, 1, 0, s, 0, c];
    else r = [c, s, 0, -s, c, 0, 0, 0, 1];
    const m = this.m;
    const out = new Array(9);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 3; row++) {
        out[col * 3 + row] = m[row] * r[col * 3] + m[3 + row] * r[col * 3 + 1] + m[6 + row] * r[col * 3 + 2];
      }
    }
    for (let i = 0; i < 9; i++) m[i] = out[i];
    return this;
  }

  // 1頂点を追加（ローカル座標 → 現在の変換で変換）
  vertex(px, py, pz, nx, ny, nz, ao = 1) {
    const m = this.m;
    const x = m[0] * px + m[3] * py + m[6] * pz + m[9];
    const y = m[1] * px + m[4] * py + m[7] * pz + m[10];
    const z = m[2] * px + m[5] * py + m[8] * pz + m[11];
    // 法線は拡縮の逆数を近似的に考慮してから正規化
    let tx = m[0] * nx + m[3] * ny + m[6] * nz;
    let ty = m[1] * nx + m[4] * ny + m[7] * nz;
    let tz = m[2] * nx + m[5] * ny + m[8] * nz;
    const sx = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
    const sy = m[3] * m[3] + m[4] * m[4] + m[5] * m[5];
    const sz = m[6] * m[6] + m[7] * m[7] + m[8] * m[8];
    tx = (m[0] * nx / sx + m[3] * ny / sy + m[6] * nz / sz);
    ty = (m[1] * nx / sx + m[4] * ny / sy + m[7] * nz / sz);
    tz = (m[2] * nx / sx + m[5] * ny / sy + m[8] * nz / sz);
    const len = Math.hypot(tx, ty, tz) || 1;
    const mt = this.mat;
    this.data.push(
      x, y, z, tx / len, ty / len, tz / len,
      mt.color[0], mt.color[1], mt.color[2], mt.rough,
      mt.metal, mt.emissive, mt.material, mt.ao * ao,
    );
    return this;
  }

  // 四角形（p0→p1→p2→p3 反時計回りが表）
  quad(p0, p1, p2, p3, n, ao = [1, 1, 1, 1]) {
    this.vertex(...p0, ...n, ao[0]); this.vertex(...p1, ...n, ao[1]); this.vertex(...p2, ...n, ao[2]);
    this.vertex(...p0, ...n, ao[0]); this.vertex(...p2, ...n, ao[2]); this.vertex(...p3, ...n, ao[3]);
    return this;
  }

  // 中心原点・各辺の長さ w,h,d の直方体。faces で面を選べる（+x,-x,+y,-y,+z,-z）
  box(w, h, d, faces = null) {
    const x = w / 2, y = h / 2, z = d / 2;
    const f = faces || { px: 1, nx: 1, py: 1, ny: 1, pz: 1, nz: 1 };
    if (f.pz) this.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]);
    if (f.nz) this.quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
    if (f.px) this.quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]);
    if (f.nx) this.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]);
    if (f.py) this.quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]);
    if (f.ny) this.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]);
    return this;
  }

  // 角を丸めた直方体（球を引き伸ばした形。鎧・ブーツなど有機的な部品用）
  roundBox(w, h, d, r = 0.3, seg = 10) {
    const hx = w / 2 - r * w / 2, hy = h / 2 - r * h / 2, hz = d / 2 - r * d / 2;
    const rx = r * w / 2, ry = r * h / 2, rz = r * d / 2;
    const pt = (u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      const px = nx * rx + Math.sign(nx) * hx, py = ny * ry + Math.sign(ny) * hy, pz = nz * rz + Math.sign(nz) * hz;
      return { p: [px, py, pz], n: [nx / rx, ny / ry, nz / rz] };
    };
    this.gridSurface(pt, seg * 2, seg);
    return this;
  }

  // パラメトリック面 fn(u,v) → {p, n} を格子状に三角形化
  gridSurface(fn, su, sv, flip = false) {
    for (let i = 0; i < su; i++) {
      for (let j = 0; j < sv; j++) {
        const a = fn(i / su, j / sv), b = fn((i + 1) / su, j / sv);
        const c = fn((i + 1) / su, (j + 1) / sv), d = fn(i / su, (j + 1) / sv);
        const tri = (p, q, r) => {
          for (const v of (flip ? [p, r, q] : [p, q, r])) this.vertex(...v.p, ...v.n);
        };
        tri(a, b, c);
        tri(a, c, d);
      }
    }
    return this;
  }

  sphere(r, su = 16, sv = 10, rx = r, ry = r, rz = r) {
    return this.ellipsoid(rx, ry, rz, su, sv);
  }

  ellipsoid(rx, ry, rz, su = 16, sv = 10, vFrom = 0, vTo = 1) {
    this.gridSurface((u, v) => {
      const th = u * Math.PI * 2, ph = (vFrom + (vTo - vFrom) * v) * Math.PI;
      const nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th);
      return { p: [nx * rx, ny * ry, nz * rz], n: [nx / rx, ny / ry, nz / rz] };
    }, su, sv);
    return this;
  }

  // Y軸方向の円柱（下端 r0・上端 r1 の円錐台）。中心は底面
  cylinder(r0, r1, h, seg = 16, caps = true) {
    const slope = (r0 - r1) / h;
    this.gridSurface((u, v) => {
      const th = u * Math.PI * 2;
      const r = r0 + (r1 - r0) * v;
      const c = Math.cos(th), s = Math.sin(th);
      return { p: [c * r, v * h, s * r], n: [c, slope, s] };
    }, seg, 1, true);
    if (caps) {
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        if (r1 > 0) {
          this.vertex(0, h, 0, 0, 1, 0);
          this.vertex(Math.cos(a1) * r1, h, Math.sin(a1) * r1, 0, 1, 0);
          this.vertex(Math.cos(a0) * r1, h, Math.sin(a0) * r1, 0, 1, 0);
        }
        if (r0 > 0) {
          this.vertex(0, 0, 0, 0, -1, 0);
          this.vertex(Math.cos(a0) * r0, 0, Math.sin(a0) * r0, 0, -1, 0);
          this.vertex(Math.cos(a1) * r0, 0, Math.sin(a1) * r0, 0, -1, 0);
        }
      }
    }
    return this;
  }

  // XZ 平面に寝たドーナツ（R: 中心半径, r: 管の半径）
  torus(R, r, su = 20, sv = 8) {
    this.gridSurface((u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const nx = Math.cos(ph) * c, ny = Math.sin(ph), nz = Math.cos(ph) * s;
      return { p: [c * R + nx * r, ny * r, s * R + nz * r], n: [nx, ny, nz] };
    }, su, sv, true);
    return this;
  }

  // XY 平面の多角形を厚み depth で押し出す（凸多角形・反時計回り）。盾・剣身など
  extrude(points, depth) {
    const z = depth / 2;
    const n = points.length;
    // 表裏
    for (let i = 1; i < n - 1; i++) {
      this.vertex(points[0][0], points[0][1], z, 0, 0, 1);
      this.vertex(points[i][0], points[i][1], z, 0, 0, 1);
      this.vertex(points[i + 1][0], points[i + 1][1], z, 0, 0, 1);
      this.vertex(points[0][0], points[0][1], -z, 0, 0, -1);
      this.vertex(points[i + 1][0], points[i + 1][1], -z, 0, 0, -1);
      this.vertex(points[i][0], points[i][1], -z, 0, 0, -1);
    }
    // 側面
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      let nx = b[1] - a[1], ny = -(b[0] - a[0]);
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      this.quad([a[0], a[1], -z], [b[0], b[1], -z], [b[0], b[1], z], [a[0], a[1], z], [nx, ny, 0]);
    }
    return this;
  }

  toArray() {
    return new Float32Array(this.data);
  }
}
