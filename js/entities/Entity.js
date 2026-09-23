/**
 * キャラクター・モンスターの共通基底エンティティ
 */
import { CONFIG } from '../config.js?v=20260924_7';

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
      paralyzed: 0, // 残りターン数（Infinity は攻撃を受けるまで解けない金縛り）
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

  // 瞬間移動（ワープ）：描画座標も即座に移す（補間させると旧位置に残って見える）
  warpTo(newX, newY) {
    this.moveTo(newX, newY);
    this.renderX = this.targetRenderX;
    this.renderY = this.targetRenderY;
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
    if (this.statusEffects.paralyzed > 0) this.statusEffects.paralyzed--;
  }

  canAct() {
    return this.statusEffects.sleep <= 0 && this.statusEffects.paralyzed <= 0;
  }
}
