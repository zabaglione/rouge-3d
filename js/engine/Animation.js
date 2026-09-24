/**
 * 60FPS パーティクル・アニメーション・フローティングテキスト演出エンジン
 * 画面揺れ・カメラの反動・画面フラッシュ・階層移動の暗転などの「手応え」演出もここで扱う
 */
import { CONFIG } from '../config.js?v=20260924_11';
import { fxClock } from './FxClock.js?v=20260924_11';

// 画面揺れの最大振れ幅 (px) と、揺れ（トラウマ値）が1秒あたりに減る量
const SHAKE_MAX_OFFSET = 14;
const SHAKE_DECAY_PER_SEC = 2.2;
// カメラの反動・ズームが元に戻る速さ（1秒あたりの減衰係数）
const KICK_RECOVERY = 18;
const ZOOM_RECOVERY = 9;
// 階層移動の暗転にかける時間 (ms)
const FADE_OUT_MS = 280;
const FADE_IN_MS = 420;
// 新しい階層名を表示する時間 (ms)
const FLOOR_BANNER_MS = 1600;
// 撃破された敵が弾けて消えるまでの時間 (ms)
const DEATH_ANIM_MS = 380;

// 動きを抑える設定の端末では揺れ・ズームを弱める
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION_SCALE = REDUCED_MOTION ? 0.25 : 1;

