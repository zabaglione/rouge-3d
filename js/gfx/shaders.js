/**
 * WGSL シェーダー群
 */
export const MAX_LIGHTS = 24;

// 全シェーダー共通：フレーム定数・ノイズ・ライティング
const COMMON = /* wgsl */`
struct Light { pos: vec4f, color: vec4f };   // pos.w = 半径, color.w = 強さ
struct Frame {
  viewProj: mat4x4f,
  camPos: vec4f,        // w = 経過時間(秒)
  camRight: vec4f,
  camUp: vec4f,
  player: vec4f,        // xyz = プレイヤー位置, w = 手前の壁を透かす半径
  mapSize: vec4f,       // 幅, 高さ, 1/幅, 1/高さ
  ambient: vec4f,       // rgb = 環境光, w = 光源数
  fogColor: vec4f,
  lights: array<Light, ${MAX_LIGHTS}>,
};
struct Draw {
  model: mat4x4f,
  invModel: mat4x4f,
  tint: vec4f,          // rgb = 乗算色, a = 未使用
  params: vec4f,        // x = 白フラッシュ, y = 発光の上乗せ, z = 不透明度(ディザ), w = 未使用
  glyph: vec4f,         // 立体文字の UV 範囲
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var fogTex: texture_2d<f32>;
@group(0) @binding(2) var linearSamp: sampler;
@group(0) @binding(3) var glyphTex: texture_2d<f32>;
@group(1) @binding(0) var<uniform> draw: Draw;

const PI = 3.14159265;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn hash22(p: vec2f) -> vec2f {
  let n = hash21(p);
  return vec2f(n, hash21(p + vec2f(n * 17.13, 31.7)));
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i++) {
    v += a * vnoise(q);
    q = q * 2.03 + vec2f(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}
// x: 最近点までの距離, y: 境界までの距離(2番目との差), z: セルID
fn voronoi(p: vec2f) -> vec3f {
  let n = floor(p);
  let f = fract(p);
  var d1 = 8.0;
  var d2 = 8.0;
  var id = 0.0;
  var mr = vec2f(0.0);
  var mg = vec2f(0.0);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let o = hash22(n + g) * 0.8 + 0.1;
      let r = g + o - f;
      let d = dot(r, r);
      if (d < d1) { d1 = d; mr = r; mg = g; id = hash21(n + g + 3.1); }
    }
  }
  // 境界までの正確な距離
  var md = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = mg + vec2f(f32(i), f32(j));
      let o = hash22(n + g) * 0.8 + 0.1;
      let r = g + o - f;
      if (dot(mr - r, mr - r) > 0.00001) {
        md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
      }
    }
  }
  return vec3f(sqrt(d1), md, id);
}

// 視界：r = いま見えている, g = 探索済み（タイル単位の小さなテクスチャを滑らかに補間）
fn fogAt(xz: vec2f) -> vec2f {
  let uv = xz * frame.mapSize.zw;
  return textureSampleLevel(fogTex, linearSamp, uv, 0.0).rg;
}

// 点光源の PBR 風ライティング（GGX 鏡面反射）
fn lighting(P: vec3f, N: vec3f, V: vec3f, albedo: vec3f, rough: f32, metal: f32) -> vec3f {
  var diff = vec3f(0.0);
  var spec = vec3f(0.0);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let a = max(rough * rough, 0.02);
  let a2 = a * a;
  let count = u32(frame.ambient.w);
  for (var i = 0u; i < count; i++) {
    let lt = frame.lights[i];
    let L = lt.pos.xyz - P;
    let d = length(L);
    let r = lt.pos.w;
    if (d >= r) { continue; }
    let l = L / max(d, 0.0001);
    let win = clamp(1.0 - pow(d / r, 4.0), 0.0, 1.0);
    let falloff = win * win / (d * d * 0.6 + 0.35);
    let ndl = max(dot(N, l), 0.0);
    // 半ランバートで陰影を柔らかく
    let wrap = max((dot(N, l) + 0.25) / 1.25, 0.0);
    let h = normalize(l + V);
    let ndh = max(dot(N, h), 0.0);
    let dd = ndh * ndh * (a2 - 1.0) + 1.0;
    let D = a2 / (PI * dd * dd);
    let F = f0 + (1.0 - f0) * pow(1.0 - max(dot(h, V), 0.0), 5.0);
    let radiance = lt.color.rgb * lt.color.w * falloff;
    diff += radiance * wrap;
    spec += radiance * ndl * D * F * 0.25;
  }
  // 半球環境光（上からの光を少し強く）
  let hemi = mix(frame.ambient.rgb * 0.45, frame.ambient.rgb, N.y * 0.5 + 0.5);
  let envSpec = f0 * frame.ambient.rgb * (1.5 - rough);
  return (diff + hemi) * albedo * (1.0 - metal) + spec + envSpec * metal * 2.0;
}
`;

