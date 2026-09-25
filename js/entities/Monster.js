/**
 * モンスターの定義、出現テーブル、AI行動ロジック（全24種・オリジナルローグ級）
 */
import { Entity } from './Entity.js?v=20260925_03';
import { CONFIG } from '../config.js?v=20260925_03';
import { Item } from '../items/Item.js?v=20260925_03';
import { fxClock } from '../engine/FxClock.js?v=20260925_03';
import { projectileFlightMs } from '../engine/Animation.js?v=20260925_03';

export const MONSTER_DEFINITIONS = [
  // --- 浅層 (B1〜B4) ---
  {
    id: 'slime',
    name: 'グリーンスライム',
    icon: '🟢',
    color: '#34d399',
    hp: 8,
    atk: 3,
    def: 1,
    exp: 4,
    speed: 1,
    minFloor: 1,
    maxFloor: 3,
    desc: '迷宮の湿地に群生する緑色の不定形生物。',
  },
  {
    id: 'horned_rabbit',
    name: 'ホーンラビット',
    icon: '🐇',
    color: '#fbbf24',
    hp: 12,
    atk: 5,
    def: 2,
    exp: 6,
    speed: 1,
    minFloor: 1,
    maxFloor: 4,
    desc: '迷宮の浅層を跳ね回る、鋭い角を持つ野生のウサギ。',
  },
  {
    id: 'cave_bat',
    name: 'ケイブバット',
    icon: '🦇',
    color: '#94a3b8',
    hp: 10,
    atk: 4,
    def: 1,
    exp: 5,
    speed: 1,
    isErratic: true, // 不規則なジグザグ移動
    minFloor: 1,
    maxFloor: 4,
    desc: '天井から急降下してジグザグに飛び回る大蝙蝠。',
  },
  {
    id: 'giant_ant',
    name: 'ジャイアントアント',
    icon: '🐜',
    color: '#ef4444',
    hp: 16,
    atk: 6,
    def: 3,
    exp: 8,
    speed: 1,
    minFloor: 2,
    maxFloor: 5,
    desc: '強固な大顎を持つ巨大蟻。素早く接近してくる。',
  },
  {
    id: 'kobold',
    name: 'コボルト',
    icon: '🐺',
    color: '#e2e8f0',
    hp: 20,
    atk: 8,
    def: 3,
    exp: 12,
    speed: 1,
    minFloor: 2,
    maxFloor: 6,
    desc: '鋭い爪と牙を持つ犬頭の小鬼。',
  },
  {
    id: 'skeleton_archer',
    name: 'スケルトン射手',
    icon: '🏹',
    color: '#10b981',
    hp: 18,
    atk: 9,
    def: 2,
    exp: 16,
    speed: 1,
    isRanged: true,
    minFloor: 3,
    maxFloor: 8,
    desc: '離れた位置から骨の弓矢で狙撃してくる不死の射手。',
  },

  // --- 中層前半 (B4〜B8) ---
  {
    id: 'phantom',
    name: 'ファントム',
    icon: '👻',
    color: '#a78bfa',
    hp: 24,
    atk: 11,
    def: 4,
    exp: 25,
    speed: 1,
    canPassWalls: true, // 壁抜け！
    minFloor: 4,
    maxFloor: 10,
    desc: '壁をすり抜けて最短距離で迫り来る浮遊霊。',
  },
  {
    id: 'rust_monster',
    name: 'ラストモンスター',
    icon: '🦀',
    color: '#ca8a04',
    hp: 28,
    atk: 10,
    def: 6,
    exp: 32,
    speed: 1,
    isRust: true, // 武具腐食
    minFloor: 5,
    maxFloor: 11,
    desc: '金属を腐食させる酸を分泌する甲殻魔獣。盾や武器の強化値を腐食させる。',
  },
  {
    id: 'orc',
    name: 'オーク戦士',
    icon: '🐗',
    color: '#f97316',
    hp: 36,
    atk: 14,
    def: 6,
    exp: 40,
    speed: 1,
    minFloor: 5,
    maxFloor: 12,
    desc: '強靭な肉体と高い攻撃力を誇る巨躯の狂戦士。',
  },
  {
    id: 'leprechaun',
    name: 'レプラコーン',
    icon: '👺',
    color: '#fbbf24',
    hp: 22,
    atk: 7,
    def: 4,
    exp: 35,
    speed: 1,
    isGoldThief: true, // ゴールド強奪＆ワープ
    minFloor: 5,
    maxFloor: 12,
    desc: '冒険者の金貨を素早くかすめ取り、瞬時にワープして逃げ去る小鬼。',
  },
  {
    id: 'nymph',
    name: 'ニンフ',
    icon: '🧚',
    color: '#ec4899',
    hp: 26,
    atk: 8,
    def: 5,
    exp: 42,
    speed: 1,
    isItemThief: true, // アイテム盗み＆ワープ
    minFloor: 6,
    maxFloor: 13,
    desc: '持ち物袋から貴重なアイテムを1つ盗んでワープ逃走する森の妖精。',
  },

  // --- 中層後半 (B7〜B12) ---
  {
    id: 'wraith',
    name: 'レイス',
    icon: '💀',
    color: '#64748b',
    hp: 32,
    atk: 15,
    def: 6,
    exp: 55,
    speed: 1,
    isEnergyDrain: true, // 経験値ドレイン
    minFloor: 7,
    maxFloor: 14,
    desc: '生命力を冷酷に吸い取り、経験値を減衰させる忌まわしき亡霊。',
  },
  {
    id: 'mimic',
    name: 'ミミック',
    icon: '📦',
    color: '#d97706',
    hp: 45,
    atk: 18,
    def: 8,
    exp: 60,
    speed: 1,
    isMimic: true, // 宝箱擬態
    minFloor: 7,
    maxFloor: 14,
    desc: '宝箱に擬態して獲物を待つ魔物。近づくと牙を剥いて奇襲してくる。',
  },
  {
    id: 'shadow_stalker',
    name: 'シャドウストーカー',
    icon: '🥷',
    color: '#c084fc',
    hp: 34,
    atk: 16,
    def: 5,
    exp: 65,
    speed: 2, // 倍速行動！
    minFloor: 7,
    maxFloor: 16,
    desc: '俊敏な動きで1ターンに2回連続行動する影の暗殺者。',
  },
  {
    id: 'gargoyle',
    name: 'ガーゴイル',
    icon: '🗿',
    color: '#94a3b8',
    hp: 48,
    atk: 17,
    def: 14,
    exp: 75,
    speed: 1,
    minFloor: 8,
    maxFloor: 15,
    desc: '石像のように硬い外皮を持ち、生半可な攻撃を弾き返す魔獣。',
  },

  // --- 深層前半 (B9〜B15) ---
  {
    id: 'troll',
    name: 'トロール',
    icon: '👹',
    color: '#84cc16',
    hp: 60,
    atk: 20,
    def: 8,
    exp: 90,
    speed: 1,
    isRegen: true, // 毎ターンHP自然回復
    minFloor: 9,
    maxFloor: 17,
    desc: '怪力と驚異的な自己治癒能力を持ち、毎ターンHPを回復する巨人。',
  },
  {
    id: 'vampire',
    name: 'ヴァンパイア',
    icon: '🧛',
    color: '#f43f5e',
    hp: 52,
    atk: 22,
    def: 9,
    exp: 110,
    speed: 1,
    isLifeDrain: true, // HP吸収
    minFloor: 10,
    maxFloor: 18,
    desc: '鋭い牙で冒険者の生き血を吸い、与えたダメージに応じて自己修復する吸血鬼。',
  },
  {
    id: 'hydra',
    name: 'ヒドラ',
    icon: '🐍',
    color: '#10b981',
    hp: 70,
    atk: 24,
    def: 10,
    exp: 130,
    speed: 1,
    isPoison: true, // 猛毒噛みつき
    minFloor: 11,
    maxFloor: 18,
    desc: '無数の首を持つ大蛇。猛毒の一撃で冒険者の攻撃力を奪い去る。',
  },
  {
    id: 'medusa',
    name: 'メドゥーサ',
    icon: '🧝‍♀️',
    color: '#a855f7',
    hp: 55,
    atk: 21,
    def: 11,
    exp: 145,
    speed: 1,
    isGaze: true, // 石化・麻痺の邪眼
    minFloor: 12,
    maxFloor: 19,
    desc: '蛇の髪を持つ魔女。直線上に立つ者の体を麻痺させる石化の視線を放つ。',
  },

  // --- 最深層 (B13〜B20) ---
  {
    id: 'dragon',
    name: 'レッドドラゴン',
    icon: '🐉',
    color: '#ef4444',
    hp: 85,
    atk: 28,
    def: 14,
    exp: 180,
    speed: 1,
    isBreath: true, // 直線火炎ブレス
    minFloor: 13,
    maxFloor: 20,
    desc: '深層に君臨する巨大竜。直線上に強力な灼熱火炎ブレスを放射する。',
  },
  {
    id: 'ice_monster',
    name: 'アイスゴーレム',
    icon: '🧊',
    color: '#38bdf8',
    hp: 75,
    atk: 25,
    def: 15,
    exp: 170,
    speed: 1,
    isFreeze: true, // 氷結凍結
    minFloor: 14,
    maxFloor: 20,
    desc: '絶対零度の氷で出来た巨兵。冷気を帯びた拳で冒険者を凍結させる。',
  },
  {
    id: 'beholder',
    name: 'ビホルダー',
    icon: '👁️',
    color: '#f59e0b',
    hp: 65,
    atk: 23,
    def: 12,
    exp: 190,
    speed: 1,
    isBeholderRays: true, // 多彩な怪光線
    minFloor: 15,
    maxFloor: 20,
    desc: '空中に浮かぶ巨大な一つ目と触手眼球。混乱や眠りを誘う怪光線を照射する。',
  },
  {
    id: 'lich',
    name: 'エルダーリッチ',
    icon: '🧙‍♂️',
    color: '#e0e7ff',
    hp: 80,
    atk: 26,
    def: 13,
    exp: 220,
    speed: 1,
    isSummoner: true, // 死霊召喚
    minFloor: 16,
    maxFloor: 20,
    desc: '死してなお強大な魔力を誇る不死の高位魔導士。アンデッドの従者を召喚する。',
  },
  {
    id: 'arch_demon',
    name: 'グレーターデーモン',
    icon: '👿',
    color: '#7f1d1d',
    hp: 120,
    atk: 34,
    def: 16,
    exp: 300,
    speed: 2, // 倍速＆テレポート
    isTeleportAtk: true,
    minFloor: 17,
    maxFloor: 20,
    desc: '最深層の冥府を統べる大悪魔。倍速行動と瞬間転移奇襲で冒険者を粉砕する。',
  },
  {
    id: 'minotaur',
    name: 'ミノタウロス',
    icon: '🐂',
    color: '#a16207',
    hp: 110,
    atk: 30,
    def: 14,
    exp: 280,
    speed: 1,
    minFloor: 99, // 通常は出現しない（迷路の階にだけ置かれる）
    maxFloor: 99,
    desc: '迷路の奥をさまよう牛頭の巨人。迷い込んだ者を角と拳で叩き潰す。',
  },
];

