/**
 * アイテム使用・読解・振下・投擲時の効果ロジック
 */
import { ITEM_TYPES, Item } from './Item.js?v=20260924_8';

// 衝撃波の杖：吹き飛ばす最大距離と激突ダメージ
const KNOCKBACK_DISTANCE = 10;
const KNOCKBACK_DAMAGE = 5;

export class ItemEffectHandler {
  constructor(game) {
    this.game = game;
  }

  // 「食べる」
  useFood(item, player) {
    player.restoreHunger(item.hungerRestore);
    this.game.inventory.removeItem(item);
    this.game.sound.playHeal();
    this.game.addLog(`${item.name}を食べた！ お腹が満たされた。（満腹度 +${item.hungerRestore}%）`, 'heal');
    return true;
  }

  // 「飲む」
  useHerb(item, player) {
    this.game.inventory.removeItem(item);

    if (item.id === 'herb_heal') {
      if (player.hp >= player.maxHp) {
        player.maxHp += 1;
        player.hp = player.maxHp;
        this.game.sound.playLevelUp();
        this.game.addLog(`${item.name}を飲んだ！ 最大HPが 1 上昇した！（最大HP: ${player.maxHp}）`, 'heal');
      } else {
        player.heal(25);
        this.game.sound.playHeal();
        this.game.addLog(`${item.name}を飲んだ！ HPが 25 回復した。`, 'heal');
      }
    } else if (item.id === 'herb_high_heal') {
      if (player.hp >= player.maxHp) {
        player.maxHp += 2;
        player.hp = player.maxHp;
        this.game.sound.playLevelUp();
        this.game.addLog(`${item.name}を飲んだ！ 最大HPが 2 上昇した！（最大HP: ${player.maxHp}）`, 'heal');
      } else {
        player.heal(100);
        this.game.sound.playHeal();
        this.game.addLog(`${item.name}を飲んだ！ HPが 100 回復した！`, 'heal');
      }
    } else if (item.id === 'herb_speed') {
      player.statusEffects.speed = 10;
      this.game.sound.playMagic();
      this.game.addLog(`${item.name}を飲んだ！ 体が軽くなり、倍速で行動できるようになった！`, 'buff');
    } else if (item.id === 'herb_poison_cure') {
      player.atk = player.baseAtk;
      player.statusEffects.poison = 0;
      this.game.sound.playHeal();
      this.game.addLog(`${item.name}を飲んだ！ 毒が消え、力が完全に回復した！`, 'heal');
    } else if (item.id === 'herb_fire') {
      this.game.sound.playMagic();
      this.game.addLog(`${item.name}を飲んだ！ 口から灼熱の炎を吐き出した！`, 'danger');
      // 正面へ炎を射出
      this.shootFireBreath(player, 70);
    }
    return true;
  }

  // 「読む」
  useScroll(item, player) {
    this.game.inventory.removeItem(item);
    this.game.sound.playMagic();

    if (item.id === 'scr_light') {
      // 全フロアを可視化・踏破済みに
      for (let y = 0; y < this.game.map.height; y++) {
        for (let x = 0; x < this.game.map.width; x++) {
          this.game.map.visited[y][x] = true;
        }
      }
      this.game.addLog(`${item.name}を読んだ！ フロア全体が眩い光で照らし出された！`, 'accent');
    } else if (item.id === 'scr_confusion') {
      const room = this.game.map.getRoomAt(player.x, player.y);
      let count = 0;
      for (const m of this.game.monsters) {
        if (!room || this.game.map.getRoomAt(m.x, m.y) === room) {
          m.statusEffects.confused = 8;
          count++;
        }
      }
      this.game.addLog(`${item.name}を読んだ！ 部屋中のモンスターが激しく混乱した！`, 'accent');
    } else if (item.id === 'scr_sleep') {
      const room = this.game.map.getRoomAt(player.x, player.y);
      for (const m of this.game.monsters) {
        if (!room || this.game.map.getRoomAt(m.x, m.y) === room) {
          m.statusEffects.sleep = 10;
        }
      }
      this.game.addLog(`${item.name}を読んだ！ 部屋中のモンスターが深い眠りに落ちた！`, 'accent');
    } else if (item.id === 'scr_warp') {
      const p = this.game.findRandomFreeTile();
      if (p) {
        player.warpTo(p.x, p.y);
        this.game.updateVisibility();
        this.game.addLog(`${item.name}を読んだ！ 風に包まれ、フロアの別の場所へ転移した！`, 'accent');
      }
    } else if (item.id === 'scr_upgrade') {
      if (this.game.inventory.equippedWeapon) {
        this.game.inventory.equippedWeapon.plus = (this.game.inventory.equippedWeapon.plus || 0) + 1;
        this.game.sound.playLevelUp();
        this.game.addLog(`${item.name}を読んだ！ ${this.game.inventory.equippedWeapon.name}の輝きが増した！ (+${this.game.inventory.equippedWeapon.plus})`, 'heal');
      } else {
        this.game.addLog(`${item.name}を読んだが、武器を装備していなかった...`, 'warning');
      }
    }
    return true;
  }