// 手続きテクスチャ付きの材質（ダンジョン・キャラクター共通）
const MATERIALS = /* wgsl */`
struct Surf { albedo: vec3f, rough: f32, metal: f32, emissive: f32, height: f32, ao: f32 };

fn surface(mat: i32, P: vec3f, N: vec3f, base: vec3f, rough: f32, metal: f32, emis: f32) -> Surf {
  var s = Surf(base, rough, metal, emis, 0.0, 1.0);
  if (mat == 1) {
    // 敷石：不揃いな石板と目地、苔、ひび
    let v = voronoi(P.xz * 2.3);
    let edge = smoothstep(0.012, 0.045, v.y);
    let n = fbm(P.xz * 5.0);
    var col = base * (0.72 + 0.55 * v.z) * (0.8 + 0.4 * n);
    col = mix(col, col * vec3f(1.08, 0.98, 0.86), hash21(vec2f(v.z, 2.0)));
    let moss = smoothstep(0.58, 0.78, fbm(P.xz * 1.3 + vec2f(3.0, 7.0))) * (0.4 + 0.6 * (1.0 - edge));
    col = mix(col, vec3f(0.16, 0.24, 0.1), moss * 0.75);
    let crack = smoothstep(0.02, 0.0, abs(vnoise(P.xz * 7.0 + v.z * 10.0) - 0.5)) * step(0.85, v.z);
    col = mix(base * 0.22, col, edge);
    col *= 1.0 - crack * 0.6;
    s.albedo = col;
    s.height = edge * (0.7 + 0.3 * n) - crack * 0.3 + (1.0 - v.x) * 0.15;
    s.rough = mix(0.97, 0.6, edge * (1.0 - moss));
    s.ao = mix(0.45, 1.0, edge);
  } else if (mat == 2) {
    // 石積みの壁：段ごとに半分ずらした切石と目地、足元の湿り・苔
    var u = P.x;
    if (abs(N.x) > abs(N.z)) { u = P.z; }
    let rowH = 0.21;
    let row = floor(P.y / rowH);
    let uu = u / 0.42 + row * 0.5 + (vnoise(vec2f(P.y * 9.0, u * 3.0)) - 0.5) * 0.06;
    let bid = vec2f(floor(uu), row);
    let fu = fract(uu);
    let fv = fract(P.y / rowH);
    let e = min(min(fu, 1.0 - fu) * 0.42 / rowH, min(fv, 1.0 - fv));
    let edge = smoothstep(0.03, 0.13, e + (vnoise(vec2f(u, P.y) * 25.0) - 0.5) * 0.05);
    let rnd = hash21(bid);
    let n = fbm(vec2f(u, P.y) * 6.0 + rnd * 10.0);
    var col = base * (0.62 + 0.6 * rnd) * (0.75 + 0.5 * n);
    let damp = smoothstep(0.55, 0.0, P.y);
    col = mix(col, col * 0.5, damp * 0.6);
    let moss = smoothstep(0.55, 0.8, fbm(vec2f(u * 1.5, P.y * 2.0) + vec2f(5.0))) * (0.3 + damp);
    col = mix(col, vec3f(0.12, 0.2, 0.08), clamp(moss, 0.0, 1.0) * 0.7);
    col = mix(vec3f(0.05, 0.045, 0.04), col, edge);
    s.albedo = col;
    s.height = edge * (0.8 + 0.2 * n);
    s.rough = mix(0.95, mix(0.8, 0.45, damp), edge);
    s.ao = mix(0.5, 1.0, edge) * mix(0.55, 1.0, smoothstep(0.0, 0.5, P.y));
  } else if (mat == 3) {
    // 通路：小さな玉石と土
    let v = voronoi(P.xz * 3.4);
    let edge = smoothstep(0.02, 0.12, v.y);
    let n = fbm(P.xz * 7.0);
    var col = base * (0.7 + 0.5 * v.z) * (0.75 + 0.45 * n);
    col = mix(vec3f(0.09, 0.07, 0.05) * (0.7 + n * 0.6), col, edge);
    s.albedo = col;
    s.height = edge * (1.0 - v.x * 0.6);
    s.rough = mix(1.0, 0.7, edge);
    s.ao = mix(0.55, 1.0, edge);
  } else if (mat == 8) {
    // 壁の天面：暗い粗石
    let n = fbm(P.xz * 4.0);
    s.albedo = base * (0.6 + 0.6 * n);
    s.height = n;
    s.rough = 0.95;
  } else if (mat == 4) {
    // 木：木目
    let g = sin((P.x + P.z) * 40.0 + fbm(P.xy * 6.0) * 6.0) * 0.5 + 0.5;
    s.albedo = base * (0.7 + 0.35 * g);
    s.rough = 0.7;
  } else if (mat == 5) {
    // 金属：細かな擦り傷
    let sc = vnoise(vec2f(P.x * 80.0 + P.y * 20.0, P.z * 80.0));
    s.rough = clamp(rough + (sc - 0.5) * 0.15, 0.08, 1.0);
  } else if (mat == 6) {
    // 布：織り目
    let w = sin(P.x * 220.0) * sin(P.y * 220.0 + P.z * 220.0);
    s.albedo = base * (0.9 + 0.1 * w);
    s.rough = 0.9;
  } else if (mat == 9) {
    // 羊皮紙
    s.albedo = base * (0.8 + 0.3 * fbm(P.xy * 18.0 + P.zz * 7.0));
    s.rough = 0.85;
  }
  return s;
}

// 高さの画面上の微分から法線を傾ける（凹凸の表現）
fn bumpNormal(N: vec3f, dpx: vec3f, dpy: vec3f, dhx: f32, dhy: f32, strength: f32) -> vec3f {
  let r1 = cross(dpy, N);
  let r2 = cross(N, dpx);
  let det = dot(dpx, r1);
  let grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - grad * strength);
}

// 画面上のディザパターン（半透明の代わりに間引いて描く）
fn bayer(p: vec2f) -> f32 {
  let x = u32(p.x) % 4u;
  let y = u32(p.y) % 4u;
  var m = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[y * 4u + x] + 0.5) / 16.0;
}
`;