export class Monster extends Entity {
  constructor(def, x, y) {
    super(x, y, def.name);
    this.defId = def.id;
    this.icon = def.icon;
    this.color = def.color;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.atk = def.atk;
    this.def = def.def;
    this.exp = def.exp;
    this.speed = def.speed || 1;

    // 特殊能力フラグ群
    this.isErratic = !!def.isErratic;
    this.isRanged = !!def.isRanged;
    this.canPassWalls = !!def.canPassWalls;
    this.isBreath = !!def.isBreath;
    this.isRust = !!def.isRust;
    this.isGoldThief = !!def.isGoldThief;
    this.isItemThief = !!def.isItemThief;
    this.isEnergyDrain = !!def.isEnergyDrain;
    this.isMimic = !!def.isMimic;
    this.isRegen = !!def.isRegen;
    this.isLifeDrain = !!def.isLifeDrain;
    this.isPoison = !!def.isPoison;
    this.isGaze = !!def.isGaze;
    this.isFreeze = !!def.isFreeze;
    this.isBeholderRays = !!def.isBeholderRays;
    this.isSummoner = !!def.isSummoner;
    this.isTeleportAtk = !!def.isTeleportAtk;

    // 強奪データ保存用
    this.stolenGold = 0;
    this.stolenItem = null;

    this.isAlert = false; // プレイヤーを認識しているか
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.triggerDamageAnim();
    // 攻撃されたら目覚める / 金縛り解除 / 擬態解除
    this.statusEffects.sleep = 0;
    this.statusEffects.paralyzed = 0;
    this.isAlert = true;
    if (this.isMimic) {
      this.isMimic = false;
    }
    return this.hp <= 0;
  }