// 絵文字スプライトの白抜き（被弾・撃破時の白フラッシュ用）をアイコンごとに作り置く
const flashSpriteCache = new Map();
export function getFlashSprite(icon, size) {
  const key = `${icon}_${size}`;
  if (flashSpriteCache.has(key)) return flashSpriteCache.get(key);
  const dim = Math.ceil(size * 1.6);
  const c = document.createElement('canvas');
  c.width = dim;
  c.height = dim;
  const g = c.getContext('2d');
  g.font = `${size}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, dim / 2, dim / 2);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, dim, dim);
  flashSpriteCache.set(key, c);
  return c;
}

// グリッド座標 → ワールド座標（タイル中心）
function tileCenter(gridX, gridY) {
  return {
    x: gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
    y: gridY * CONFIG.TILE_D + CONFIG.TILE_D / 2,
  };
}

// 演出の順番待ち（敵の反撃など）に合わせて遅らせて出すエフェクト
const DEFERRABLE_METHODS = [
  'addDamageNumber', 'addSlash', 'addProjectile', 'addBeam', 'addLevelUp', 'addExplosion',
  'addHitSpark', 'addDeath', 'addPickup', 'addFloatingText', 'shake', 'kick', 'zoomPunch',
  'flash', 'hurt', 'vibrate',
];

export class AnimationEngine {
  constructor() {
    this.particles = [];
    this.damageTexts = [];
    this.slashes = [];
    this.projectiles = [];
    this.beams = [];
    this.rings = [];
    this.deaths = [];

    // カメラ演出
    this.trauma = 0;      // 画面揺れの強さ 0〜1
    this.kickX = 0;       // 攻撃方向へのカメラの反動 (px)
    this.kickY = 0;
    this.zoom = 1;        // 会心・レベルアップ時のズーム
    this.shakeTime = 0;

    // 画面全体への演出
    this.screenFlash = null; // { color, alpha, life, maxLife }
    this.hurtAmount = 0;     // 被弾時の赤い縁取り 0〜1
    this.transition = null;  // 階層移動の暗転 { phase, t, onMid }
    this.floorBanner = null; // { text, life }

    for (const name of DEFERRABLE_METHODS) {
      const fn = this[name].bind(this);
      this[name] = (...args) => fxClock.run(() => fn(...args));
    }
  }

  // --- カメラ・画面演出 ---

  // 画面揺れ（強さ 0〜1 を加算）
  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount * MOTION_SCALE);
  }

  // 方向 dir へカメラを押し込む反動
  kick(dir, power = 4) {
    if (!dir) return;
    const len = Math.hypot(dir.dx, dir.dy) || 1;
    this.kickX += (dir.dx / len) * power * MOTION_SCALE;
    this.kickY += (dir.dy / len) * power * 0.75 * MOTION_SCALE;
  }

  zoomPunch(amount) {
    this.zoom = Math.max(this.zoom, 1 + amount * MOTION_SCALE);
  }

  flash(color, alpha = 0.35, ms = 140) {
    this.screenFlash = { color, alpha, life: ms, maxLife: ms };
  }

  // 被弾時の画面縁の赤み
  hurt(amount) {
    this.hurtAmount = Math.min(1, this.hurtAmount + amount);
  }

  // 対応端末の振動（Android 等）
  vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {
      // 振動に対応していない環境では何もしない
    }
  }

  // 現在のカメラの揺れ・反動・ズーム
  getCameraFx() {
    const t = this.trauma * this.trauma;
    const s = this.shakeTime;
    return {
      x: this.kickX + SHAKE_MAX_OFFSET * t * (Math.sin(s * 0.071) * 0.6 + Math.sin(s * 0.137) * 0.4),
      y: this.kickY + SHAKE_MAX_OFFSET * t * (Math.sin(s * 0.093 + 1.3) * 0.6 + Math.sin(s * 0.151) * 0.4),
      zoom: this.zoom,
    };
  }

  // 階層移動の暗転。真っ暗になった時点で onMid（階層生成）を呼び、明けたら階層名を出す
  startFloorTransition(label, onMid) {
    this.transition = { phase: 'out', t: 0, onMid, label };
  }

  isTransitioning() {
    return this.transition !== null;
  }

  // --- ワールド上のエフェクト ---

  // ダメージ数値・回復数値のポップアップ（出た瞬間に大きく弾み、放物線を描いて落ちる）
  addDamageNumber(gridX, gridY, text, color = '#ffffff', isCrit = false) {
    const { x, y } = tileCenter(gridX, gridY);
    this.damageTexts.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y - 28,
      vx: (Math.random() - 0.5) * 1.2,
      vy: isCrit ? -3.6 : -3.0,
      gravity: 0.16,
      text: String(text),
      color: color,
      alpha: 1.0,
      scale: isCrit ? 1.6 : 1.0,
      pop: 1,
      label: isCrit ? 'CRITICAL!' : null,
      life: isCrit ? 75 : 55, // frames
      maxLife: isCrit ? 75 : 55,
    });
  }

  // 数値以外の短い文字（MISS、LEVEL UP! など）
  addFloatingText(gridX, gridY, text, color = '#ffffff', size = 1.0) {
    const { x, y } = tileCenter(gridX, gridY);
    this.damageTexts.push({
      x, y: y - 34, vx: 0, vy: -1.4, gravity: 0.02,
      text: String(text), color, alpha: 1.0, scale: size, pop: 1, label: null,
      life: 70, maxLife: 70,
    });
  }

  // スラッシュ（剣閃エフェクト）
  addSlash(gridX, gridY, dir) {
    const angle = dir ? dir.angle : 0;
    const { x, y } = tileCenter(gridX, gridY);
    this.slashes.push({
      x,
      y: y - 8,
      angle: angle,
      radius: CONFIG.TILE_W * 0.7,
      progress: 0, // 0 -> 1
      life: 150, // ms
      maxLife: 150,
    });
  }

  // 命中の火花（放射状の光の筋＋衝撃リング）
  addHitSpark(gridX, gridY, dir, isCrit = false) {
    const { x, y } = tileCenter(gridX, gridY);
    const cy = y - 10;
    const baseAngle = dir ? dir.angle : 0;
    const count = isCrit ? 16 : 9;

    for (let i = 0; i < count; i++) {
      // 攻撃方向に飛び散る火花と、全方位の火花を混ぜる
      const a = i % 3 === 0 ? Math.random() * Math.PI * 2 : baseAngle + (Math.random() - 0.5) * 1.4;
      const speed = Math.random() * (isCrit ? 7 : 5) + 3;
      this.particles.push({
        x, y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.75,
        drag: 0.86,
        streak: true,
        color: i % 2 === 0 ? '#ffffff' : (isCrit ? '#facc15' : '#fde68a'),
        radius: Math.random() * 1.5 + 1.5,
        alpha: 1.0,
        life: isCrit ? 22 : 16,
        maxLife: isCrit ? 22 : 16,
      });
    }

    this.rings.push({
      x, y: cy, radius: 6, maxRadius: isCrit ? 44 : 26,
      color: isCrit ? '#facc15' : '#ffffff', width: isCrit ? 5 : 3,
      life: isCrit ? 260 : 180, maxLife: isCrit ? 260 : 180,
    });
  }

  // 撃破：白く光って膨らみ、破片になって弾け飛ぶ
  addDeath(gridX, gridY, icon, color = '#ffffff') {
    const { x, y } = tileCenter(gridX, gridY);
    this.deaths.push({ x, y: y - 10, icon, life: DEATH_ANIM_MS, maxLife: DEATH_ANIM_MS });

    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4.5 + 1.5;
      this.particles.push({
        x, y: y - 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed * 0.7 - 1.5,
        gravity: 0.18,
        drag: 0.96,
        color: i % 3 === 0 ? '#ffffff' : color,
        radius: Math.random() * 2.5 + 1.5,
        alpha: 1.0,
        life: 34 + Math.floor(Math.random() * 12),
        maxLife: 46,
      });
    }
    this.rings.push({
      x, y: y - 6, radius: 8, maxRadius: 40, color, width: 4, life: 300, maxLife: 300,
    });
  }

  // 歩いた足元の土ぼこり
  addDust(gridX, gridY, amount = 3) {
    const { x, y } = tileCenter(gridX, gridY);
    for (let i = 0; i < amount; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + 4 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -Math.random() * 0.5 - 0.1,
        drag: 0.94,
        grow: 0.12,
        noGlow: true,
        color: 'rgba(203, 190, 170, 0.55)',
        radius: Math.random() * 2 + 2,
        alpha: 0.8,
        life: 22,
        maxLife: 22,
      });
    }
  }

  // アイテムを拾った：アイコンが跳ね上がって光り、文字が出る
  addPickup(gridX, gridY, icon, text = null, color = '#facc15') {
    const { x, y } = tileCenter(gridX, gridY);
    this.projectiles.push({
      isPickup: true,
      curX: x, curY: y - 8, vy: -4.2, icon,
      progress: 0, speed: 0.045,
    });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y: y - 14,
        vx: Math.cos(a) * 2.2,
        vy: Math.sin(a) * 2.2 - 1,
        drag: 0.9,
        star: true,
        color: i % 2 ? '#ffffff' : color,
        radius: Math.random() * 1.5 + 1.5,
        alpha: 1.0,
        life: 26,
        maxLife: 26,
      });
    }
    if (text) this.addFloatingText(gridX, gridY, text, color, 0.85);
  }

  // 投擲物（矢・アイテム）の飛翔アニメーション
  addProjectile(startX, startY, endX, endY, icon) {
    const from = tileCenter(startX, startY);
    const to = tileCenter(endX, endY);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);

    this.projectiles.push({
      fromX: from.x, fromY: from.y - 10, toX: to.x, toY: to.y - 10,
      curX: from.x, curY: from.y - 10,
      icon,
      progress: 0,
      speed: 0.09, // 進行度増加速度
      arc: Math.min(28, dist * 0.12), // 投げた物は山なりに飛ぶ
      spin: (to.x >= from.x ? 1 : -1) * 0.35,
      angle: 0,
    });
  }

  // 魔法ビーム・火炎
  addBeam(startX, startY, endX, endY, color = '#38bdf8') {
    const a = tileCenter(startX, startY);
    const b = tileCenter(endX, endY);
    this.beams.push({
      x1: a.x, y1: a.y - 10, x2: b.x, y2: b.y - 10,
      color: color,
      alpha: 1.0,
      life: 260, // ms
      maxLife: 260,
    });
    // 着弾点の光
    this.rings.push({ x: b.x, y: b.y - 10, radius: 4, maxRadius: 30, color, width: 4, life: 240, maxLife: 240 });
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.particles.push({
        x: b.x, y: b.y - 10, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, drag: 0.9,
        color, radius: Math.random() * 2 + 1.5, alpha: 1, life: 24, maxLife: 24,
      });
    }
  }

  // レベルアップの光（立ち上る光の粒＋光の輪＋画面フラッシュ）
  addLevelUp(gridX, gridY) {
    const { x: cx, y: cy } = tileCenter(gridX, gridY);

    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 26,
        y: cy + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 4 - 2, // 上昇
        drag: 0.97,
        star: i % 2 === 0,
        color: ['#facc15', '#38bdf8', '#4ade80', '#ffffff'][Math.floor(Math.random() * 4)],
        radius: Math.random() * 3 + 2,
        alpha: 1.0,
        life: 60,
        maxLife: 60,
      });
    }
    this.rings.push({ x: cx, y: cy, radius: 10, maxRadius: 70, color: '#facc15', width: 5, flat: true, life: 500, maxLife: 500 });
    this.rings.push({ x: cx, y: cy, radius: 4, maxRadius: 46, color: '#ffffff', width: 3, flat: true, life: 380, maxLife: 380 });
    this.addFloatingText(gridX, gridY - 0.6, 'LEVEL UP!', '#facc15', 1.3);
    this.flash('#fde68a', 0.35, 260);
    this.zoomPunch(0.05);
  }

  // 爆発エフェクト（地雷など）
  addExplosion(gridX, gridY) {
    const { x: cx, y: cy } = tileCenter(gridX, gridY);

    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 7 + 1;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.75,
        drag: 0.92,
        color: ['#ef4444', '#f97316', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 4)],
        radius: Math.random() * 4 + 2,
        alpha: 1.0,
        life: 40,
        maxLife: 40,
      });
    }
    this.rings.push({ x: cx, y: cy, radius: 10, maxRadius: 90, color: '#f97316', width: 8, flat: true, life: 420, maxLife: 420 });
    this.shake(0.8);
    this.flash('#fff7ed', 0.6, 220);
  }

  // フレーム毎更新
  update(deltaMs) {
    const sec = deltaMs / 1000;

    // カメラ演出の減衰（ヒットストップ中も揺れは続ける）
    this.shakeTime += deltaMs;
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY_PER_SEC * sec);
    const kickDecay = Math.exp(-KICK_RECOVERY * sec);
    this.kickX *= kickDecay;
    this.kickY *= kickDecay;
    this.zoom = 1 + (this.zoom - 1) * Math.exp(-ZOOM_RECOVERY * sec);
    this.hurtAmount = Math.max(0, this.hurtAmount - 1.6 * sec);

    if (this.screenFlash) {
      this.screenFlash.life -= deltaMs;
      if (this.screenFlash.life <= 0) this.screenFlash = null;
    }
    this.updateTransition(deltaMs);
    if (this.floorBanner) {
      this.floorBanner.life -= deltaMs;
      if (this.floorBanner.life <= 0) this.floorBanner = null;
    }

    // ヒットストップ中は時間を止める
    if (fxClock.isFrozen()) return;

    // パーティクル
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.drag) {
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
      if (p.gravity) p.vy += p.gravity;
      if (p.grow) p.radius += p.grow;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // ダメージ数値
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const t = this.damageTexts[i];
      t.x += t.vx;
      t.y += t.vy;
      t.vy = Math.min(t.vy + t.gravity, 1.2);
      t.pop *= 0.8;
      t.life--;
      // 前半ははっきり見せ、後半でフェードアウト
      t.alpha = Math.min(1, (t.life / t.maxLife) * 2.2);
      if (t.life <= 0) this.damageTexts.splice(i, 1);
    }

    // スラッシュ
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= deltaMs;
      s.progress = 1 - Math.max(0, s.life / s.maxLife);
      if (s.life <= 0) this.slashes.splice(i, 1);
    }

    // 衝撃リング・撃破
    for (const list of [this.rings, this.deaths]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= deltaMs;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    }

    // 投擲物
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.progress += pr.speed;
      if (pr.isPickup) {
        pr.curY += pr.vy;
        pr.vy *= 0.9;
      } else {
        pr.curX = pr.fromX + (pr.toX - pr.fromX) * pr.progress;
        pr.curY = pr.fromY + (pr.toY - pr.fromY) * pr.progress - Math.sin(pr.progress * Math.PI) * pr.arc;
        pr.angle += pr.spin;
      }
      if (pr.progress >= 1.0) this.projectiles.splice(i, 1);
    }

    // ビーム
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= deltaMs;
      b.alpha = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) this.beams.splice(i, 1);
    }
  }

  updateTransition(deltaMs) {
    const tr = this.transition;
    if (!tr) return;
    tr.t += deltaMs;
    if (tr.phase === 'out' && tr.t >= FADE_OUT_MS) {
      tr.phase = 'in';
      tr.t = 0;
      if (tr.onMid) tr.onMid();
      if (tr.label) this.floorBanner = { text: tr.label, life: FLOOR_BANNER_MS };
    } else if (tr.phase === 'in' && tr.t >= FADE_IN_MS) {
      this.transition = null;
    }
  }

  // 描画（カメラオフセット適用済み座標系）
  render(ctx, cameraOffsetX, cameraOffsetY) {
    ctx.save();
    ctx.translate(-cameraOffsetX, -cameraOffsetY);

    // 1. ビーム描画（太い光から細くなって消える）
    for (const b of this.beams) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 12 * b.alpha;
      ctx.globalAlpha = b.alpha;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      // コアの白い光
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4 * b.alpha;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. 衝撃リング
    for (const r of this.rings) {
      const p = 1 - r.life / r.maxLife;
      const eased = 1 - Math.pow(1 - p, 3);
      const radius = r.radius + (r.maxRadius - r.radius) * eased;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - p) + 0.5;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      // flat は床に広がる輪（奥行き方向につぶす）
      ctx.ellipse(r.x, r.y, radius, r.flat ? radius * 0.45 : radius * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. スラッシュ描画（太い三日月形の剣閃）
    for (const s of this.slashes) {
      const p = s.progress;
      const sweep = Math.min(1, p * 2.2); // 前半で振り抜き、後半で消える
      const fade = 1 - Math.max(0, (p - 0.35) / 0.65);
      if (fade <= 0) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.globalAlpha = fade;

      const start = -Math.PI * 0.55;
      const end = start + Math.PI * 1.1 * sweep;
      ctx.beginPath();
      ctx.arc(0, 0, s.radius, start, end);
      ctx.arc(0, 0, s.radius * 0.62, end, start, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.shadowColor = '#7dd3fc';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.restore();
    }

    // 4. 撃破された敵（白く光って膨らみながら消える）
    for (const d of this.deaths) {
      const p = 1 - d.life / d.maxLife;
      const sprite = getFlashSprite(d.icon, 26);
      const scale = 1 + p * 0.6;
      const w = sprite.width * scale;
      const h = sprite.height * (1 + p * 0.3) * (1 - p * 0.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p * p);
      ctx.drawImage(sprite, d.x - w / 2, d.y - h / 2, w, h);
      ctx.restore();
    }

    // 5. 投擲物・拾ったアイテム
    for (const pr of this.projectiles) {
      ctx.save();
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = pr.isPickup ? '#facc15' : '#000000';
      ctx.shadowBlur = pr.isPickup ? 14 : 6;
      if (pr.isPickup) {
        ctx.globalAlpha = Math.max(0, 1 - pr.progress * pr.progress);
        ctx.translate(pr.curX, pr.curY);
        const s = 1 + pr.progress * 0.4;
        ctx.scale(s, s);
      } else {
        ctx.translate(pr.curX, pr.curY);
        ctx.rotate(pr.angle || 0);
      }
      ctx.fillText(pr.icon, 0, 0);
      ctx.restore();
    }

    // 6. パーティクル
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (!p.noGlow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
      }
      if (p.streak) {
        // 速度方向に伸びた光の筋
        ctx.lineWidth = p.radius;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        ctx.stroke();
      } else if (p.star) {
        // 十字のきらめき
        const r = p.radius * 2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y);
        ctx.lineTo(p.x + r, p.y);
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x, p.y + r);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 7. ダメージ数値ポップアップ
    for (const t of this.damageTexts) {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      const size = Math.round(20 * t.scale * (1 + t.pop * 0.8));
      ctx.font = `900 ${size}px 'Outfit', 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = '#05070c';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;

      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);

      if (t.label) {
        ctx.font = `900 ${Math.round(11 * (1 + t.pop))}px 'Outfit', 'Inter', sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeText(t.label, t.x, t.y - size * 0.9);
        ctx.fillText(t.label, t.x, t.y - size * 0.9);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // 画面全体への演出（カメラの影響を受けない）。hpRatio はピンチ時の縁取りに使う
  renderScreen(ctx, width, height, hpRatio = 1) {
    // 被弾・ピンチ時の赤い縁取り
    const lowHp = hpRatio <= 0.25 ? (0.25 - hpRatio) / 0.25 : 0;
    const pulse = lowHp > 0 ? (Math.sin(this.shakeTime * 0.006) * 0.5 + 0.5) : 0;
    const redness = Math.min(1, this.hurtAmount * 0.9 + lowHp * (0.25 + pulse * 0.25));
    if (redness > 0.01) {
      const r = Math.max(width, height) * 0.75;
      const grad = ctx.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
      grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      grad.addColorStop(1, `rgba(220, 38, 38, ${0.6 * redness})`);
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 画面フラッシュ
    if (this.screenFlash) {
      const f = this.screenFlash;
      ctx.save();
      ctx.globalAlpha = f.alpha * Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 階層移動の暗転
    const tr = this.transition;
    if (tr) {
      const a = tr.phase === 'out' ? Math.min(1, tr.t / FADE_OUT_MS) : 1 - Math.min(1, tr.t / FADE_IN_MS);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 新しい階層名
    if (this.floorBanner) {
      const b = this.floorBanner;
      const p = 1 - b.life / FLOOR_BANNER_MS;
      const alpha = p < 0.15 ? p / 0.15 : (p > 0.7 ? (1 - p) / 0.3 : 1);
      const y = height * 0.38 - (1 - Math.min(1, p / 0.15)) * 12;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 34px 'Outfit', 'Inter', sans-serif`;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(5, 7, 12, 0.9)';
      ctx.fillStyle = '#fde68a';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.strokeText(b.text, width / 2, y);
      ctx.fillText(b.text, width / 2, y);
      // 下線
      const lw = 140 * Math.min(1, p / 0.25);
      ctx.fillRect(width / 2 - lw / 2, y + 24, lw, 2);
      ctx.restore();
    }
  }
}
