/**
 * 戦闘演出エンジン（3D）
 *
 * ゲームロジックから呼ばれて、パーティクル・光の輪・剣閃・ビーム・一時的な光源・
 * ダメージ数値・カメラワーク（揺れ・反動・寄り・スローモーション）・画面効果を管理する。
 * 描画は Renderer3D がこのデータを読んで行う。
 * 座標はタイル単位で受け取り、ワールド座標（タイル中心 = gx + 0.5, gy + 0.5）に変換して保持する。
 */
import { fxClock } from './FxClock.js?v=20260925_05';
import { hexToRgb } from '../gfx/math.js?v=20260925_05';

// 画面揺れ（トラウマ値）の減衰と、カメラの反動・寄りが戻る速さ（1秒あたり）
const SHAKE_DECAY_PER_SEC = 2.0;
const KICK_RECOVERY = 14;
const FOCUS_RECOVERY = 4;
// 階層移動の暗転にかける時間 (ms)
const FADE_OUT_MS = 380;
const FADE_IN_MS = 900;
// 新しい階層名を表示する時間 (ms)
const FLOOR_BANNER_MS = 2200;
// 撃破された敵が砕けて消えるまでの時間 (ms)
const DEATH_ANIM_MS = 520;
// 一度に扱うパーティクルの上限
const MAX_PARTICLES = 3000;
// 投擲物・矢の飛ぶ速さ（マス/秒）
const PROJECTILE_SPEED = 14;

// 投擲物が着弾するまでの時間 (ms)。命中の演出をこれに合わせて遅らせる
export function projectileFlightMs(x0, y0, x1, y1) {
  return Math.max(60, (Math.hypot(x1 - x0, y1 - y0) / PROJECTILE_SPEED) * 1000);
}

// 動きを抑える設定の端末では揺れ・寄りを弱める
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION_SCALE = REDUCED_MOTION ? 0.25 : 1;

// パーティクルの種類（FX シェーダーの kind と対応）
export const FX = {
  GLOW: 0, STREAK: 1, RING: 2, SLASH: 3, BEAM: 4, STAR: 5, CHUNK: 6, FLAME: 7, SHOCK: 8, DUST: 9, PILLAR: 10,
};

const wx = (gx) => gx + 0.5;
const wz = (gy) => gy + 0.5;
const rgb = (c) => (typeof c === 'string' ? hexToRgb(c) : c);

// 演出の順番待ち（敵の反撃など）に合わせて遅らせて出すエフェクト
const DEFERRABLE_METHODS = [
  'addDamageNumber', 'addSlash', 'addProjectile', 'addBeam', 'addLevelUp', 'addExplosion',
  'addHitSpark', 'addDeath', 'addPickup', 'addExplosionDust', 'addFloatingText', 'addLight', 'shake', 'kick', 'zoomPunch',
  'flash', 'hurt', 'vibrate', 'focus', 'slowMo', 'aberration',
];

export class AnimationEngine {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.beams = [];
    this.projectiles = [];
    this.deaths = [];
    this.lights = [];

    // カメラワーク
    this.trauma = 0;
    this.shakeTime = 0;
    this.kickX = 0;
    this.kickZ = 0;
    this.zoom = 0;          // 0 = 通常、正で寄る
    this.focusPoint = null; // { x, z, amount } 注目点へカメラを寄せる
    this.timeScale = 1;
    this.slowMoMs = 0;
    this.slowMoScale = 1;

    // 画面効果
    this.screenFlash = null;
    this.hurtAmount = 0;
    this.caAmount = 0;      // 色収差
    this.desaturate = 0;    // 0 = 通常, 1 = モノクロ
    this.transition = null;
    this.floorBanner = null;
    this.introMs = 0;       // 階層に入った直後のカメラの降下演出

