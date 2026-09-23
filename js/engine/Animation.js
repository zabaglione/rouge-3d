/**
 * 60FPS パーティクル・アニメーション・フローティングテキスト演出エンジン
 */
import { CONFIG } from '../config.js?v=20260924_8';

export class AnimationEngine {
  constructor() {
    this.particles = [];
    this.damageTexts = [];
    this.slashes = [];
    this.projectiles = [];
    this.beams = [];
  }

  // ダメージ数値・回復数値のポップアップ
  addDamageNumber(gridX, gridY, text, color = '#ffffff', isCrit = false) {
    this.damageTexts.push({
      x: gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
      y: gridY * CONFIG.TILE_D - 10,
      vy: -1.8,
      text: String(text),
      color: color,
      alpha: 1.0,
      scale: isCrit ? 1.4 : 1.0,
      life: 60, // frames
      maxLife: 60,
    });
  }

  // スラッシュ（剣閃エフェクト）
  addSlash(gridX, gridY, dir) {
    const angle = dir ? dir.angle : 0;
    this.slashes.push({
      x: gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
      y: gridY * CONFIG.TILE_D + CONFIG.TILE_D / 2,
      angle: angle,
      radius: CONFIG.TILE_W * 0.7,
      progress: 0, // 0 -> 1
      life: 140, // ms
      maxLife: 140,
    });

    // スラッシュ時の火花パーティクル
    for (let i = 0; i < 6; i++) {
      const pAngle = angle + (Math.random() - 0.5) * 1.2;
      const speed = Math.random() * 3 + 2;
      this.particles.push({
        x: gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
        y: gridY * CONFIG.TILE_D + CONFIG.TILE_D / 2,
        vx: Math.cos(pAngle) * speed,
        vy: Math.sin(pAngle) * speed,
        color: '#fef08a',
        radius: Math.random() * 2.5 + 1.5,
        alpha: 1.0,
        life: 20,
        maxLife: 20,
      });
    }
  }

  // 投擲物（矢・アイテム）の飛翔アニメーション
  addProjectile(startX, startY, endX, endY, icon) {
    const fromX = startX * CONFIG.TILE_W + CONFIG.TILE_W / 2;
    const fromY = startY * CONFIG.TILE_D + CONFIG.TILE_D / 2;
    const toX = endX * CONFIG.TILE_W + CONFIG.TILE_W / 2;
    const toY = endY * CONFIG.TILE_D + CONFIG.TILE_D / 2;

    this.projectiles.push({
      fromX, fromY, toX, toY,
      curX: fromX, curY: fromY,
      icon,
      progress: 0,
      speed: 0.09, // 進行度増加速度
    });
  }

  // 魔法ビーム・火炎
  addBeam(startX, startY, endX, endY, color = '#38bdf8') {
    this.beams.push({
      x1: startX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
      y1: startY * CONFIG.TILE_D + CONFIG.TILE_D / 2,
      x2: endX * CONFIG.TILE_W + CONFIG.TILE_W / 2,
      y2: endY * CONFIG.TILE_D + CONFIG.TILE_D / 2,
      color: color,
      alpha: 1.0,
      life: 180, // ms
      maxLife: 180,
    });
  }

  // レベルアップの光
  addLevelUp(gridX, gridY) {
    const cx = gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2;
    const cy = gridY * CONFIG.TILE_D + CONFIG.TILE_D / 2;

    for (let i = 0; i < 30; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 4 - 2, // 上昇
        color: ['#facc15', '#38bdf8', '#4ade80', '#f43f5e'][Math.floor(Math.random() * 4)],
        radius: Math.random() * 3 + 2,
        alpha: 1.0,
        life: 50,
        maxLife: 50,
      });
    }
  }

  // 爆発エフェクト（地雷など）
  addExplosion(gridX, gridY) {
    const cx = gridX * CONFIG.TILE_W + CONFIG.TILE_W / 2;
    const cy = gridY * CONFIG.TILE_D + CONFIG.TILE_D / 2;

    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 1;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: ['#ef4444', '#f97316', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 4)],
        radius: Math.random() * 4 + 2,
        alpha: 1.0,
        life: 35,
        maxLife: 35,
      });
    }
  }

  // フレーム毎更新
  update(deltaMs) {
    // パーティクル
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // ダメージ数値
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const t = this.damageTexts[i];
      t.y += t.vy;
      t.vy *= 0.95; // 減速
      t.life--;
      t.alpha = Math.max(0, t.life / t.maxLife);
      if (t.life <= 0) this.damageTexts.splice(i, 1);
    }

    // スラッシュ
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= deltaMs;
      s.progress = 1 - Math.max(0, s.life / s.maxLife);
      if (s.life <= 0) this.slashes.splice(i, 1);
    }

    // 投擲物
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.progress += pr.speed;
      pr.curX = pr.fromX + (pr.toX - pr.fromX) * pr.progress;
      pr.curY = pr.fromY + (pr.toY - pr.fromY) * pr.progress;
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

  // 描画（カメラオフセット適用済み座標系）
  render(ctx, cameraOffsetX, cameraOffsetY) {
    ctx.save();
    ctx.translate(-cameraOffsetX, -cameraOffsetY);

    // 1. ビーム描画
    for (const b of this.beams) {
      ctx.save();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 6 * b.alpha;
      ctx.globalAlpha = b.alpha;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      // コアの白い光
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * b.alpha;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. スラッシュ描画
    for (const s of this.slashes) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);

      const startAngle = -Math.PI / 3 + s.progress * (Math.PI / 4);
      const endAngle = Math.PI / 3;

      ctx.beginPath();
      ctx.arc(0, 0, s.radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - s.progress) + ')';
      ctx.lineWidth = 4 * (1 - s.progress);
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }

    // 3. 投擲物
    for (const pr of this.projectiles) {
      ctx.save();
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 6;
      ctx.fillText(pr.icon, pr.curX, pr.curY);
      ctx.restore();
    }

    // 4. パーティクル
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 5. ダメージ数値ポップアップ
    for (const t of this.damageTexts) {
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.font = `bold ${Math.round(18 * t.scale)}px 'Outfit', 'Inter', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = '#05070c';
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;

      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    ctx.restore();
  }
}
