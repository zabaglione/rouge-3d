/**
 * ゲームステート・ターン管理・統合ゲームエンジン
 */
import { CONFIG } from '../config.js';
import { sound } from './Audio.js';
import { InputManager } from './Input.js';
import { Renderer } from './Renderer.js?v=20260924_1';
import { AnimationEngine } from './Animation.js';
import { DungeonGenerator } from '../dungeon/DungeonGen.js';
import { DungeonMap } from '../dungeon/Map.js';
import { Player } from '../entities/Player.js';
import { Monster } from '../entities/Monster.js?v=20260924_1';
import { Item, ITEM_TYPES } from '../items/Item.js?v=20260924_1';
import { Inventory } from '../items/Inventory.js';
import { ItemEffectHandler } from '../items/ItemEffects.js';
import { HUD } from '../ui/HUD.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { OverlayMap } from '../ui/OverlayMap.js';
import { VirtualPad } from '../ui/VirtualPad.js';

export const GAME_STATES = {
  TITLE: 'title',
  PLAYING: 'playing',
  INVENTORY: 'inventory',
  GAME_OVER: 'game_over',
  GAME_CLEAR: 'game_clear',
};

export class Game {
  constructor() {
    this.state = GAME_STATES.PLAYING;
    this.currentFloor = 1;

    // サブシステム
    this.sound = sound;
    this.input = new InputManager();
    this.animations = new AnimationEngine();
    this.map = new DungeonMap(CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
    this.generator = new DungeonGenerator(CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
    this.overlayMap = new OverlayMap();
    this.inventory = new Inventory(20);
    this.itemEffects = new ItemEffectHandler(this);

    // エンティティ
    this.player = null;
    this.monsters = [];
    this.droppedItems = [];

    // ダッシュ＆足踏み制御
    this.isDashing = false;
    this.dashDirection = null;
    this.dashTimer = null;
    this.isResting = false;
    this.restTimer = null;

    // レンダラー＆UI初期化（Canvas要素バインド後）
    this.renderer = null;
    this.hud = null;
    this.inventoryUI = null;
    this.virtualPad = null;

    // ゲームループ用タイマー
    this.lastFrameTime = performance.now();
  }

  init(canvas) {
    this.renderer = new Renderer(canvas);
    this.hud = new HUD();
    this.inventoryUI = new InventoryUI(this);
    this.virtualPad = new VirtualPad(this.input);

    // プレイヤー生成
    this.player = new Player(0, 0);

    // 初期の持参アイテム（初心者救済用の携帯食糧、ヒールポーション、ショートソード等）
    const initialItems = [
      Item.createFromDef('wpn_short_sword'),
      Item.createFromDef('shd_buckler'),
      Item.createFromDef('food_ration'),
      Item.createFromDef('herb_heal'),
      Item.createFromDef('scr_light'),
    ];
    for (const it of initialItems) {
      if (it) this.inventory.addItem(it);
    }
    // 初期装備
    if (this.inventory.items[0]) this.inventory.equip(this.inventory.items[0]);
    if (this.inventory.items[1]) this.inventory.equip(this.inventory.items[1]);

    // 第1階層の生成
    this.generateFloor(1);

    // メッセージ初期化
    this.addLog('地下迷宮へ足を踏み入れた！', 'accent');
    this.addLog('階段を探して深層を目指そう。[M]キーでマップ切替。', 'normal');

    // リザルトモーダル等のイベントバインド
    this.initModals();

    // メインループ起動
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  initModals() {
    const retryBtn = document.getElementById('btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.restartGame());
    }
    const clearRetryBtn = document.getElementById('btn-clear-retry');
    if (clearRetryBtn) {
      clearRetryBtn.addEventListener('click', () => this.restartGame());
    }

    // 初回操作時にWeb Audioのコンテキスト起動
    window.addEventListener('click', () => this.sound.ensureContext(), { once: true });
    window.addEventListener('keydown', () => this.sound.ensureContext(), { once: true });
    window.addEventListener('touchstart', () => this.sound.ensureContext(), { once: true });
  }

  // フロア生成
  generateFloor(floorNumber) {
    this.currentFloor = floorNumber;
    const genData = this.generator.generate(floorNumber);
    this.map.init(genData);

    // プレイヤーを初期部屋のランダム位置に配置
    const startTile = this.map.getRandomFloorTile(genData.startRoom);
    this.player.x = startTile ? startTile.x : genData.startRoom.centerX;
    this.player.y = startTile ? startTile.y : genData.startRoom.centerY;
    this.player.renderX = this.player.x * CONFIG.TILE_SIZE;
    this.player.renderY = this.player.y * CONFIG.TILE_SIZE;
    this.player.targetRenderX = this.player.renderX;
    this.player.targetRenderY = this.player.renderY;

    // 視界更新
    this.updateVisibility();

    // モンスター生成（階層に応じて4〜8匹、モンスターハウスなら+10匹）
    this.monsters = [];
    const monsterCount = Math.floor(Math.random() * 4) + 4 + Math.floor(floorNumber * 0.5);
    for (let i = 0; i < monsterCount; i++) {
      const p = this.map.getRandomFloorTile();
      if (p && !(p.x === this.player.x && p.y === this.player.y)) {
        this.monsters.push(Monster.spawnRandom(floorNumber, p.x, p.y));
      }
    }

    // モンスターハウスの追加配置
    if (genData.isMonsterHouse) {
      const mhRoom = genData.rooms.find(r => r.isMonsterHouse);
      if (mhRoom) {
        for (let i = 0; i < 8; i++) {
          const p = this.map.getRandomFloorTile(mhRoom);
          if (p && !(p.x === this.player.x && p.y === this.player.y)) {
            this.monsters.push(Monster.spawnRandom(floorNumber, p.x, p.y));
          }
        }
        // アイテムも大盤振る舞い
        for (let i = 0; i < 6; i++) {
          const p = this.map.getRandomFloorTile(mhRoom);
          if (p) {
            const item = Item.getRandomItem(floorNumber);
            item.x = p.x;
            item.y = p.y;
            this.droppedItems.push(item);
          }
        }
      }
    }

    // アイテム生成（フロアに4〜7個配置）
    this.droppedItems = [];
    const itemCount = Math.floor(Math.random() * 4) + 4;
    for (let i = 0; i < itemCount; i++) {
      const p = this.map.getRandomFloorTile();
      if (p && !(p.x === this.player.x && p.y === this.player.y)) {
        const item = Item.getRandomItem(floorNumber);
        item.x = p.x;
        item.y = p.y;
        this.droppedItems.push(item);
      }
    }

    // トラップ生成（フロアに3〜6個配置）
    this.map.spawnTraps(Math.floor(Math.random() * 4) + 3);

    // BGM開始
    this.sound.startBGM();
  }

  // 視界更新
  updateVisibility() {
    this.map.computeVisibility(this.player.x, this.player.y);

    // 部屋に入った瞬間のモンスターハウス通知
    const room = this.map.getRoomAt(this.player.x, this.player.y);
    if (room && room.isMonsterHouse && !room.alerted) {
      room.alerted = true;
      this.sound.playTrap();
      this.addLog('⚡ 警報！ モンスターハウスに迷い込んでしまった！ ⚡', 'danger');
    }
  }

  // メインゲームループ
  gameLoop(now) {
    const deltaMs = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;

    // 1. 入力処理
    this.input.update(deltaMs);
    this.handleInput();

    // 2. エンティティのスムーズ描画座標補間
    this.player.updateRenderPos(deltaMs);
    for (const m of this.monsters) {
      m.updateRenderPos(deltaMs);
    }

    // 3. アニメーションエンジン更新
    this.animations.update(deltaMs);

    // 4. メインCanvas描画
    this.renderer.render(this, deltaMs);

    // 5. オーバーレイマップ描画
    this.overlayMap.render(this.renderer.ctx, this.renderer.width, this.renderer.height, this);

    // 6. UI＆ステータス更新
    this.hud.updateStatus(this);

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // 入力コマンドの消化
  handleInput() {
    const action = this.input.popAction();
    if (!action) return;

    // インベントリが開いている場合
    if (this.inventoryUI.isOpen) {
      if (action.type === 'TOGGLE_INVENTORY' || action.type === 'CANCEL') {
        this.inventoryUI.close();
      } else if (action.type === 'MOVE' || action.type === 'CHANGE_DIRECTION') {
        this.inventoryUI.handleInput(action.direction, false, false);
      } else if (action.type === 'ATTACK') {
        this.inventoryUI.handleInput(null, true, false); // 決定
      }
      return;
    }

    // ゲームオーバーまたはクリア時はリトライのみ
    if (this.state !== GAME_STATES.PLAYING) {
      if (action.type === 'ATTACK' || action.type === 'TOGGLE_INVENTORY') {
        this.restartGame();
      }
      return;
    }

    // 通常ゲームプレイ中のアクション分岐
    switch (action.type) {
      case 'MOVE':
        this.stopDashAndRest();
        this.stepPlayer(action.direction);
        break;

      case 'CHANGE_DIRECTION':
        this.stopDashAndRest();
        this.player.facing = action.direction;
        this.sound.playStep();
        break;

      case 'DASH':
        this.startDash(action.direction || this.player.facing);
        break;

      case 'REST':
        this.startRest();
        break;

      case 'ATTACK':
        this.stopDashAndRest();
        this.playerAttack();
        break;

      case 'TOGGLE_INVENTORY':
        this.stopDashAndRest();
        this.inventoryUI.toggle();
        break;

      case 'TOGGLE_MAP':
        const nextMode = this.overlayMap.cycleMode();
        this.sound.playMenuSelect();
        const modeNames = { full_overlay: '中央オーバーレイ', mini_map: '右ミニマップ', off: '非表示' };
        this.addLog(`マップ表示: ${modeNames[nextMode]}`, 'normal');
        break;
    }
  }

  // プレイヤーの1歩移動
  stepPlayer(dir) {
    if (!this.player.canAct()) {
      this.addLog('体が痺れて／眠っていて動けない！', 'warning');
      this.processTurn();
      return false;
    }

    this.player.facing = dir;
    const nx = this.player.x + dir.dx;
    const ny = this.player.y + dir.dy;

    // 1. 移動先にモンスターがいる場合は近接攻撃に変換（SFC風直感操作）
    const targetMonster = this.getMonsterAt(nx, ny);
    if (targetMonster) {
      this.attackMonster(targetMonster);
      this.processTurn();
      return true;
    }

    // 2. 移動可能性＆角抜けチェック
    if (!this.map.isWalkable(nx, ny) || !this.map.canMoveDiagonal(this.player.x, this.player.y, nx, ny)) {
      this.sound.playStep(); // 壁にコツン
      return false;
    }

    // 3. 移動実行
    this.player.moveTo(nx, ny);
    this.sound.playStep();
    this.updateVisibility();

    // 4. 足元アイテム確認・拾得
    this.checkUnderfoot();

    // 5. 罠チェック
    this.checkTrap();

    // 6. 階段チェック
    if (this.player.x === this.map.stairs.x && this.player.y === this.map.stairs.y) {
      this.addLog('下り階段がある。スペース/Aボタンで次の階層へ降りられる。', 'accent');
    }

    // 7. ターン進行
    this.processTurn();
    return true;
  }

  // 正面攻撃（Space / Aボタン）
  playerAttack() {
    if (!this.player.canAct()) return;

    // 階段の上にいる場合は階段を降りる
    if (this.player.x === this.map.stairs.x && this.player.y === this.map.stairs.y) {
      this.descendStairs();
      return;
    }

    const dir = this.player.facing;
    const targetX = this.player.x + dir.dx;
    const targetY = this.player.y + dir.dy;

    const monster = this.getMonsterAt(targetX, targetY);

    if (monster) {
      // モンスターへ攻撃
      this.attackMonster(monster);
    } else {
      // 素振り（空振り）
      this.player.triggerAttackAnim();
      this.sound.playSwing();
      this.animations.addSlash(targetX, targetY, dir);

      // 正面の罠を発見（素振りによる罠チェック）
      const trap = this.map.revealTrap(targetX, targetY);
      if (trap) {
        this.sound.playPickup();
        this.addLog(`素振りで【${trap.type.name}】を発見した！`, 'accent');
      }
    }

    this.processTurn();
  }

  // モンスターへの攻撃処理
  attackMonster(monster) {
    this.player.triggerAttackAnim();
    const dir = this.player.facing;
    this.animations.addSlash(monster.x, monster.y, dir);

    // 命中判定（90%）
    if (Math.random() < 0.1) {
      this.sound.playSwing();
      this.animations.addDamageNumber(monster.x, monster.y, 'MISS', '#94a3b8');
      this.addLog(`攻撃を繰り出したが、${monster.name}にかわされた！`, 'normal');
      return;
    }

    // ダメージ計算（SFC風計算式）
    this.sound.playHit();
    const playerAtk = this.player.getTotalAtk(this.inventory);
    const rawDmg = Math.max(1, playerAtk - Math.floor(monster.def * 0.7));
    const isCrit = Math.random() < 0.12; // 会心の一撃
    const variation = Math.floor(Math.random() * 3) - 1; // -1~+1
    const dmg = isCrit ? Math.floor(rawDmg * 2) : Math.max(1, rawDmg + variation);

    monster.takeDamage(dmg);
    this.animations.addDamageNumber(monster.x, monster.y, dmg, isCrit ? '#facc15' : '#ffffff', isCrit);

    if (isCrit) {
      this.addLog(`会心の一撃！！ ${monster.name}に ${dmg} の大ダメージ！`, 'accent');
    } else {
      this.addLog(`${monster.name}に ${dmg} のダメージを与えた！`, 'normal');
    }

    if (monster.isDead()) {
      this.handleMonsterDefeat(monster);
    }
  }

  // モンスター撃破
  handleMonsterDefeat(monster) {
    this.sound.playEnemyDefeat();
    this.addLog(`${monster.name}を倒した！ （+${monster.exp} EXP）`, 'heal');
    this.player.gainExp(monster.exp, this);

    // 盗まれたアイテムを取り戻す
    if (monster.stolenItem) {
      const drop = monster.stolenItem;
      drop.x = monster.x;
      drop.y = monster.y;
      this.droppedItems.push(drop);
      this.addLog(`盗まれていた【${drop.name}】を取り戻した！`, 'accent');
    }

    // 盗まれたゴールドを取り戻す
    if (monster.stolenGold && monster.stolenGold > 0) {
      this.player.gold += monster.stolenGold;
      this.addLog(`盗まれていた ${monster.stolenGold} G を取り戻した！`, 'accent');
    }

    // ドロップアイテム抽選（25%）
    if (Math.random() < 0.25) {
      const drop = Item.getRandomItem(this.currentFloor);
      drop.x = monster.x;
      drop.y = monster.y;
      this.droppedItems.push(drop);
      this.addLog(`${monster.name}は【${drop.name}】を落とした！`, 'accent');
    }

    // 配列から除外
    const idx = this.monsters.indexOf(monster);
    if (idx !== -1) {
      this.monsters.splice(idx, 1);
    }
  }

  // 足元アイテムの自動拾得または足元確認
  checkUnderfoot() {
    const itemIdx = this.droppedItems.findIndex(i => i.x === this.player.x && i.y === this.player.y);
    if (itemIdx === -1) return;

    const item = this.droppedItems[itemIdx];

    // ゴールドなら直接所持金に加算
    if (item.type === ITEM_TYPES.GOLD) {
      this.player.gold += item.power || 50;
      this.droppedItems.splice(itemIdx, 1);
      this.sound.playPickup();
      this.addLog(`${item.power || 50} ゴールドを拾った！`, 'accent');
      return;
    }

    // 通常アイテムのインベントリ自動収納試行
    const res = this.inventory.addItem(item);
    if (res.success) {
      this.droppedItems.splice(itemIdx, 1);
      this.sound.playPickup();
      this.addLog(`【${item.getDisplayName()}】を拾って持ち物にしまった。`, 'heal');
    } else {
      this.addLog(`足元に【${item.getDisplayName()}】がある。（持ち物がいっぱい）`, 'warning');
    }
  }

  // 罠の踏み込みチェック
  checkTrap() {
    const trap = this.map.getTrapAt(this.player.x, this.player.y);
    if (trap) {
      trap.reveal();
      trap.type.trigger(this.player, this);
    }
  }

  // 階段を降りる
  descendStairs() {
    this.sound.playStairs();

    if (this.currentFloor >= CONFIG.MAX_FLOOR) {
      // ゲームクリア！！
      this.gameClear();
      return;
    }

    const nextFloor = this.currentFloor + 1;
    this.addLog(`階段を降りて、地下 ${nextFloor} 階へ進んだ...`, 'level-up');
    this.generateFloor(nextFloor);
  }

  // ダッシュ機能（シレンのBダッシュ：通路の角や敵に当たるまで一気に直進）
  startDash(dir) {
    if (this.isDashing || this.isResting) return;
    this.isDashing = true;
    this.dashDirection = dir;

    const doDashStep = () => {
      if (!this.isDashing) return;

      // 前方に敵がいるかチェック
      const frontX = this.player.x + this.dashDirection.dx;
      const frontY = this.player.y + this.dashDirection.dy;
      if (this.getMonsterAt(frontX, frontY)) {
        this.stopDashAndRest();
        return;
      }

      // 視界内に敵が出現したかチェック
      for (const m of this.monsters) {
        if (this.map.visible[m.y][m.x]) {
          this.stopDashAndRest();
          this.addLog('敵の気配を察知して立ち止まった！', 'warning');
          return;
        }
      }

      // 1歩進む
      const moved = this.stepPlayer(this.dashDirection);
      if (!moved || this.player.isDead()) {
        this.stopDashAndRest();
        return;
      }

      // 通路の曲がり角や分岐判定
      const room = this.map.getRoomAt(this.player.x, this.player.y);
      if (!room) {
        // 通路の中：左右の分岐チェック
        const leftDir = { dx: -this.dashDirection.dy, dy: this.dashDirection.dx };
        const rightDir = { dx: this.dashDirection.dy, dy: -this.dashDirection.dx };
        const canLeft = this.map.isWalkable(this.player.x + leftDir.dx, this.player.y + leftDir.dy);
        const canRight = this.map.isWalkable(this.player.x + rightDir.dx, this.player.y + rightDir.dy);
        if (canLeft || canRight) {
          this.stopDashAndRest();
          return;
        }
      } else {
        // 部屋の入口に入った瞬間に停止
        const prevTile = this.map.getTile(this.player.x - this.dashDirection.dx, this.player.y - this.dashDirection.dy);
        if (prevTile === CONFIG.TILES.CORRIDOR) {
          this.stopDashAndRest();
          return;
        }
      }

      this.dashTimer = setTimeout(doDashStep, CONFIG.DASH_DELAY);
    };

    doDashStep();
  }

  // 足踏み機能（シレンのA+B：高速ターン送りでHP自然回復）
  startRest() {
    if (this.isResting || this.isDashing) return;
    this.isResting = true;

    const doRestStep = () => {
      if (!this.isResting) return;

      // HPが満タンになったら停止
      if (this.player.hp >= this.player.maxHp) {
        this.stopDashAndRest();
        this.addLog('HPが全回復した。', 'heal');
        return;
      }

      // 視界内に敵が出現・接近したら停止
      for (const m of this.monsters) {
        if (this.map.visible[m.y][m.x]) {
          this.stopDashAndRest();
          this.addLog('敵が視界に入ったため足踏みを中断した！', 'warning');
          return;
        }
      }

      // 飢餓状態になったら停止
      if (this.player.hunger <= 0) {
        this.stopDashAndRest();
        this.addLog('お腹が空きすぎて足踏みを中断した！', 'danger');
        return;
      }

      // ターンのみ経過
      this.sound.playStep();
      this.processTurn();

      if (this.player.isDead()) {
        this.stopDashAndRest();
        return;
      }

      this.restTimer = setTimeout(doRestStep, CONFIG.REST_DELAY);
    };

    doRestStep();
  }

  stopDashAndRest() {
    this.isDashing = false;
    this.isResting = false;
    if (this.dashTimer) {
      clearTimeout(this.dashTimer);
      this.dashTimer = null;
    }
    if (this.restTimer) {
      clearTimeout(this.restTimer);
      this.restTimer = null;
    }
  }

  // 1ターンの進行処理（プレイヤー行動後、全敵が1行動）
  processTurn() {
    // プレイヤーのターン終了処理（満腹度、自然回復、状態異常）
    this.player.onTurnEnd();

    // プレイヤー死亡チェック
    if (this.player.isDead()) {
      this.gameOver('力尽きて倒れてしまった...');
      return;
    }

    // モンスターのターン
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      m.takeAction(this);

      // 倍速モンスター（死神など）の2回行動
      if (m.speed >= 2 && !this.player.isDead()) {
        m.takeAction(this);
      }

      m.updateStatusEffects();

      // プレイヤーが敵の行動で死亡したかチェック
      if (this.player.isDead()) {
        this.gameOver(`${m.name}に倒されてしまった...`);
        return;
      }
    }
  }

  // ゲームオーバー
  gameOver(cause) {
    this.state = GAME_STATES.GAME_OVER;
    this.stopDashAndRest();
    this.sound.stopBGM();
    this.sound.playGameOver();

    const modal = document.getElementById('game-over-modal');
    const causeEl = document.getElementById('game-over-cause');
    const scoreEl = document.getElementById('game-over-score');

    if (causeEl) causeEl.textContent = cause;
    if (scoreEl) {
      const score = (this.currentFloor * 1000) + (this.player.lv * 200) + this.player.gold;
      scoreEl.textContent = `到達: 地下${this.currentFloor}階 | レベル: ${this.player.lv} | スコア: ${score} pts`;
    }
    if (modal) modal.classList.remove('hidden');
  }

  // ゲームクリア
  gameClear() {
    this.state = GAME_STATES.GAME_CLEAR;
    this.stopDashAndRest();
    this.sound.stopBGM();
    this.sound.playLevelUp();

    const modal = document.getElementById('game-clear-modal');
    const scoreEl = document.getElementById('game-clear-score');

    if (scoreEl) {
      const score = 50000 + (this.player.lv * 500) + this.player.gold;
      scoreEl.textContent = `最終レベル: ${this.player.lv} | 所持ゴールド: ${this.player.gold} G | 総合スコア: ${score} pts`;
    }
    if (modal) modal.classList.remove('hidden');
  }

  // リスタート
  restartGame() {
    // モーダルを隠す
    const overModal = document.getElementById('game-over-modal');
    const clearModal = document.getElementById('game-clear-modal');
    if (overModal) overModal.classList.add('hidden');
    if (clearModal) clearModal.classList.add('hidden');

    this.state = GAME_STATES.PLAYING;
    this.inventory = new Inventory(20);
    this.player = new Player(0, 0);

    const initialItems = [
      Item.createFromDef('wpn_short_sword'),
      Item.createFromDef('shd_buckler'),
      Item.createFromDef('food_ration'),
      Item.createFromDef('herb_heal'),
      Item.createFromDef('scr_light'),
    ];
    for (const it of initialItems) {
      if (it) this.inventory.addItem(it);
    }
    if (this.inventory.items[0]) this.inventory.equip(this.inventory.items[0]);
    if (this.inventory.items[1]) this.inventory.equip(this.inventory.items[1]);

    this.generateFloor(1);
    this.addLog('新たな冒険が始まった！', 'accent');
  }

  getMonsterAt(x, y) {
    return this.monsters.find(m => m.x === x && m.y === y) || null;
  }

  getItemUnderfoot() {
    return this.droppedItems.find(i => i.x === this.player.x && i.y === this.player.y) || null;
  }

  addLog(msg, type = 'normal') {
    if (this.hud) {
      this.hud.addLog(msg, type);
    }
  }
}
