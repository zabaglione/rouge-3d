/**
 * キャラクター・モンスターの共通基底エンティティ
 */
import { CONFIG } from '../config.js?v=20260925_05';
import { fxClock } from '../engine/FxClock.js?v=20260925_05';

// 攻撃の踏み込み・被弾ののけぞりモーションの長さ (ms)
export const ATTACK_ANIM_MS = 160;
export const DAMAGE_ANIM_MS = 220;

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
    // 攻撃した回数（そのターンに攻撃したかの判定に使う）
    this.attackSeq = 0;
    // 最後に攻撃してきた相手のいる向き
    this.hitFromDir = null;

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
    // 60fps で1フレーム 28% 近づく速さ（経過時間に比例させ、スローモーションにも対応）
    const speed = 1 - Math.exp(-0.0197 * deltaMs);
    this.renderX += (this.targetRenderX - this.renderX) * speed;
    this.renderY += (this.targetRenderY - this.renderY) * speed;

    if (Math.abs(this.targetRenderX - this.renderX) < 0.5) this.renderX = this.targetRenderX;
    if (Math.abs(this.targetRenderY - this.renderY) < 0.5) this.renderY = this.targetRenderY;

    if (this.attackAnimTimer > 0) this.attackAnimTimer -= deltaMs;
    if (this.damageAnimTimer > 0) this.damageAnimTimer -= deltaMs;
  }

  // 演出の順番待ち中なら、自分の番が来てから動く
  triggerAttackAnim() {
    this.attackSeq++;
    fxClock.run(() => { this.attackAnimTimer = ATTACK_ANIM_MS; });
  }

  // 攻撃してきた相手の向きを覚える（のけぞる方向に使う）
  setHitFrom(attacker) {
    const dir = { dx: Math.sign(attacker.x - this.x), dy: Math.sign(attacker.y - this.y) };
    fxClock.run(() => { this.hitFromDir = dir; });
  }

  triggerDamageAnim() {
    fxClock.run(() => { this.damageAnimTimer = DAMAGE_ANIM_MS; });
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
