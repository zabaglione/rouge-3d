/**
 * ダンジョン内に潜む罠（トラップ）定義と処理
 */
export const TRAP_TYPES = {
  SLEEP: {
    id: 'sleep',
    name: '睡眠ガス',
    color: '#a855f7',
    icon: '💤',
    desc: '甘い香りのガスが吹き出し、眠ってしまう！',
    trigger: (player, game) => {
      player.statusEffects.sleep = Math.floor(Math.random() * 3) + 3;
      game.addLog('睡眠ガスの罠にかかった！ 深い眠りに落ちてしまった...', 'danger');
      game.sound.playTrap();
    }
  },
  POISON_ARROW: {
    id: 'poison_arrow',
    name: '毒矢の罠',
    color: '#10b981',
    icon: '🏹',
    desc: '壁から毒矢が飛んできて突き刺さる！',
    trigger: (player, game) => {
      const dmg = Math.floor(player.maxHp * 0.2) + 3;
      player.takeDamage(dmg);
      player.atk = Math.max(1, player.atk - 1);
      game.addLog(`毒矢が刺さった！ ${dmg}のダメージを受け、力が1下がった！`, 'danger');
      game.sound.playTrap();
    }
  },
  MINE: {
    id: 'mine',
    name: '地雷の罠',
    color: '#ef4444',
    icon: '💥',
    desc: '爆発し、現在のHPが半分になる！周囲の敵も巻き込む！',
    trigger: (player, game) => {
      const dmg = Math.floor(player.hp / 2);
      player.takeDamage(dmg);
      game.animations.addExplosion(player.x, player.y);
      game.addLog(`地雷が爆発した！ HPが半分（-${dmg}）になった！`, 'danger');
      game.sound.playExplosion();
      // 周囲の敵にも大ダメージ（倒れた敵は撃破処理して盤面から除く）
      for (const m of [...game.monsters]) {
        const dist = Math.max(Math.abs(m.x - player.x), Math.abs(m.y - player.y));
        if (dist <= 1) {
          m.takeDamage(30);
          game.addLog(`爆風が${m.name}を巻き込んだ！ (30ダメージ)`, 'normal');
          if (m.isDead()) game.handleMonsterDefeat(m);
        }
      }
    }
  },
  WARP: {
    id: 'warp',
    name: 'ワープの罠',
    color: '#38bdf8',
    icon: '🌀',
    desc: '異空間へ飛ばされ、フロアの別の場所へワープする！',
    trigger: (player, game) => {
      const p = game.findRandomFreeTile();
      if (p) {
        player.warpTo(p.x, p.y);
        game.updateVisibility();
        game.onPlayerTeleported();
        game.addLog('ワープの罠だ！ 別の場所へ飛ばされた！', 'accent');
        game.sound.playMagic();
        game.animations.flash('#38bdf8', 0.45, 320);
      }
    }
  },
  HUNGER: {
    id: 'hunger',
    name: '空腹の罠',
    color: '#f59e0b',
    icon: '🍙',
    desc: '急激にお腹が減ってしまう！',
    trigger: (player, game) => {
      player.hunger = Math.max(0, player.hunger - 30);
      game.addLog('空腹の罠にかかった！ 胃袋が一気に空っぽになった！', 'warning');
      game.sound.playTrap();
    }
  }
};

export class Trap {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.isRevealed = false; // 最初は不可視
  }

  reveal() {
    this.isRevealed = true;
  }
}