  isDead() {
    return this.hp <= 0;
  }

  // 1アクション実行（AI思考）
  takeAction(game) {
    if (!this.canAct()) return;

    // トロールのHP再生
    if (this.isRegen && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 3);
    }

    // 混乱状態の挙動（ランダム移動または攻撃）
    if (this.statusEffects.confused > 0) {
      const randDir = CONFIG.DIRECTIONS[Math.floor(Math.random() * CONFIG.DIRECTIONS.length)];
      this.stepOrAttack(randDir, game);
      return;
    }

    const player = game.player;
    const dist = Math.max(Math.abs(player.x - this.x), Math.abs(player.y - this.y));

    // 視界・認識チェック
    const myRoom = game.map.getRoomAt(this.x, this.y);
    const playerRoom = game.map.getRoomAt(player.x, player.y);
    const inSameRoom = myRoom && playerRoom && myRoom === playerRoom && myRoom.lit !== false;
    const hasLOS = game.map.hasLineOfSight(this.x, this.y, player.x, player.y);

    if (inSameRoom || (hasLOS && dist <= 7)) {
      this.isAlert = true;
      if (this.isMimic && dist <= 2) {
        this.isMimic = false;
        game.addLog(`宝箱が突如牙を剥いた！ ミミックが現れた！`, 'danger');
      }
    }

