/**
 * プレイヤーキャラクターのステータス・行動・成長システム
 */
import { Entity } from './Entity.js?v=20260924_7';
import { CONFIG } from '../config.js?v=20260924_7';

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, '冒険者');

    // 基本ステータス
    this.maxHp = CONFIG.PLAYER_INIT.MAX_HP;
    this.hp = this.maxHp;
    this.maxHunger = CONFIG.PLAYER_INIT.MAX_HUNGER;
    this.hunger = this.maxHunger;

    this.baseAtk = CONFIG.PLAYER_INIT.BASE_ATK;
    this.baseDef = CONFIG.PLAYER_INIT.BASE_DEF;
    this.atk = this.baseAtk;
    this.def = this.baseDef;

    this.lv = CONFIG.PLAYER_INIT.LV;
    this.exp = CONFIG.PLAYER_INIT.EXP;
    this.gold = CONFIG.PLAYER_INIT.GOLD;

    // ターンカウント・自然回復用
    this.turnCounter = 0;
    this.healStep = 0;
  }

  // 装備を加味した合計攻撃力
  getTotalAtk(inventory) {
    return this.atk + (inventory ? inventory.getEquippedAtkBonus() : 0);
  }

  // 装備を加味した合計防御力
  getTotalDef(inventory) {
    return this.def + (inventory ? inventory.getEquippedDefBonus() : 0);
  }

  // ダメージを受ける
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.triggerDamageAnim();
    return this.hp <= 0;
  }

  // HP回復
  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  // 満腹度回復
  restoreHunger(amount) {
    this.hunger = Math.min(this.maxHunger, this.hunger + amount);
  }

  // ターン進行ごとの処理（満腹度減少、自然回復、空腹ダメージ）
  onTurnEnd() {
    this.turnCounter++;

    // 状態異常の自然治癒
    this.updateStatusEffects();

    // 満腹度の減少 (CONFIG.PLAYER_INIT.HUNGER_RATE ターンで1減少)
    if (this.turnCounter % CONFIG.PLAYER_INIT.HUNGER_RATE === 0) {
      if (this.hunger > 0) {
        this.hunger--;
      }
    }

    // 飢餓ペナルティ
    if (this.hunger <= 0) {
      this.hp = Math.max(0, this.hp - 1);
    } else {
      // 自然HP回復（満腹度がある時のみ、3ターンに1ポイント回復）
      this.healStep++;
      if (this.healStep >= 3) {
        this.healStep = 0;
        if (this.hp < this.maxHp) {
          this.hp++;
        }
      }
    }
  }

  // 経験値獲得とレベルアップ判定
  gainExp(amount, game) {
    this.exp += amount;

    // 一度に大量の経験値を得た場合は複数レベル上がる
    while (this.exp >= this.getNextExp() && this.lv < CONFIG.PLAYER_MAX_LV) {
      this.lv++;
      const hpGain = Math.floor(Math.random() * 3) + 4; // 4~6
      const atkGain = Math.floor(Math.random() * 2) + 1; // 1~2
      this.maxHp += hpGain;
      this.hp = this.maxHp; // レベルアップ時HP全快
      this.baseAtk += atkGain;
      this.atk = this.baseAtk;

      game.sound.playLevelUp();
      game.animations.addLevelUp(this.x, this.y);
      game.addLog(`レベルが ${this.lv} に上がった！ 最大HP+${hpGain}、力+${atkGain}！`, 'level-up');
    }
  }

  getNextExp() {
    return Math.floor(10 * Math.pow(this.lv, 1.8));
  }

  isDead() {
    return this.hp <= 0;
  }
}