export const MESH_SHADER = COMMON + MATERIALS + /* wgsl */`
struct VIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec4f,
  @location(3) extra: vec4f,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec4f,
  @location(3) extra: vec4f,
};

@vertex
fn vs(v: VIn) -> VOut {
  var o: VOut;
  let w = draw.model * vec4f(v.pos, 1.0);
  o.world = w.xyz;
  o.clip = frame.viewProj * w;
  o.normal = (draw.model * vec4f(v.normal, 0.0)).xyz;
  o.color = v.color;
  o.extra = v.extra;
  return o;
}

@fragment
fn fs(i: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var N = normalize(i.normal);
  if (!front) { N = -N; }
  let mat = i32(i.extra.z + 0.5);
  let base = i.color.rgb * draw.tint.rgb;
  let s = surface(mat, i.world, N, base, i.color.a, i.extra.x, i.extra.y);

  // 凹凸（微分は一様な制御フローで計算する）
  let dpx = dpdx(i.world);
  let dpy = dpdy(i.world);
  let dhx = dpdx(s.height);
  let dhy = dpdy(s.height);
  let Nb = bumpNormal(N, dpx, dpy, dhx, dhy, 0.035);

  // プレイヤーと手前の壁が重なる部分は透かす
  if ((mat == 2 || mat == 8) && frame.player.w > 0.0) {
    let toCam = normalize(frame.camPos.xyz - frame.player.xyz);
    let rel = i.world - frame.player.xyz;
    let t = dot(rel, toCam);
    let perp = length(rel - toCam * t);
    if (t > 0.55) {
      let k = smoothstep(frame.player.w, frame.player.w * 0.45, perp);
      if (k > bayer(i.clip.xy) * 0.999) { discard; }
    }
  }
  if (draw.params.z < 0.999 && draw.params.z < bayer(i.clip.xy)) { discard; }

  let V = normalize(frame.camPos.xyz - i.world);
  var col = lighting(i.world, Nb, V, s.albedo, s.rough, s.metal) * s.ao * i.extra.w;
  col += s.albedo * (s.emissive + draw.params.y) * 3.0;
  if (draw.params.w > 0.5) {
    // キャラクター・アイテム：輪郭の光と、金属に映り込む暖かい環境
    let rim = pow(1.0 - max(dot(Nb, V), 0.0), 3.0);
    col += vec3f(0.55, 0.62, 0.8) * rim * 0.35;
    let R = reflect(-V, Nb);
    let env = mix(vec3f(0.05, 0.05, 0.07), vec3f(0.9, 0.7, 0.45), smoothstep(-0.2, 0.8, R.y));
    col += env * mix(vec3f(0.04), s.albedo, s.metal) * s.metal * (1.0 - s.rough) * 1.2;
  }

  // 視界：見えていない場所は暗く青い「記憶」、未探索は闇
  let fogXZ = i.world.xz + N.xz * 0.35;
  let f = fogAt(fogXZ);
  let lum = dot(s.albedo, vec3f(0.3, 0.59, 0.11));
  let memory = vec3f(0.035, 0.05, 0.085) * (0.5 + lum * 2.0) * s.ao;
  col = mix(memory * f.g, col, f.r);

  // 白フラッシュ（被弾・撃破）
  col = mix(col, vec3f(2.0, 1.9, 1.9), draw.params.x);

  // 奥行きの霧
  let dist = length(frame.camPos.xyz - i.world);
  col = mix(col, frame.fogColor.rgb, clamp((dist - 9.0) * frame.fogColor.w, 0.0, 0.85));
  return vec4f(col, 1.0);
}
`;