    // 擬態中のミミックはその場から動かない
    if (this.isMimic) return;

    // 1. プレイヤーに隣接している場合：近接攻撃（壁の角越しには攻撃できない）
    if (dist === 1 && this.canStepTo(player.x, player.y, game)) {
      this.attackPlayer(player, game);
      return;
    }

    // 2. 特殊遠隔能力判定（直線上で視線が通り、間に他のモンスターがいない場合）
    const isStraightLine = (this.x === player.x || this.y === player.y) && !this.isShotBlockedByMonster(player, game);

    // レッドドラゴンの火炎ブレス
    if (this.isBreath && isStraightLine && hasLOS && dist <= 8) {
      if (Math.random() < 0.6) {
        this.breatheFire(player, game);
        return;
      }
    }

    // スケルトン射手の矢射撃
    if (this.isRanged && isStraightLine && hasLOS && dist <= 6) {
      if (Math.random() < 0.75) {
        this.shootRanged(player, game);
        return;
      }
    }

    // メドゥーサの石化・麻痺の邪眼
    if (this.isGaze && isStraightLine && hasLOS && dist <= 5) {
      if (Math.random() < 0.4) {
        this.castMedusaGaze(player, game);
        return;
      }
    }

    // ビホルダーの怪光線
    if (this.isBeholderRays && isStraightLine && hasLOS && dist <= 6) {
      if (Math.random() < 0.5) {
        this.castBeholderRay(player, game);
        return;
      }
    }

