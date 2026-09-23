/**
 * キャラクター・モンスターの共通基底エンティティ
 */
import { CONFIG } from '../config.js';

export class Entity {
  constructor(x, y, name) {
    this.x = x;
    this.y = y;
    this.name = name;

    // スムーズ移動補間用の描画座標
    this.renderX = x * CONFIG.TILE_SIZE;
    this.renderY = y * CONFIG.TILE_SIZE;
    this.targetRenderX = this.renderX;
    this.targetRenderY = this.renderY;

    // 現在向いている方向 (初期値: DOWN)
    this.facing = CONFIG.DIRECTIONS[4];

    // 攻撃・被弾アニメーションタイマー
    this.attackAnimTimer = 0;
    this.damageAnimTimer = 0;

    // 状態異常 (ターン数でデクリメント)
    this.statusEffects = {
      sleep: 0,
      confused: 0,
      paralyzed: false,
      speed: 0,
      poison: 0,
    };
  }

  // グリッド座標を更新し、描画補間ターゲットを設定
  moveTo(newX, newY) {
    this.x = newX;
    this.y = newY;
    this.targetRenderX = newX * CONFIG.TILE_SIZE;
    this.targetRenderY = newY * CONFIG.TILE_SIZE;
  }

  // 相対移動
  move(dx, dy) {
    this.moveTo(this.x + dx, this.y + dy);
  }

  // 描画座標のスムーズ補間（毎フレーム呼び出し）
  updateRenderPos(deltaMs) {
    const speed = 0.28; // 補間係数
    this.renderX += (this.targetRenderX - this.renderX) * speed;
    this.renderY += (this.targetRenderY - this.renderY) * speed;

    if (Math.abs(this.targetRenderX - this.renderX) < 0.5) this.renderX = this.targetRenderX;
    if (Math.abs(this.targetRenderY - this.renderY) < 0.5) this.renderY = this.targetRenderY;

    if (this.attackAnimTimer > 0) this.attackAnimTimer -= deltaMs;
    if (this.damageAnimTimer > 0) this.damageAnimTimer -= deltaMs;
  }

  triggerAttackAnim() {
    this.attackAnimTimer = 160;
  }

  triggerDamageAnim() {
    this.damageAnimTimer = 220;
  }

  // ターン終了時に状態異常を減衰
  updateStatusEffects() {
    if (this.statusEffects.sleep > 0) this.statusEffects.sleep--;
    if (this.statusEffects.confused > 0) this.statusEffects.confused--;
    if (this.statusEffects.speed > 0) this.statusEffects.speed--;
    if (this.statusEffects.poison > 0) this.statusEffects.poison--;
  }

  canAct() {
    return this.statusEffects.sleep <= 0 && !this.statusEffects.paralyzed;
  }
}