// NetHack の記号を立体化した敵（2D距離場を押し出してレイマーチング）
export const GLYPH_SHADER = COMMON + /* wgsl */`
const GLYPH_DEPTH = 0.13;
const BEVEL = 0.035;

struct VIn {
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec4f,
  @location(3) extra: vec4f,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
};

@vertex
fn vs(v: VIn) -> VOut {
  var o: VOut;
  let w = draw.model * vec4f(v.pos, 1.0);
  o.world = w.xyz;
  o.clip = frame.viewProj * w;
  return o;
}

fn glyph2d(p: vec2f) -> f32 {
  let r = draw.glyph;
  let q = clamp(p, vec2f(-0.5), vec2f(0.5));
  let uv = vec2f(mix(r.x, r.z, q.x + 0.5), mix(r.y, r.w, 0.5 - q.y));
  let v = textureSampleLevel(glyphTex, linearSamp, uv, 0.0).r;
  let spread = 14.0 / 128.0;
  return (0.5 - v) * 2.0 * spread + length(p - q);
}

// 角を丸めて押し出した文字の距離
fn sdf(p: vec3f) -> f32 {
  let d2 = glyph2d(p.xy);
  let w = vec2f(d2 + BEVEL, abs(p.z) - GLYPH_DEPTH + BEVEL);
  return min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0))) - BEVEL;
}

struct FOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs(i: VOut) -> FOut {
  let ro = (draw.invModel * vec4f(frame.camPos.xyz, 1.0)).xyz;
  let pe = (draw.invModel * vec4f(i.world, 1.0)).xyz;
  let rd = normalize(pe - ro);

  // 箱との交差区間
  let bmin = vec3f(-0.55, -0.55, -GLYPH_DEPTH - 0.02);
  let bmax = vec3f(0.55, 0.55, GLYPH_DEPTH + 0.02);
  let inv = 1.0 / rd;
  let t0 = (bmin - ro) * inv;
  let t1 = (bmax - ro) * inv;
  let tmin = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));

  var t = max(tmin, 0.0);
  var hit = false;
  for (var k = 0; k < 72; k++) {
    let d = sdf(ro + rd * t);
    if (d < 0.0015) { hit = true; break; }
    t += max(d * 0.9, 0.002);
    if (t > tmax) { break; }
  }
  if (!hit) { discard; }

  let p = ro + rd * t;
  let e = 0.004;
  let nl = normalize(vec3f(
    sdf(p + vec3f(e, 0.0, 0.0)) - sdf(p - vec3f(e, 0.0, 0.0)),
    sdf(p + vec3f(0.0, e, 0.0)) - sdf(p - vec3f(0.0, e, 0.0)),
    sdf(p + vec3f(0.0, 0.0, e)) - sdf(p - vec3f(0.0, 0.0, e))));
  // 法線をワールド空間へ（逆行列の転置）
  let N = normalize((transpose(draw.invModel) * vec4f(nl, 0.0)).xyz);
  let W = (draw.model * vec4f(p, 1.0)).xyz;
  let V = normalize(frame.camPos.xyz - W);

  let base = draw.tint.rgb;
  // 表面はつややかなエナメル、側面は少し暗い
  let side = 1.0 - abs(nl.z);
  let albedo = base * mix(1.0, 0.55, side);
  var col = lighting(W, N, V, albedo, 0.3, 0.1) * 1.6;
  // 正面から見える文字の面をはっきりさせる（キーライト）
  col += albedo * max(dot(N, normalize(vec3f(0.3, 0.8, 0.6))), 0.0) * 0.35;
  // 内側から光る芯と縁の輝き
  let rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += base * (0.12 + draw.params.y * 0.8) + base * rim * 0.9;
  col = mix(col, vec3f(2.2, 2.2, 2.4), draw.params.x);

  var o: FOut;
  o.color = vec4f(col, 1.0);
  let clip = frame.viewProj * vec4f(W, 1.0);
  o.depth = clip.z / clip.w;
  return o;
}
`;