  // 「振る」（杖）
  useStaff(item, player) {
    if (item.uses <= 0) {
      this.game.addLog(`${item.name}を振ったが、何も起こらなかった。（使用回数切れ）`, 'warning');
      return true;
    }

    item.uses--;
    this.game.sound.playMagic();
    const dir = player.facing;
    this.game.addLog(`${item.name}を${dir.label}方向に振った！`, 'accent');

    // 直線ビームの計算
    this.shootBeam(player.x, player.y, dir, (targetMonster, hitX, hitY) => {
      if (!targetMonster) {
        this.game.addLog('魔法の弾は虚しく壁に当たって消え去った。', 'normal');
        return;
      }

      if (item.id === 'stf_blow') {
        // 吹き飛ばし
        this.knockbackMonster(targetMonster, dir, KNOCKBACK_DISTANCE);
      } else if (item.id === 'stf_swap') {
        // 場所替え
        const origX = player.x;
        const origY = player.y;
        player.warpTo(targetMonster.x, targetMonster.y);
        targetMonster.warpTo(origX, origY);
        this.game.updateVisibility();
        this.game.addLog(`${targetMonster.name}と位置が瞬時に入れ替わった！`, 'accent');
      } else if (item.id === 'stf_paralyze') {
        // 金縛り
        targetMonster.statusEffects.paralyzed = Infinity; // 攻撃を受けるまで解けない
        this.game.addLog(`${targetMonster.name}は金縛りになり、カチコチに固まった！`, 'accent');
      } else if (item.id === 'stf_thunder') {
        // 雷撃
        this.game.sound.playHit();
        targetMonster.takeDamage(25);
        this.game.animations.addDamageNumber(targetMonster.x, targetMonster.y, 25, '#facc15');
        this.game.addLog(`激しい稲妻が${targetMonster.name}を直撃！ 25のダメージ！`, 'accent');
        if (targetMonster.isDead()) {
          this.game.handleMonsterDefeat(targetMonster);
        }
      }
    });

    return true;
  }

  // 「撃つ」（矢）
  useShoot(item, player) {
    if (item.count <= 0) return false;
    item.count--;
    if (item.count <= 0) {
      this.game.inventory.removeItem(item);
    }

    this.game.sound.playThrow();
    const dir = player.facing;
    this.game.addLog(`${item.name}を${dir.label}方向に射撃した！`, 'normal');

    this.shootProjectile(player.x, player.y, dir, item.icon, (monster, hitX, hitY) => {
      if (monster) {
        this.game.sound.playHit();
        const dmg = item.power + Math.floor(player.atk * 0.5);
        monster.takeDamage(dmg);
        this.game.animations.addDamageNumber(monster.x, monster.y, dmg, '#ffffff');
        this.game.addLog(`矢が${monster.name}に命中！ ${dmg}のダメージ！`, 'normal');
        if (monster.isDead()) {
          this.game.handleMonsterDefeat(monster);
        }
      } else {
        // 地面に落ちる
        // 素のオブジェクトだと getDisplayName が無く拾得時に例外になるため Item として生成
        const droppedArrow = Item.createFromDef(item.id);
        droppedArrow.count = 1;
        if (this.game.placeItem(droppedArrow, hitX, hitY)) {
          this.game.addLog('矢は地面に落ちた。', 'normal');
        }
      }
    });

    return true;
  }

  // 「投げる」（汎用アイテム）
  throwItem(item, player) {
    this.game.inventory.removeItem(item);
    this.game.sound.playThrow();
    const dir = player.facing;
    this.game.addLog(`${item.name}を${dir.label}方向に投げた！`, 'normal');

    this.shootProjectile(player.x, player.y, dir, item.icon, (monster, hitX, hitY) => {
      if (monster) {
        this.game.sound.playHit();
        // アイテム種別ごとの命中効果
        if (item.type === ITEM_TYPES.HERB) {
          if (item.id === 'herb_high_heal') {
            monster.takeDamage(50);
            this.game.animations.addDamageNumber(monster.x, monster.y, 50, '#22c55e');
            this.game.addLog(`${item.name}のエキスが${monster.name}を浄化する！ 50のダメージ！`, 'accent');
          } else if (item.id === 'herb_fire') {
            monster.takeDamage(70);
            this.game.animations.addDamageNumber(monster.x, monster.y, 70, '#ef4444');
            this.game.addLog(`${item.name}が爆砕！ 灼熱の炎で70のダメージ！`, 'danger');
          } else {
            monster.takeDamage(5);
            this.game.addLog(`${monster.name}に当たって 5 のダメージを与えた。`, 'normal');
          }
        } else {
          // 武器や盾、その他アイテムの投擲ダメージ
          const dmg = (item.power || 2) + 2;
          monster.takeDamage(dmg);
          this.game.animations.addDamageNumber(monster.x, monster.y, dmg, '#ffffff');
          this.game.addLog(`${item.name}が${monster.name}に命中！ ${dmg}のダメージ！`, 'normal');
        }

        if (monster.isDead()) {
          this.game.handleMonsterDefeat(monster);
        }
      } else {
        // 地面に落ちる
        if (this.game.placeItem(item, hitX, hitY)) {
          this.game.addLog(`${item.name}は地面に落ちた。`, 'normal');
        }
      }
    });

    return true;
  }