    for (const name of DEFERRABLE_METHODS) {
      const fn = this[name].bind(this);
      this[name] = (...args) => fxClock.run(() => fn(...args));
    }
  }

  // --- カメラ・画面演出 ---

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * MOTION_SCALE);
  }

  // 方向 dir（dx, dy）へカメラを押し込む
  kick(dir, power = 4) {
    if (!dir) return;
    const len = Math.hypot(dir.dx, dir.dy) || 1;
    this.kickX += (dir.dx / len) * power * 0.02 * MOTION_SCALE;
    this.kickZ += (dir.dy / len) * power * 0.02 * MOTION_SCALE;
  }

  // 画面をぐっと寄せる
  zoomPunch(amount) {
    this.zoom = Math.max(this.zoom, amount * 3 * MOTION_SCALE);
  }

  // 注目点（タイル座標）へ一時的にカメラを寄せる
  focus(gx, gy, amount = 0.25) {
    this.focusPoint = { x: wx(gx), z: wz(gy), amount: amount * MOTION_SCALE };
  }

  // スローモーション（scale 倍速で ms ミリ秒）
  slowMo(scale, ms) {
    if (REDUCED_MOTION) return;
    this.slowMoScale = Math.min(this.slowMoMs > 0 ? this.slowMoScale : 1, scale);
    this.slowMoMs = Math.max(this.slowMoMs, ms);
  }

  aberration(amount) {
    this.caAmount = Math.min(2, this.caAmount + amount);
  }

  flash(color, alpha = 0.35, ms = 140) {
    this.screenFlash = { color: rgb(color), alpha, life: ms, maxLife: ms };
  }

  hurt(amount) {
    this.hurtAmount = Math.min(1, this.hurtAmount + amount);
  }

  vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {
      // 振動に対応していない環境では何もしない
    }
  }

  getTimeScale() {
    return this.slowMoMs > 0 ? this.slowMoScale : 1;
  }

  // 揺れ・反動・寄り（Renderer3D がカメラに適用する）
  getCameraFx() {
    const t = this.trauma * this.trauma;
    const s = this.shakeTime;
    return {
      x: this.kickX + 0.22 * t * (Math.sin(s * 0.071) * 0.6 + Math.sin(s * 0.137) * 0.4),
      y: 0.16 * t * (Math.sin(s * 0.093 + 1.3) * 0.6 + Math.sin(s * 0.151) * 0.4),
      z: this.kickZ + 0.18 * t * (Math.sin(s * 0.083 + 2.1) * 0.6 + Math.sin(s * 0.127) * 0.4),
      roll: 0.03 * t * Math.sin(s * 0.061),
      zoom: this.zoom,
      focus: this.focusPoint,
    };
  }

  startFloorTransition(label, onMid) {
    this.transition = { phase: 'out', t: 0, onMid, label };
  }

  isTransitioning() {
    return this.transition !== null;
  }

  // 暗転の度合い 0〜1
  getFade() {
    const tr = this.transition;
    if (!tr) return 0;
    return tr.phase === 'out' ? Math.min(1, tr.t / FADE_OUT_MS) : 1 - Math.min(1, tr.t / FADE_IN_MS);
  }

  // --- パーティクル ---

  emit(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      vx: 0, vy: 0, vz: 0, gravity: 0, drag: 1, grow: 0, rot: 0, spin: 0, alpha: 1,
      intensity: 1, dirX: 0, dirY: 0, dirZ: 0, p1: 0, p2: 0, ...p, maxLife: p.life,
    });
  }

  // 一時的な光源（命中の閃光・爆発・魔法）
  addLight(x, y, z, color, intensity, radius, ms) {
    this.lights.push({ x, y, z, color: rgb(color), intensity, radius, life: ms, maxLife: ms });
  }

  // --- ゲームロジックから呼ばれる演出 ---

  addDamageNumber(gridX, gridY, text, color = '#ffffff', isCrit = false) {
    this.texts.push({
      x: wx(gridX) + (Math.random() - 0.5) * 0.2, y: 0.95, z: wz(gridY),
      vx: (Math.random() - 0.5) * 0.6, vy: isCrit ? 3.4 : 2.8, gravity: 7,
      text: String(text), color, scale: isCrit ? 1.7 : 1.1, pop: 1,
      label: isCrit ? 'CRITICAL!' : null, life: isCrit ? 1300 : 950, maxLife: isCrit ? 1300 : 950,
    });
  }

  addFloatingText(gridX, gridY, text, color = '#ffffff', size = 1.0) {
    this.texts.push({
      x: wx(gridX), y: 1.1, z: wz(gridY), vx: 0, vy: 0.9, gravity: 0.2,
      text: String(text), color, scale: size, pop: 1, label: null, life: 1200, maxLife: 1200,
    });
  }

  // 剣閃：攻撃方向に向いた三日月形の軌跡
  addSlash(gridX, gridY, dir) {
    const angle = dir ? Math.atan2(dir.dy, dir.dx) : 0;
    const len = dir ? Math.hypot(dir.dx, dir.dy) : 1;
    // 攻撃した側（相手の手前）を中心に、相手へ向かって弧を描く
    const cx = wx(gridX) - (dir ? dir.dx / len * 0.7 : 0);
    const cz = wz(gridY) - (dir ? dir.dy / len * 0.7 : 0);
    this.emit({ kind: FX.SLASH, x: cx, y: 0.55, z: cz, size: 0.95, color: [1.6, 2.4, 3.4], life: 200, p1: angle, p2: 0, slash: true });
    this.emit({ kind: FX.SLASH, x: cx, y: 0.45, z: cz, size: 0.8, color: [3, 2.2, 1.2], intensity: 0.6, life: 240, p1: angle + 0.35, p2: 0, slash: true });
  }

  // 命中の火花・衝撃波・閃光
  addHitSpark(gridX, gridY, dir, isCrit = false) {
    const x = wx(gridX), z = wz(gridY), y = 0.5;
    const base = dir ? Math.atan2(dir.dy, dir.dx) : 0;
    const count = isCrit ? 46 : 22;
    for (let i = 0; i < count; i++) {
      const a = i % 3 === 0 ? Math.random() * Math.PI * 2 : base + (Math.random() - 0.5) * 1.6;
      const sp = (Math.random() * 5 + 3) * (isCrit ? 1.5 : 1);
      const hot = Math.random() < 0.5;
      this.emit({
        kind: FX.STREAK, x, y, z,
        vx: Math.cos(a) * sp, vy: Math.random() * 3.5 + 0.5, vz: Math.sin(a) * sp,
        gravity: 9, drag: 0.9, size: 0.018 + Math.random() * 0.02,
        color: hot ? [4, 3, 1.4] : [3, 3.2, 4], life: 260 + Math.random() * 260, streak: 0.06,
      });
    }
    // 中心の閃光と衝撃波
    this.emit({ kind: FX.GLOW, x, y, z, size: isCrit ? 0.9 : 0.5, color: [2.4, 2.1, 1.7], life: 110 });
    this.emit({ kind: FX.SHOCK, x, y, z, size: 0.2, grow: isCrit ? 8 : 5, color: [1.4, 1.5, 1.9], life: isCrit ? 320 : 220 });
    this.emit({ kind: FX.RING, x, y: 0.03, z, size: 0.1, grow: isCrit ? 7 : 4, color: [2.2, 1.8, 1.2], life: 380, p2: 0.12 });
    if (isCrit) {
      for (let i = 0; i < 10; i++) {
        this.emit({
          kind: FX.STAR, x: x + (Math.random() - 0.5) * 0.6, y: y + Math.random() * 0.5, z: z + (Math.random() - 0.5) * 0.6,
          size: 0.12 + Math.random() * 0.12, color: [4, 3.4, 1.2], life: 420, spin: 4,
        });
      }
    }
    this.addLight(x, 0.8, z, isCrit ? '#ffe4a0' : '#ffd8a8', isCrit ? 14 : 7, isCrit ? 5 : 3.5, isCrit ? 260 : 150);
  }

  // 撃破：記号が白熱して膨らみ、破片になって砕け散る
  addDeath(gridX, gridY, glyph, color = '#ffffff') {
    const x = wx(gridX), z = wz(gridY);
    const c = rgb(color);
    this.deaths.push({ x, z, glyph, color: c, life: DEATH_ANIM_MS, maxLife: DEATH_ANIM_MS });
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 4 + 1.5;
      this.emit({
        kind: FX.CHUNK, x: x + (Math.random() - 0.5) * 0.4, y: 0.25 + Math.random() * 0.6, z: z + (Math.random() - 0.5) * 0.1,
        vx: Math.cos(a) * sp, vy: Math.random() * 4 + 1.5, vz: Math.sin(a) * sp * 0.8,
        gravity: 11, drag: 0.96, size: 0.025 + Math.random() * 0.04,
        color: i % 4 === 0 ? [3, 3, 3] : c.map(v => v * 2.4), life: 600 + Math.random() * 500, spin: (Math.random() - 0.5) * 20,
        bounce: true,
      });
    }
    this.emit({ kind: FX.SHOCK, x, y: 0.45, z, size: 0.3, grow: 8, color: c.map(v => v * 3), life: 380 });
    this.emit({ kind: FX.RING, x, y: 0.03, z, size: 0.2, grow: 6, color: c.map(v => v * 2.5), life: 520, p2: 0.15 });
    this.emit({ kind: FX.GLOW, x, y: 0.5, z, size: 1.6, color: c.map(v => v * 3 + 1), life: 200 });
    this.addLight(x, 0.8, z, color, 12, 5, 380);
  }

  // 歩いた足元の土ぼこり
  addDust(gridX, gridY, amount = 3) {
    const x = wx(gridX), z = wz(gridY);
    for (let i = 0; i < amount; i++) {
      this.emit({
        kind: FX.DUST, x: x + (Math.random() - 0.5) * 0.3, y: 0.05, z: z + (Math.random() - 0.5) * 0.3,
        vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4,
        drag: 0.95, size: 0.08, grow: 0.25, color: [0.22, 0.19, 0.15], life: 500,
      });
    }
  }

  // 扉を蹴破った：木片と土煙
  addExplosionDust(gridX, gridY) {
    const x = wx(gridX), z = wz(gridY);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        kind: FX.CHUNK, x, y: 0.5 + Math.random() * 0.4, z,
        vx: Math.cos(a) * 3, vy: 1 + Math.random() * 3, vz: Math.sin(a) * 3, gravity: 10, drag: 0.96,
        size: 0.03 + Math.random() * 0.03, color: [0.5, 0.3, 0.15], life: 900, spin: 10, bounce: true,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.emit({
        kind: FX.DUST, x: x + (Math.random() - 0.5) * 0.6, y: 0.2, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), drag: 0.94, size: 0.2, grow: 0.6,
        color: [0.25, 0.2, 0.15], life: 900,
      });
    }
  }

  // アイテムを拾った：光が立ち上り、文字が出る
  addPickup(gridX, gridY, icon, text = null, color = '#facc15') {
    const x = wx(gridX), z = wz(gridY);
    const c = rgb(color);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        kind: i % 2 ? FX.STAR : FX.GLOW, x: x + Math.cos(a) * 0.2, y: 0.2, z: z + Math.sin(a) * 0.2,
        vx: Math.cos(a) * 0.6, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(a) * 0.6, drag: 0.95,
        size: 0.06 + Math.random() * 0.06, color: c.map(v => v * 3), life: 700, spin: 3,
      });
    }
    this.emit({ kind: FX.PILLAR, x, y: 0, z, size: 0.25, color: c.map(v => v * 1.5), life: 500, p2: 1.6 });
    this.addLight(x, 0.6, z, color, 5, 3, 400);
    if (text) this.addFloatingText(gridX, gridY, text, color, 0.9);
  }

  // 投擲物・矢（item を渡すとそのモデルが飛ぶ）
  addProjectile(startX, startY, endX, endY, icon, item = null) {
    const dist = Math.hypot(endX - startX, endY - startY);
    this.projectiles.push({
      x0: wx(startX), z0: wz(startY), x1: wx(endX), z1: wz(endY),
      progress: 0, speed: PROJECTILE_SPEED / Math.max(0.06 * PROJECTILE_SPEED, dist), // 1秒あたりの進行
      arc: item && item.type !== 'arrow' ? Math.min(0.9, dist * 0.12) : 0.05,
      icon, item, spin: 0,
    });
  }

  // 魔法ビーム・火炎
  addBeam(startX, startY, endX, endY, color = '#38bdf8') {
    const c = rgb(color);
    const x0 = wx(startX), z0 = wz(startY), x1 = wx(endX), z1 = wz(endY);
    this.beams.push({ x0, z0, x1, z1, color: c, life: 420, maxLife: 420 });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 3 + 1;
      this.emit({
        kind: FX.GLOW, x: x1, y: 0.5, z: z1, vx: Math.cos(a) * sp, vy: Math.random() * 3, vz: Math.sin(a) * sp,
        drag: 0.9, size: 0.06 + Math.random() * 0.06, color: c.map(v => v * 4), life: 450,
      });
    }
    this.emit({ kind: FX.SHOCK, x: x1, y: 0.5, z: z1, size: 0.2, grow: 6, color: c.map(v => v * 3), life: 300 });
    this.addLight((x0 + x1) / 2, 0.8, (z0 + z1) / 2, color, 10, 5, 420);
    this.aberration(0.6);
  }

  // レベルアップ：光の柱と上昇する光の粒
  addLevelUp(gridX, gridY) {
    const x = wx(gridX), z = wz(gridY);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.4;
      this.emit({
        kind: i % 3 === 0 ? FX.STAR : FX.GLOW, x: x + Math.cos(a) * r, y: Math.random() * 0.3, z: z + Math.sin(a) * r,
        vx: -Math.sin(a) * 0.8, vy: 1.5 + Math.random() * 2.5, vz: Math.cos(a) * 0.8, drag: 0.98,
        size: 0.05 + Math.random() * 0.07, color: [[4, 3.2, 1], [1.5, 3, 4], [2, 4, 2]][i % 3], life: 1300, spin: 2,
      });
    }
    this.emit({ kind: FX.PILLAR, x, y: 0, z, size: 0.5, color: [3, 2.5, 1], life: 1100, p2: 3.5 });
    this.emit({ kind: FX.RING, x, y: 0.03, z, size: 0.2, grow: 5, color: [4, 3, 1], life: 900, p2: 0.1 });
    this.emit({ kind: FX.RING, x, y: 0.03, z, size: 0.1, grow: 3, color: [3, 3, 3], life: 700, p2: 0.08 });
    this.addLight(x, 1.2, z, '#ffe08a', 16, 6, 1100);
    this.addFloatingText(gridX, gridY - 0.3, 'LEVEL UP!', '#facc15', 1.6);
    this.flash('#fff2c0', 0.5, 350);
    this.zoomPunch(0.08);
    this.focus(gridX, gridY, 0.35);
  }

  // 爆発（地雷など）
  addExplosion(gridX, gridY) {
    const x = wx(gridX), z = wz(gridY);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2;
      const sp = Math.random() * 7 + 2;
      this.emit({
        kind: i % 3 === 0 ? FX.STREAK : FX.FLAME, x, y: 0.3, z,
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp,
        gravity: 6, drag: 0.9, size: i % 3 === 0 ? 0.03 : 0.25 + Math.random() * 0.2, grow: -0.2,
        color: [[5, 2, 0.5], [5, 3.5, 1], [3, 1, 0.3]][i % 3], life: 500 + Math.random() * 400, p2: Math.random(),
        streak: 0.08,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.emit({
        kind: FX.DUST, x: x + (Math.random() - 0.5), y: 0.3, z: z + (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, drag: 0.93,
        size: 0.3, grow: 1.2, color: [0.18, 0.13, 0.1], life: 1400,
      });
    }
    this.emit({ kind: FX.SHOCK, x, y: 0.4, z, size: 0.4, grow: 16, color: [5, 3, 1.5], life: 400 });
    this.emit({ kind: FX.RING, x, y: 0.03, z, size: 0.3, grow: 12, color: [5, 2.5, 0.8], life: 600, p2: 0.2 });
    this.addLight(x, 1, z, '#ff9a4a', 30, 8, 600);
    this.shake(0.9);
    this.flash('#fff1dc', 0.8, 300);
    this.aberration(1.5);
    this.slowMo(0.3, 220);
  }

  // --- 更新 ---

  // realMs: 実時間, gameMs: スローモーションを反映した時間
  update(realMs, gameMs) {
    const rs = realMs / 1000;
    const gs = gameMs / 1000;

    this.shakeTime += realMs;
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY_PER_SEC * rs);
    const kd = Math.exp(-KICK_RECOVERY * rs);
    this.kickX *= kd;
    this.kickZ *= kd;
    this.zoom *= Math.exp(-6 * rs);
    if (this.focusPoint) {
      this.focusPoint.amount *= Math.exp(-FOCUS_RECOVERY * rs);
      if (this.focusPoint.amount < 0.005) this.focusPoint = null;
    }
    this.hurtAmount = Math.max(0, this.hurtAmount - 1.4 * rs);
    this.caAmount = Math.max(0, this.caAmount - 3 * rs);
    if (this.slowMoMs > 0) this.slowMoMs -= realMs;
    if (this.introMs > 0) this.introMs -= realMs;

    if (this.screenFlash) {
      this.screenFlash.life -= realMs;
      if (this.screenFlash.life <= 0) this.screenFlash = null;
    }
    this.updateTransition(realMs);
    if (this.floorBanner) {
      this.floorBanner.life -= realMs;
      if (this.floorBanner.life <= 0) this.floorBanner = null;
    }

    // ヒットストップ中は時間を止める（揺れは続ける）
    if (fxClock.isFrozen()) return;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const drag = Math.pow(p.drag, gameMs / 16.7);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.vy -= p.gravity * gs;
      p.x += p.vx * gs; p.y += p.vy * gs; p.z += p.vz * gs;
      if (p.bounce && p.y < 0.02 && p.vy < 0) {
        p.y = 0.02;
        p.vy *= -0.35;
        p.vx *= 0.6; p.vz *= 0.6;
      }
      p.size = Math.max(0.001, p.size + p.grow * gs);
      p.rot += p.spin * gs;
      p.life -= gameMs;
      if (p.slash) p.p2 = 1 - p.life / p.maxLife;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.x += t.vx * gs;
      t.y += t.vy * gs;
      t.vy -= t.gravity * gs;
      if (t.y < 0.7 && t.vy < 0) { t.y = 0.7; t.vy = 0; t.gravity = 0; }
      t.pop *= Math.exp(-14 * gs);
      t.life -= gameMs;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    for (const list of [this.beams, this.deaths, this.lights]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= gameMs;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.progress += pr.speed * gs;
      pr.spin += gs * 14;
      if (pr.progress >= 1) {
        // 着弾の小さな火花
        this.emit({ kind: FX.GLOW, x: pr.x1, y: 0.45, z: pr.z1, size: 0.4, color: [3, 2.6, 2], life: 120 });
        this.projectiles.splice(i, 1);
      }
    }
  }

  updateTransition(realMs) {
    const tr = this.transition;
    if (!tr) return;
    tr.t += realMs;
    if (tr.phase === 'out' && tr.t >= FADE_OUT_MS) {
      tr.phase = 'in';
      tr.t = 0;
      if (tr.onMid) tr.onMid();
      if (tr.label) this.floorBanner = { text: tr.label, life: FLOOR_BANNER_MS, maxLife: FLOOR_BANNER_MS };
      // 新しい階層では高い位置からカメラが降りてくる
      this.introMs = 1400;
    } else if (tr.phase === 'in' && tr.t >= FADE_IN_MS) {
      this.transition = null;
    }
  }
}