// パーティクル・光の輪・剣閃・ビームなど（加算合成のビルボード）
export const FX_SHADER = COMMON + /* wgsl */`
struct IIn {
  @location(0) posSize: vec4f,
  @location(1) color: vec4f,
  @location(2) dirType: vec4f,
  @location(3) params: vec4f,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) @interpolate(flat) kind: i32,
  @location(3) params: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, inst: IIn) -> VOut {
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
                                vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi];
  let kind = i32(inst.dirType.w + 0.5);
  let size = inst.posSize.w;
  var P = inst.posSize.xyz;
  let dir = inst.dirType.xyz;
  let right = frame.camRight.xyz;
  let up = frame.camUp.xyz;

  if (kind == 1 || kind == 4) {
    // 方向に伸びる光の筋・ビーム（始点から dir の先まで）
    let len = length(dir);
    let ax = dir / max(len, 0.0001);
    let view = normalize(frame.camPos.xyz - P);
    var side = cross(ax, view);
    side = side / max(length(side), 0.0001);
    P = P + ax * (c.x * 0.5 + 0.5) * len + side * c.y * size;
  } else if (kind == 2 || kind == 3) {
    // 床に平らな輪・剣閃（params.x 回転）
    let a = inst.params.x;
    let ca = cos(a);
    let sa = sin(a);
    let lx = vec3f(ca, 0.0, sa);
    let lz = vec3f(-sa, 0.0, ca);
    P = P + (lx * c.x + lz * c.y) * size;
  } else if (kind == 10) {
    // 縦に伸びる光の柱
    P = P + right * c.x * size + vec3f(0.0, 1.0, 0.0) * (c.y * 0.5 + 0.5) * inst.params.y;
  } else {
    // 通常のビルボード（params.x で画面内回転）
    let a = inst.params.x;
    let ca = cos(a);
    let sa = sin(a);
    let r = vec2f(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    P = P + (right * r.x + up * r.y) * size;
  }
  var o: VOut;
  o.clip = frame.viewProj * vec4f(P, 1.0);
  o.uv = c;
  o.color = inst.color;
  o.kind = kind;
  o.params = inst.params;
  return o;
}

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let uv = i.uv;
  let r = length(uv);
  var a = 0.0;
  var col = i.color.rgb;
  let t = frame.camPos.w;
  switch i.kind {
    case 0: { a = pow(max(1.0 - r, 0.0), 2.2); }                                    // 光の粒
    case 1: { a = (1.0 - abs(uv.y)) * smoothstep(-1.0, -0.2, uv.x) * pow(1.0 - (uv.x * 0.5 + 0.5), 0.6); }
    case 2: {                                                                      // 床の輪
      let th = i.params.y;
      a = smoothstep(th, 0.0, abs(r - (1.0 - th))) * step(r, 1.0);
    }
    case 3: {                                                                      // 剣閃（三日月）
      let ang = atan2(uv.y, uv.x);
      let sweep = i.params.z;
      let head = mix(-1.3, 1.3, sweep);
      let along = clamp((head - ang) / 1.4, 0.0, 1.0);
      let inArc = step(-1.35, ang) * step(ang, head);
      let band = smoothstep(0.62, 0.8, r) * smoothstep(1.0, 0.9, r);
      a = band * inArc * pow(1.0 - along, 1.5);
      col = mix(col, vec3f(6.0), smoothstep(0.85, 0.95, r) * (1.0 - along));
    }
    case 4: {                                                                      // ビーム
      let core = pow(max(1.0 - abs(uv.y), 0.0), 6.0);
      let glow = pow(max(1.0 - abs(uv.y), 0.0), 1.5);
      let wave = 0.75 + 0.25 * sin(uv.x * 30.0 - t * 40.0);
      a = glow * wave * 0.8 + core;
      col = mix(col, vec3f(8.0), core);
    }
    case 5: {                                                                      // 十字のきらめき
      let s = max(pow(max(1.0 - abs(uv.x), 0.0), 1.0) * pow(max(1.0 - abs(uv.y) * 8.0, 0.0), 2.0),
                  pow(max(1.0 - abs(uv.y), 0.0), 1.0) * pow(max(1.0 - abs(uv.x) * 8.0, 0.0), 2.0));
      a = s + pow(max(1.0 - r, 0.0), 6.0);
    }
    case 6: {                                                                      // 砕けた破片（四角）
      let m = max(abs(uv.x), abs(uv.y));
      a = step(m, 0.8) + smoothstep(1.0, 0.8, m) * 0.5;
    }
    case 7: {                                                                      // 炎
      let n = vnoise(vec2f(uv.x * 3.0, uv.y * 2.0 - t * 6.0 + i.params.w * 10.0));
      let shape = smoothstep(1.0, 0.1, length(vec2f(uv.x * (1.3 + uv.y * 0.6), uv.y * 0.8 + 0.2)) + n * 0.45);
      a = shape;
      col = mix(col, vec3f(6.0, 4.5, 2.0), smoothstep(0.5, 1.0, shape));
    }
    case 8: {                                                                      // 衝撃波（球殻）
      a = smoothstep(0.25, 0.0, abs(r - 0.85)) * step(r, 1.0);
    }
    case 9: { a = pow(max(1.0 - r, 0.0), 1.3) * 0.5; }                              // 土ぼこり
    case 10: {                                                                     // 光の柱
      a = pow(max(1.0 - abs(uv.x), 0.0), 2.0) * smoothstep(1.0, 0.3, uv.y);
    }
    default: { a = 1.0 - r; }
  }
  a = clamp(a, 0.0, 4.0) * i.color.a;
  return vec4f(col * a, a);
}
`;