    // エルダーリッチの死霊召喚
    if (this.isSummoner && dist >= 2 && dist <= 7 && game.monsters.length < 16) {
      if (Math.random() < 0.35) {
        this.summonUndead(game);
        return;
      }
    }

    // グレーターデーモンのテレポート奇襲
    if (this.isTeleportAtk && dist >= 3 && dist <= 8) {
      if (Math.random() < 0.3) {
        this.teleportNearPlayer(player, game);
        return;
      }
    }

    // 3. 移動思考（追跡または徘徊）
    if (this.isAlert) {
      // ケイブバットの不規則移動
      if (this.isErratic && Math.random() < 0.3) {
        const randDir = CONFIG.DIRECTIONS[Math.floor(Math.random() * CONFIG.DIRECTIONS.length)];
        this.stepOrAttack(randDir, game);
        return;
      }
      this.chasePlayer(player, game);
    } else {
      this.wander(game);
    }
  }

  // 近接攻撃（特殊付加効果を含む）
  attackPlayer(player, game) {
    this.triggerAttackAnim();
    player.setHitFrom(this);
    game.sound.playMonsterAttack(this.defId);
    game.sound.playPlayerDamage();

    // 防御計算
    const playerDef = player.getTotalDef(game.inventory);
    const rawDmg = Math.max(1, this.atk - Math.floor(playerDef * 0.7));
    const variation = Math.floor(Math.random() * 3) - 1; // -1~+1
    const dmg = Math.max(1, rawDmg + variation);

    player.takeDamage(dmg);
    game.animations.addDamageNumber(player.x, player.y, dmg, '#ef4444');
    game.addLog(`${this.name}の攻撃！ ${dmg}のダメージを受けた！`, 'danger');

    // 吸血（ライフドレイン）
    if (this.isLifeDrain) {
      const healAmount = Math.max(1, Math.floor(dmg * 0.5));
      this.hp = Math.min(this.maxHp, this.hp + healAmount);
      game.addLog(`${this.name}は生き血を啜り、HPを ${healAmount} 回復した！`, 'danger');
    }

    // 腐食（ラストモンスター）
    if (this.isRust && Math.random() < 0.5) {
      const shd = game.inventory.equippedShield;
      const wpn = game.inventory.equippedWeapon;
      if (shd && (shd.plus || 0) > -3) {
        shd.plus = (shd.plus || 0) - 1;
        game.sound.playPlayerDamage();
        game.addLog(`${this.name}の酸が盾を溶かした！ 【${shd.name}】がサビてしまった！ (${shd.plus})`, 'warning');
      } else if (wpn && (wpn.plus || 0) > -3) {
        wpn.plus = (wpn.plus || 0) - 1;
        game.sound.playPlayerDamage();
        game.addLog(`${this.name}の酸が武器を侵食した！ 【${wpn.name}】の強度が下がった！ (${wpn.plus})`, 'warning');
      }
    }

    // ゴールド強奪（レプラコーン）
    if (this.isGoldThief && player.gold > 0 && this.stolenGold === 0) {
      const steal = Math.min(player.gold, Math.floor(Math.random() * 50) + 20);
      player.gold -= steal;
      this.stolenGold = steal;
      game.sound.playPickup();
      game.addLog(`${this.name}は所持金から ${steal} G を奪い取り、煙のようにワープした！`, 'warning');
      this.teleportAway(game);
      return;
    }

    // アイテム盗み（ニンフ）
    if (this.isItemThief && !this.stolenItem) {
      const unequipped = game.inventory.items.filter(it => !game.inventory.isEquipped(it));
      if (unequipped.length > 0) {
        const stolen = unequipped[Math.floor(Math.random() * unequipped.length)];
        game.inventory.removeItem(stolen);
        this.stolenItem = stolen;
        game.sound.playPickup();
        game.addLog(`${this.name}は持ち物袋から【${stolen.name}】を盗み出し、ワープした！`, 'danger');
        this.teleportAway(game);
        return;
      }
    }

    // エナジードレイン（レイス）
    if (this.isEnergyDrain && player.exp > 0) {
      const drain = Math.min(player.exp, 10);
      player.exp -= drain;
      game.addLog(`${this.name}が魂のエネルギーを吸い取った！ （EXP -${drain}）`, 'warning');
    }

    // 猛毒（ヒドラ）
    if (this.isPoison && Math.random() < 0.4) {
      player.atk = Math.max(2, player.atk - 1);
      player.statusEffects.poison = 1;
      game.addLog(`ヒドラの猛毒が体に回り、攻撃力が 1 低下した！`, 'danger');
    }

    // 氷結（アイスゴーレム）
    if (this.isFreeze && Math.random() < 0.3) {
      player.statusEffects.paralyzed = 1;
      game.addLog(`アイスゴーレムの冷気が体を凍結させ、1ターン動けなくなった！`, 'danger');
    }
  }

  // ドラゴンの火炎ブレス
  breatheFire(player, game) {
    this.triggerAttackAnim();
    player.setHitFrom(this);
    game.sound.playMagic();
    game.animations.addBeam(this.x, this.y, player.x, player.y, '#ef4444');

    const dmg = 30;
    player.takeDamage(dmg);
    game.animations.addDamageNumber(player.x, player.y, dmg, '#ef4444');
    game.addLog(`${this.name}が灼熱の火炎ブレスを放射した！ ${dmg}のダメージ！`, 'danger');
  }

  // スケルトン射手の狙撃
  shootRanged(player, game) {
    this.triggerAttackAnim();
    player.setHitFrom(this);
    game.sound.playThrow();
    game.animations.addProjectile(this.x, this.y, player.x, player.y, '🏹');

    // 命中の演出は矢が届いた瞬間に合わせる
    const prevDelay = fxClock.delayMs;
    fxClock.delayMs = prevDelay + projectileFlightMs(this.x, this.y, player.x, player.y);
    try {
      const dmg = Math.max(1, this.atk - Math.floor(player.getTotalDef(game.inventory) * 0.5));
      game.sound.playArrowHit();
      player.takeDamage(dmg);
      game.animations.addDamageNumber(player.x, player.y, dmg, '#ef4444');
      game.addLog(`${this.name}の放った骨の矢が命中！ ${dmg}のダメージ！`, 'danger');
    } finally {
      fxClock.delayMs = prevDelay;
    }
  }

  // メドゥーサの石化視線
  castMedusaGaze(player, game) {
    this.triggerAttackAnim();
    game.sound.playMagic();
    game.animations.addBeam(this.x, this.y, player.x, player.y, '#a855f7');
    player.statusEffects.confused = 6;
    game.addLog(`メドゥーサの邪眼が妖しく光った！ 視線に捕らわれ激しく混乱した！`, 'danger');
  }

  // ビホルダーの怪光線
  castBeholderRay(player, game) {
    this.triggerAttackAnim();
    player.setHitFrom(this);
    game.sound.playMagic();
    const rayType = Math.random();
    if (rayType < 0.35) {
      game.animations.addBeam(this.x, this.y, player.x, player.y, '#a855f7');
      player.statusEffects.sleep = 6;
      game.addLog(`ビホルダーの催眠光線！ 深い眠りに落とされた！`, 'danger');
    } else if (rayType < 0.7) {
      game.animations.addBeam(this.x, this.y, player.x, player.y, '#fbbf24');
      player.statusEffects.confused = 8;
      game.addLog(`ビホルダーの混乱光線！ 頭が激しく混乱した！`, 'danger');
    } else {
      game.animations.addBeam(this.x, this.y, player.x, player.y, '#ef4444');
      const dmg = 22;
      player.takeDamage(dmg);
      game.animations.addDamageNumber(player.x, player.y, dmg, '#ef4444');
      game.addLog(`ビホルダーの破壊光線が直撃！ ${dmg}のダメージ！`, 'danger');
    }
  }

  // エルダーリッチの死霊召喚
  summonUndead(game) {
    this.triggerAttackAnim();
    game.sound.playMagic();
    const adjacent = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
      { dx: 1, dy: -1 }, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }
    ];
    for (const d of adjacent) {
      const nx = this.x + d.dx;
      const ny = this.y + d.dy;
      if (game.map.isWalkable(nx, ny) && !game.getMonsterAt(nx, ny) && !(game.player.x === nx && game.player.y === ny)) {
        const undeadDef = MONSTER_DEFINITIONS.find(m => m.id === 'phantom') || MONSTER_DEFINITIONS[0];
        const minion = new Monster(undeadDef, nx, ny);
        minion.isAlert = true;
        game.monsters.push(minion);
        game.animations.addDamageNumber(nx, ny, 'SUMMON!', '#a78bfa');
        game.addLog(`エルダーリッチが死霊の呪文を唱え、ファントムを召喚した！`, 'danger');
        break;
      }
    }
  }

  // プレイヤー近傍へのテレポート（グレーターデーモン）
  teleportNearPlayer(player, game) {
    const adjacent = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
    ];
    for (const d of adjacent) {
      const nx = player.x + d.dx;
      const ny = player.y + d.dy;
      if (game.isTileFree(nx, ny)) {
        this.warpTo(nx, ny);
        game.sound.playMagic();
        game.addLog(`${this.name}が次元の裂け目から背後に現れた！`, 'danger');
        break;
      }
    }
  }

  // 逃走ワープ（レプラコーン、ニンフ）
  teleportAway(game) {
    const p = game.findRandomFreeTile();
    if (p) {
      this.warpTo(p.x, p.y);
      this.isAlert = false;
    }
  }

  // プレイヤー追跡（最短経路または障害物迂回）
  chasePlayer(player, game) {
    // 経路探索：プレイヤーまでの歩数が減る方向へ進む（うねった通路や扉の向こうでも追ってくる）
    if (!this.canPassWalls && game.distField) {
      const map = game.map;
      const W = map.width;
      let bestD = game.distField[this.y * W + this.x];
      let best = null;
      for (const dir of CONFIG.DIRECTIONS) {
        const nx = this.x + dir.dx, ny = this.y + dir.dy;
        const d = game.distField[ny * W + nx];
        if (!(d < bestD)) continue;
        const door = map.getDoor(nx, ny);
        if (door && door.state === 'closed' && !dir.isDiagonal) {
          best = { dir, openDoor: door };
          bestD = d;
          continue;
        }
        if (!this.canStepTo(nx, ny, game) || game.getMonsterAt(nx, ny)) continue;
        if (nx === player.x && ny === player.y) continue;
        best = { dir };
        bestD = d;
      }
      if (best && best.openDoor) {
        // 閉じた扉を開ける（このターンは移動しない）
        best.openDoor.state = 'open';
        if (map.visible[best.openDoor.y] && map.visible[best.openDoor.y][best.openDoor.x]) {
          game.sound.playDoor(true);
          game.addLog('扉が開いた。', 'warning');
        }
        return;
      }
      if (best) {
        this.move(best.dir.dx, best.dir.dy);
        return;
      }
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;

    const stepX = dx !== 0 ? Math.sign(dx) : 0;
    const stepY = dy !== 0 ? Math.sign(dy) : 0;

    // 斜め・直線移動候補の決定
    const candidates = [];
    if (stepX !== 0 && stepY !== 0) {
      candidates.push({ dx: stepX, dy: stepY });
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (stepX !== 0) candidates.push({ dx: stepX, dy: 0 });
      if (stepY !== 0) candidates.push({ dx: 0, dy: stepY });
    } else {
      if (stepY !== 0) candidates.push({ dx: 0, dy: stepY });
      if (stepX !== 0) candidates.push({ dx: stepX, dy: 0 });
    }

    for (const c of candidates) {
      const nx = this.x + c.dx;
      const ny = this.y + c.dy;

      // 壁抜け・角抜け判定
      if (!this.canStepTo(nx, ny, game)) continue;

      // 他モンスターとの重なり回避
      const otherM = game.getMonsterAt(nx, ny);
      if (otherM && otherM !== this) continue;

      // プレイヤーがそのマスにいる場合は攻撃（隣接判定で処理済みだが念のため）
      if (nx === player.x && ny === player.y) {
        this.attackPlayer(player, game);
        return;
      }

      this.move(c.dx, c.dy);
      return;
    }

    // 候補が全て塞がれていた場合はランダム徘徊
    this.wander(game);
  }

  // ランダム徘徊
  wander(game) {
    const randDir = CONFIG.DIRECTIONS[Math.floor(Math.random() * CONFIG.DIRECTIONS.length)];
    const nx = this.x + randDir.dx;
    const ny = this.y + randDir.dy;

    if (this.canStepTo(nx, ny, game) && !game.getMonsterAt(nx, ny) && !(nx === game.player.x && ny === game.player.y)) {
      this.move(randDir.dx, randDir.dy);
    }
  }

  // プレイヤーまでの直線上に他のモンスターがいて、射撃・ブレス等が遮られるか
  isShotBlockedByMonster(player, game) {
    const stepX = Math.sign(player.x - this.x);
    const stepY = Math.sign(player.y - this.y);
    let x = this.x + stepX;
    let y = this.y + stepY;
    while (x !== player.x || y !== player.y) {
      if (game.getMonsterAt(x, y)) return true;
      x += stepX;
      y += stepY;
    }
    return false;
  }

  // (nx, ny) へ1歩で進めるか（壁抜けモンスター以外は壁と角抜けを禁止）
  canStepTo(nx, ny, game) {
    if (this.canPassWalls) return game.map.isInBounds(nx, ny);
    return game.map.isWalkable(nx, ny) && game.map.canMoveDiagonal(this.x, this.y, nx, ny);
  }

  stepOrAttack(dir, game) {
    const nx = this.x + dir.dx;
    const ny = this.y + dir.dy;

    if (!this.canStepTo(nx, ny, game)) return;

    if (nx === game.player.x && ny === game.player.y) {
      this.attackPlayer(game.player, game);
      return;
    }

    if (!game.getMonsterAt(nx, ny)) {
      this.move(dir.dx, dir.dy);
    }
  }

  // 階層に応じたランダムモンスター生成（座標指定）
  static spawnRandom(floorNumber = 1, x = 0, y = 0) {
    const candidates = MONSTER_DEFINITIONS.filter(d => d.minFloor <= floorNumber && (d.maxFloor >= floorNumber || floorNumber >= 17));
    const def = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : MONSTER_DEFINITIONS[0];
    return new Monster(def, x, y);
  }

  // 階層に応じたランダムモンスター取得（互換用）
  static getRandomMonster(floorNumber = 1) {
    return Monster.spawnRandom(floorNumber, 0, 0);
  }

  // IDまたは名前指定での生成
  static createById(id, x = 0, y = 0) {
    const def = MONSTER_DEFINITIONS.find(m => m.id === id || m.name === id) || MONSTER_DEFINITIONS[0];
    return new Monster(def, x, y);
  }
}
