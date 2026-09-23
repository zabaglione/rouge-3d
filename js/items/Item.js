/**
 * アイテムの種別・定義・マスターデータ
 */
export const ITEM_TYPES = {
  WEAPON: 'weapon',
  SHIELD: 'shield',
  FOOD: 'food',
  HERB: 'herb',
  SCROLL: 'scroll',
  STAFF: 'staff',
  ARROW: 'arrow',
  GOLD: 'gold',
};

// アイテムマスターデータ
export const ITEM_DEFINITIONS = [
  // --- 武器 ---
  {
    id: 'wpn_short_sword',
    name: 'ショートソード',
    type: ITEM_TYPES.WEAPON,
    icon: '🗡️',
    power: 4,
    color: '#93c5fd',
    desc: '軽量で扱いやすい標準的な片手剣。攻撃力 +4。',
    minFloor: 1,
  },
  {
    id: 'wpn_broadsword',
    name: 'ブロードソード',
    type: ITEM_TYPES.WEAPON,
    icon: '⚔️',
    power: 8,
    color: '#38bdf8',
    desc: '幅広の頑丈な両刃剣。攻撃力 +8。',
    minFloor: 2,
  },
  {
    id: 'wpn_bastard_sword',
    name: 'バスタードソード',
    type: ITEM_TYPES.WEAPON,
    icon: '🗡️',
    power: 12,
    color: '#60a5fa',
    desc: '重量と斬撃威力を備えた業物の大剣。攻撃力 +12。',
    minFloor: 5,
  },
  {
    id: 'wpn_flamberge',
    name: 'フランベルジェ',
    type: ITEM_TYPES.WEAPON,
    icon: '🔱',
    power: 16,
    color: '#f87171',
    desc: '炎のように波打つ刀身を持つ名剣。攻撃力 +16。',
    minFloor: 8,
  },

  // --- 盾 ---
  {
    id: 'shd_buckler',
    name: 'ウッドバックラー',
    type: ITEM_TYPES.SHIELD,
    icon: '🛡️',
    power: 3,
    color: '#fbbf24',
    desc: '軽量な木製小型盾。軽快で空腹になりにくい。防御力 +3。',
    minFloor: 1,
  },
  {
    id: 'shd_round',
    name: 'ラウンドシールド',
    type: ITEM_TYPES.SHIELD,
    icon: '🛡️',
    power: 6,
    color: '#a3e635',
    desc: '青銅で補強された堅牢な丸盾。防御力 +6。',
    minFloor: 2,
  },
  {
    id: 'shd_kite',
    name: 'カイトシールド',
    type: ITEM_TYPES.SHIELD,
    icon: '🛡️',
    power: 10,
    color: '#94a3b8',
    desc: '重厚な鉄板で作られた騎士の盾。防御力 +10。',
    minFloor: 5,
  },
  {
    id: 'shd_tower',
    name: 'タワーシールド',
    type: ITEM_TYPES.SHIELD,
    icon: '🛡️',
    power: 15,
    color: '#fb7185',
    desc: '全身を強固に守護する巨大な防壁盾。防御力 +15。',
    minFloor: 8,
  },

  // --- 食料 ---
  {
    id: 'food_ration',
    name: '携帯食糧',
    type: ITEM_TYPES.FOOD,
    icon: '🥪',
    hungerRestore: 50,
    color: '#f8fafc',
    desc: '旅慣れた冒険者の保存食。満腹度が50%回復する。',
    minFloor: 1,
  },
  {
    id: 'food_feast',
    name: '豪華な野営食',
    type: ITEM_TYPES.FOOD,
    icon: '🍖',
    hungerRestore: 100,
    color: '#ffffff',
    desc: '栄養満点の滋養ある保存食。満腹度が100%全快する。',
    minFloor: 2,
  },
  {
    id: 'food_bread',
    name: '堅焼きパン',
    type: ITEM_TYPES.FOOD,
    icon: '🍞',
    hungerRestore: 40,
    color: '#d97706',
    desc: 'ローグ伝統の硬質保存食。満腹度が40%回復する。',
    minFloor: 1,
  },

  // --- 秘薬・ポーション ---
  {
    id: 'herb_heal',
    name: 'ヒールポーション',
    type: ITEM_TYPES.HERB,
    icon: '🧪',
    color: '#4ade80',
    desc: '飲むとHPが25回復する。HP満タン時に飲むと最大HPが1アップ。',
    minFloor: 1,
  },
  {
    id: 'herb_high_heal',
    name: 'ハイポーション',
    type: ITEM_TYPES.HERB,
    icon: '🍷',
    color: '#22c55e',
    desc: '飲むとHPが100回復する。HP満タン時に飲むと最大HPが2アップ。投げるとアンデッド・霊体モンスターに大ダメージ！',
    minFloor: 2,
  },
  {
    id: 'herb_speed',
    name: 'ヘイストポーション',
    type: ITEM_TYPES.HERB,
    icon: '⚡',
    color: '#38bdf8',
    desc: '一定ターン倍速（1ターンに2回行動）で動けるようになる。',
    minFloor: 2,
  },
  {
    id: 'herb_fire',
    name: 'フレイムポーション',
    type: ITEM_TYPES.HERB,
    icon: '🔥',
    color: '#ef4444',
    desc: '前方直線上に70ダメージの火炎を放つ！投げても敵に大ダメージ。',
    minFloor: 4,
  },
  {
    id: 'herb_poison_cure',
    name: 'キュアポーション',
    type: ITEM_TYPES.HERB,
    icon: '🍃',
    color: '#86efac',
    desc: '下がった攻撃力を元に戻し、毒を完全浄化する。',
    minFloor: 1,
  },

  // --- 巻物・スクロール ---
  {
    id: 'scr_confusion',
    name: '幻惑のスクロール',
    type: ITEM_TYPES.SCROLL,
    icon: '📜',
    color: '#c084fc',
    desc: '部屋全体のモンスターを激しい混乱状態に陥れる。',
    minFloor: 2,
  },
  {
    id: 'scr_sleep',
    name: '昏睡のスクロール',
    type: ITEM_TYPES.SCROLL,
    icon: '📜',
    color: '#a855f7',
    desc: '部屋全体のモンスターを深い眠りに落として動きを止める。',
    minFloor: 2,
  },
  {
    id: 'scr_light',
    name: '光輝のスクロール',
    type: ITEM_TYPES.SCROLL,
    icon: '📜',
    color: '#fde047',
    desc: 'フロア全体のマップと敵・アイテムの配置が全て明るみに出る。',
    minFloor: 1,
  },
  {
    id: 'scr_warp',
    name: '転移のスクロール',
    type: ITEM_TYPES.SCROLL,
    icon: '📜',
    color: '#67e8f9',
    desc: 'フロアの別の場所へ瞬間移動する。',
    minFloor: 1,
  },
  {
    id: 'scr_upgrade',
    name: '強化のスクロール',
    type: ITEM_TYPES.SCROLL,
    icon: '📜',
    color: '#fbbf24',
    desc: '装備している武器の強化値を+1する。',
    minFloor: 3,
  },

  // --- 杖・ワンド ---
  {
    id: 'stf_blow',
    name: '衝撃波の杖',
    type: ITEM_TYPES.STAFF,
    icon: '🪄',
    uses: 5,
    color: '#a78bfa',
    desc: '正面の対象を10マス吹き飛ばし、5ダメージを与える。',
    minFloor: 2,
  },
  {
    id: 'stf_swap',
    name: '位置転換の杖',
    type: ITEM_TYPES.STAFF,
    icon: '🪄',
    uses: 5,
    color: '#f472b6',
    desc: '正面のモンスターと瞬時に位置を入れ替える。ピンチ脱出の切り札。',
    minFloor: 2,
  },
  {
    id: 'stf_paralyze',
    name: '麻痺封印の杖',
    type: ITEM_TYPES.STAFF,
    icon: '🪄',
    uses: 4,
    color: '#fb923c',
    desc: '正面のモンスターを金縛りにして攻撃されるまで完全に動けなくする。',
    minFloor: 3,
  },
  {
    id: 'stf_thunder',
    name: '雷電の杖',
    type: ITEM_TYPES.STAFF,
    icon: '🪄',
    uses: 5,
    color: '#facc15',
    desc: '直線上に雷撃を放ち、25ダメージを与える。',
    minFloor: 3,
  },

  // --- 矢 ---
  {
    id: 'arr_wood',
    name: '木製の矢',
    type: ITEM_TYPES.ARROW,
    icon: '🏹',
    count: 10,
    power: 6,
    color: '#ca8a04',
    desc: '遠くの敵を狙撃できる木製の矢。',
    minFloor: 1,
  },
  {
    id: 'arr_iron',
    name: '鋼鉄の矢',
    type: ITEM_TYPES.ARROW,
    icon: '🏹',
    count: 8,
    power: 12,
    color: '#94a3b8',
    desc: '鋭利な鋼鉄の矢。強力な狙撃ダメージを与える。',
    minFloor: 3,
  },
];