// フルスクリーン三角形
const FULLSCREEN = /* wgsl */`
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[vi], 0.0, 1.0);
  o.uv = vec2f(p[vi].x * 0.5 + 0.5, 0.5 - p[vi].y * 0.5);
  return o;
}
`;

// ブルーム：縮小（13タップ）。最初の段だけ明るい部分を抽出する
export const BLOOM_DOWN_SHADER = FULLSCREEN + /* wgsl */`
struct P { texel: vec4f };   // xy = 入力の1ピクセル, z = しきい値, w = 最初の段なら1
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> prm: P;

fn s(uv: vec2f) -> vec3f { return textureSampleLevel(src, samp, uv, 0.0).rgb; }

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let d = prm.texel.xy;
  let uv = i.uv;
  let a = s(uv + d * vec2f(-2.0, -2.0)); let b = s(uv + d * vec2f(0.0, -2.0)); let c = s(uv + d * vec2f(2.0, -2.0));
  let dd = s(uv + d * vec2f(-2.0, 0.0)); let e = s(uv); let f = s(uv + d * vec2f(2.0, 0.0));
  let g = s(uv + d * vec2f(-2.0, 2.0)); let h = s(uv + d * vec2f(0.0, 2.0)); let ii = s(uv + d * vec2f(2.0, 2.0));
  let j = s(uv + d * vec2f(-1.0, -1.0)); let k = s(uv + d * vec2f(1.0, -1.0));
  let l = s(uv + d * vec2f(-1.0, 1.0)); let m = s(uv + d * vec2f(1.0, 1.0));
  var col = e * 0.125 + (a + c + g + ii) * 0.03125 + (b + dd + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (prm.texel.w > 0.5) {
    let br = max(col.r, max(col.g, col.b));
    let knee = prm.texel.z * 0.5;
    var soft = clamp(br - prm.texel.z + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 0.0001);
    let w = max(soft, br - prm.texel.z) / max(br, 0.0001);
    col = min(col * w, vec3f(40.0));
  }
  return vec4f(col, 1.0);
}
`;