  // 直線ビーム（魔法の杖用）
  shootBeam(startX, startY, dir, callback) {
    let cx = startX;
    let cy = startY;
    const maxRange = 14;

    for (let step = 1; step <= maxRange; step++) {
      cx += dir.dx;
      cy += dir.dy;

      // 壁に衝突
      if (!this.game.map.isWalkable(cx, cy)) {
        this.game.animations.addBeam(startX, startY, cx, cy, '#38bdf8');
        callback(null, cx - dir.dx, cy - dir.dy);
        return;
      }

      // モンスターに命中
      const m = this.game.getMonsterAt(cx, cy);
      if (m) {
        this.game.animations.addBeam(startX, startY, cx, cy, '#38bdf8');
        callback(m, cx, cy);
        return;
      }
    }

    this.game.animations.addBeam(startX, startY, cx, cy, '#38bdf8');
    callback(null, cx, cy);
  }

  // 投擲物・矢の軌道アニメーションと衝突判定
  shootProjectile(startX, startY, dir, icon, callback) {
    let cx = startX;
    let cy = startY;
    const maxRange = 10;
    let lastValidX = startX;
    let lastValidY = startY;

    for (let step = 1; step <= maxRange; step++) {
      const nextX = cx + dir.dx;
      const nextY = cy + dir.dy;

      // 壁に激突
      if (!this.game.map.isWalkable(nextX, nextY)) {
        this.game.animations.addProjectile(startX, startY, lastValidX, lastValidY, icon);
        callback(null, lastValidX, lastValidY);
        return;
      }

      // モンスターに命中
      const m = this.game.getMonsterAt(nextX, nextY);
      if (m) {
        this.game.animations.addProjectile(startX, startY, nextX, nextY, icon);
        callback(m, nextX, nextY);
        return;
      }

      cx = nextX;
      cy = nextY;
      lastValidX = cx;
      lastValidY = cy;
    }

    this.game.animations.addProjectile(startX, startY, lastValidX, lastValidY, icon);
    callback(null, lastValidX, lastValidY);
  }

  // モンスターの吹き飛ばし処理
  knockbackMonster(monster, dir, distance) {
    let curX = monster.x;
    let curY = monster.y;
    let traveled = 0;

    for (let i = 0; i < distance; i++) {
      const nx = curX + dir.dx;
      const ny = curY + dir.dy;

      // 壁または他のモンスターに激突
      if (!this.game.map.isWalkable(nx, ny) || this.game.getMonsterAt(nx, ny) || (nx === this.game.player.x && ny === this.game.player.y)) {
        // 激突ダメージ
        monster.takeDamage(KNOCKBACK_DAMAGE);
        this.game.animations.addDamageNumber(curX, curY, KNOCKBACK_DAMAGE, '#ef4444');
        this.game.addLog(`${monster.name}は激突して ${KNOCKBACK_DAMAGE} のダメージを受けた！`, 'danger');
        break;
      }

      curX = nx;
      curY = ny;
      traveled++;
    }

    monster.moveTo(curX, curY);
    this.game.sound.playHit();
    if (monster.isDead()) {
      this.game.handleMonsterDefeat(monster);
    }
  }

  // ドラゴン草などの前方火炎
  shootFireBreath(player, dmg) {
    const dir = player.facing;
    this.shootBeam(player.x, player.y, dir, (monster, hitX, hitY) => {
      if (monster) {
        this.game.sound.playHit();
        monster.takeDamage(dmg);
        this.game.animations.addDamageNumber(monster.x, monster.y, dmg, '#ef4444');
        this.game.addLog(`紅蓮の炎が${monster.name}を焼き尽くす！ ${dmg}のダメージ！`, 'danger');
        if (monster.isDead()) {
          this.game.handleMonsterDefeat(monster);
        }
      }
    });
  }
}