export class Item {
  constructor(def, extra = {}) {
    this.id = def.id;
    this.name = def.name;
    this.type = def.type;
    this.icon = def.icon;
    this.desc = def.desc;
    this.color = def.color;
    this.power = def.power || 0;
    this.hungerRestore = def.hungerRestore || 0;
    this.uses = def.uses !== undefined ? def.uses : extra.uses;
    this.count = def.count !== undefined ? def.count : (extra.count || 1);
    this.plus = extra.plus || 0; // +1, +2 強化値
    
    // ダンジョンマップ上にある場合の座標
    this.x = extra.x || 0;
    this.y = extra.y || 0;
  }

  // 表示名（強化値や使用回数・個数付き）
  getDisplayName() {
    let name = this.name;
    if (this.plus > 0) name += `+${this.plus}`;
    else if (this.plus < 0) name += `${this.plus}`;

    if (this.type === ITEM_TYPES.STAFF && this.uses !== undefined) {
      name += ` [${this.uses}]`;
    }
    if (this.type === ITEM_TYPES.ARROW && this.count > 1) {
      name += ` (${this.count}本)`;
    }
    return name;
  }

  static createFromDef(defId, extra = {}) {
    const def = ITEM_DEFINITIONS.find(d => d.id === defId);
    if (!def) return null;
    return new Item(def, extra);
  }

  static getRandomItem(floorNumber = 1) {
    const candidates = ITEM_DEFINITIONS.filter(d => (d.minFloor || 1) <= floorNumber);
    const def = candidates[Math.floor(Math.random() * candidates.length)];
    return new Item(def);
  }
}