// ブルーム：拡大（テントフィルタ）して上の段へ加算
export const BLOOM_UP_SHADER = FULLSCREEN + /* wgsl */`
struct P { texel: vec4f };   // xy = 入力の1ピクセル, z = 半径
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> prm: P;

fn s(uv: vec2f) -> vec3f { return textureSampleLevel(src, samp, uv, 0.0).rgb; }

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let d = prm.texel.xy * prm.texel.z;
  let uv = i.uv;
  var col = s(uv) * 4.0;
  col += (s(uv + vec2f(-d.x, 0.0)) + s(uv + vec2f(d.x, 0.0)) + s(uv + vec2f(0.0, -d.y)) + s(uv + vec2f(0.0, d.y))) * 2.0;
  col += s(uv + vec2f(-d.x, -d.y)) + s(uv + vec2f(d.x, -d.y)) + s(uv + vec2f(-d.x, d.y)) + s(uv + vec2f(d.x, d.y));
  return vec4f(col / 16.0, 1.0);
}
`;

// 最終合成：ブルーム・トーンマップ・色収差・ビネット・フラッシュ・暗転
export const COMPOSITE_SHADER = FULLSCREEN + /* wgsl */`
struct Post {
  a: vec4f,      // x = 露出, y = ブルーム強さ, z = 色収差, w = 時間
  flash: vec4f,  // rgb = 色, a = 強さ
  b: vec4f,      // x = 被弾の赤み, y = 彩度(1=通常), z = 暗転, w = ピンチの脈動
  c: vec4f,      // x = 画面の縦横比
};
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> post: Post;

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }

@fragment
fn fs(i: VOut) -> @location(0) vec4f {
  let uv = i.uv;
  let center = uv - 0.5;
  let ca = post.a.z * (0.001 + dot(center, center) * 0.012);
  let dir = normalize(center + vec2f(0.0001));
  var col = vec3f(
    textureSampleLevel(scene, samp, uv - dir * ca, 0.0).r,
    textureSampleLevel(scene, samp, uv, 0.0).g,
    textureSampleLevel(scene, samp, uv + dir * ca, 0.0).b);
  col += textureSampleLevel(bloom, samp, uv, 0.0).rgb * post.a.y;
  col *= post.a.x;

  // 画面フラッシュ（加算）
  col += post.flash.rgb * post.flash.a;

  var m = aces(col);

  // 彩度（ゲームオーバー時にモノクロへ）
  let lum = dot(m, vec3f(0.299, 0.587, 0.114));
  m = mix(vec3f(lum), m, post.b.y);

  // ビネット＋被弾・ピンチの赤み
  let asp = vec2f(post.c.x, 1.0);
  let vd = length(center * asp) / length(vec2f(0.5) * asp);
  m *= mix(1.0, 0.35, smoothstep(0.55, 1.15, vd));
  let red = clamp(post.b.x + post.b.w, 0.0, 1.0) * smoothstep(0.35, 1.05, vd);
  m = mix(m, vec3f(0.75, 0.02, 0.02), red * 0.75);

  // 暗転
  m *= 1.0 - post.b.z;

  // フィルムグレイン
  m += (hash(uv * 911.0 + post.a.w) - 0.5) * 0.025;

  // sRGB へ
  return vec4f(pow(max(m, vec3f(0.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;
