/**
 * プレイヤーのインベントリ（持ち物袋）管理システム
 */
import { ITEM_TYPES } from './Item.js?v=20260924_6';

export class Inventory {
  constructor(capacity = 20) {
    this.capacity = capacity;
    this.items = []; // 所持アイテム配列
    this.equippedWeapon = null; // 装備中の武器
    this.equippedShield = null; // 装備中の盾
  }

  isFull() {
    return this.items.length >= this.capacity;
  }

  addItem(item) {
    // 矢などのスタック可能アイテムの統合チェック
    if (item.type === ITEM_TYPES.ARROW) {
      const existing = this.items.find(i => i.id === item.id);
      if (existing) {
        existing.count += item.count;
        return { success: true, item: existing, stacked: true };
      }
    }

    if (this.isFull()) {
      return { success: false, reason: 'これ以上持ち物を持てない！' };
    }

    this.items.push(item);
    return { success: true, item: item, stacked: false };
  }

  removeItem(item) {
    const index = this.items.indexOf(item);
    if (index === -1) return false;

    // 装備中のアイテムなら外す
    if (this.equippedWeapon === item) this.equippedWeapon = null;
    if (this.equippedShield === item) this.equippedShield = null;

    this.items.splice(index, 1);
    return true;
  }

  isEquipped(item) {
    return this.equippedWeapon === item || this.equippedShield === item;
  }

  equip(item) {
    if (item.type === ITEM_TYPES.WEAPON) {
      if (this.equippedWeapon === item) {
        this.equippedWeapon = null;
        return { equipped: false, type: 'weapon' };
      } else {
        this.equippedWeapon = item;
        return { equipped: true, type: 'weapon' };
      }
    }
    if (item.type === ITEM_TYPES.SHIELD) {
      if (this.equippedShield === item) {
        this.equippedShield = null;
        return { equipped: false, type: 'shield' };
      } else {
        this.equippedShield = item;
        return { equipped: true, type: 'shield' };
      }
    }
    return { equipped: false };
  }

  // 装備による補正合計
  getEquippedAtkBonus() {
    if (!this.equippedWeapon) return 0;
    return this.equippedWeapon.power + (this.equippedWeapon.plus || 0);
  }

  getEquippedDefBonus() {
    if (!this.equippedShield) return 0;
    return this.equippedShield.power + (this.equippedShield.plus || 0);
  }

  // アイテムごとに実行可能なSFC風コマンドリストを返す
  getAvailableCommands(item) {
    const cmds = [];

    switch (item.type) {
      case ITEM_TYPES.WEAPON:
      case ITEM_TYPES.SHIELD:
        cmds.push(this.isEquipped(item) ? { id: 'unequip', label: '外す' } : { id: 'equip', label: '装備する' });
        break;
      case ITEM_TYPES.FOOD:
        cmds.push({ id: 'eat', label: '食べる' });
        break;
      case ITEM_TYPES.HERB:
        cmds.push({ id: 'drink', label: '飲む' });
        break;
      case ITEM_TYPES.SCROLL:
        cmds.push({ id: 'read', label: '読む' });
        break;
      case ITEM_TYPES.STAFF:
        cmds.push({ id: 'wave', label: '振る' });
        break;
      case ITEM_TYPES.ARROW:
        cmds.push({ id: 'shoot', label: '撃つ' });
        break;
    }

    // 共通コマンド
    cmds.push({ id: 'throw', label: '投げる' });
    cmds.push({ id: 'drop', label: '置く' });
    cmds.push({ id: 'info', label: '説明' });

    return cmds;
  }
}
