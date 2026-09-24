/**
 * ゲームステート・ターン管理・統合ゲームエンジン
 */
import { CONFIG } from '../config.js?v=20260924_11';
import { sound } from './Audio.js?v=20260924_11';
import { InputManager } from './Input.js?v=20260924_11';
import { Renderer } from './Renderer.js?v=20260924_11';
import { AnimationEngine } from './Animation.js?v=20260924_11';
import { fxClock } from './FxClock.js?v=20260924_11';
import { DungeonGenerator } from '../dungeon/DungeonGen.js?v=20260924_11';
import { DungeonMap } from '../dungeon/Map.js?v=20260924_11';
import { Player } from '../entities/Player.js?v=20260924_11';
import { Monster } from '../entities/Monster.js?v=20260924_11';
import { Item, ITEM_TYPES } from '../items/Item.js?v=20260924_11';
import { Inventory } from '../items/Inventory.js?v=20260924_11';
import { ItemEffectHandler } from '../items/ItemEffects.js?v=20260924_11';
import { HUD } from '../ui/HUD.js?v=20260924_11';
import { InventoryUI } from '../ui/InventoryUI.js?v=20260924_11';
import { OverlayMap } from '../ui/OverlayMap.js?v=20260924_11';
import { VirtualPad } from '../ui/VirtualPad.js?v=20260924_11';

// アイテムが既存アイテムと重ならないよう転がる最大距離（マス）
const ITEM_SCATTER_RADIUS = 3;
// 開いている間はゲーム操作を受け付けない画面
const BLOCKING_PANEL_IDS = ['help-modal', 'log-history-modal'];
// ランダムな空きマス探索の試行回数
const FREE_TILE_ATTEMPTS = 200;

// --- 手応えの演出 ---
// 自分の攻撃の後、敵の反撃を見せ始めるまでの間 (ms)
const PLAYER_TO_ENEMY_DELAY = 200;
// 複数の敵が攻撃してくる時、1体ずつずらして見せる間隔 (ms)
const ENEMY_STAGGER = 170;
// ヒットストップ（命中の瞬間に止める時間 ms）
const HIT_STOP_MS = 55;
const CRIT_HIT_STOP_MS = 120;
const KILL_HIT_STOP_MS = 90;
const DAMAGED_HIT_STOP_MS = 45;
// 倒れてからゲームオーバー画面を出すまでの間 (ms)
const GAME_OVER_MODAL_DELAY = 1100;

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

    // ダッシュ制御
    this.isDashing = false;
    this.dashDirection = null;
    this.dashTimer = null;

    // 倍速状態のプレイヤーが「敵が行動しない追加行動」中かどうか
    this.isPlayerBonusAction = false;

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
    this.attachPlayerHooks();

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

    // 操作時にWeb Audioのコンテキストを起動・再開
    // （iOS Safari は touchend/click でしか解除できず、バックグラウンド復帰後も再度 suspend されるため毎回確認する）
    for (const type of ['touchend', 'click', 'keydown']) {
      window.addEventListener(type, () => this.sound.ensureContext());
    }
  }

  // プレイヤーがダメージを受けた時の画面の揺れ・赤み・振動
  attachPlayerHooks() {
    this.player.onDamaged = (amount) => {
      const ratio = Math.min(1, amount / Math.max(1, this.player.maxHp));
      this.animations.shake(0.3 + ratio * 1.2);
      this.animations.hurt(0.45 + ratio * 1.5);
      this.animations.vibrate(amount >= this.player.maxHp * 0.2 ? 60 : 30);
      this.hitStop(DAMAGED_HIT_STOP_MS);
      fxClock.run(() => this.hud.onPlayerHit(amount));
    };
  }

  // 杖・矢・投擲などが敵に当たった瞬間の手応え（火花・揺れ・ヒットストップ）
  impactFx(monster, dir, isBig = false) {
    this.animations.addHitSpark(monster.x, monster.y, dir, isBig);
    this.animations.shake(isBig ? 0.45 : 0.22);
    this.hitStop(isBig ? CRIT_HIT_STOP_MS : HIT_STOP_MS);
  }

  // ヒットストップ（演出の順番待ち中ならその順番で止める）
  hitStop(ms) {
    fxClock.run(() => fxClock.hitStop(ms));
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
    if (this.renderer) this.renderer.snapCamera = true;

    // 視界更新
    this.updateVisibility();

    // 床アイテムをリセット（モンスターハウスのアイテム配置より前に行う）
    this.droppedItems = [];

    // モンスター生成（階層に応じて4〜8匹、モンスターハウスなら+10匹）
    this.monsters = [];
    const monsterCount = Math.floor(Math.random() * 4) + 4 + Math.floor(floorNumber * 0.5);
    for (let i = 0; i < monsterCount; i++) {
      const p = this.findRandomFreeTile(null, true);
      if (p) this.monsters.push(Monster.spawnRandom(floorNumber, p.x, p.y));
    }

    // モンスターハウスの追加配置
    if (genData.isMonsterHouse) {
      const mhRoom = genData.rooms.find(r => r.isMonsterHouse);
      if (mhRoom) {
        for (let i = 0; i < 8; i++) {
          const p = this.findRandomFreeTile(mhRoom);
          if (p) this.monsters.push(Monster.spawnRandom(floorNumber, p.x, p.y));
        }
        // アイテムも大盤振る舞い
        for (let i = 0; i < 6; i++) {
          const p = this.map.getRandomFloorTile(mhRoom);
          if (p) this.placeItem(Item.getRandomItem(floorNumber), p.x, p.y);
        }
      }
    }

    // アイテム生成（フロアに4〜7個配置）
    const itemCount = Math.floor(Math.random() * 4) + 4;
    for (let i = 0; i < itemCount; i++) {
      const p = this.map.getRandomFloorTile();
      if (p) this.placeItem(Item.getRandomItem(floorNumber), p.x, p.y);
    }

    // ゴールド生成（フロアに2〜4個配置）
    const goldCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < goldCount; i++) {
      const p = this.map.getRandomFloorTile();
      if (p) this.placeItem(Item.createGold(floorNumber), p.x, p.y);
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

    // 0. 演出の順番待ち・ヒットストップの進行
    fxClock.update(deltaMs);
    this.updatePendingModal(deltaMs);

    // 1. 入力処理
    this.input.update(deltaMs);
    this.handleInput();

    // 2. エンティティのスムーズ描画座標補間（ヒットストップ中は止める）
    if (!fxClock.isFrozen()) {
      this.player.updateRenderPos(deltaMs);
      for (const m of this.monsters) {
        m.updateRenderPos(deltaMs);
      }
    }

    // 3. アニメーションエンジン更新
    this.animations.update(deltaMs);

    // 4. メインCanvas描画
    this.renderer.render(this, deltaMs);

    // 5. オーバーレイマップ描画
    this.overlayMap.render(this.renderer, this);

    // 6. UI＆ステータス更新
    this.hud.updateStatus(this);

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // 入力コマンドの消化
  handleInput() {
    // 攻撃・反撃の演出中や階層移動の暗転中は次の行動を待たせる（押しっぱなしの入力は最新の1つだけ残す）
    const isBusy = this.state === GAME_STATES.PLAYING && !this.inventoryUI.isOpen &&
      (fxClock.isBusy() || this.animations.isTransitioning());
    if (isBusy) {
      const queue = this.input.actionQueue;
      if (queue.length > 1) queue.splice(0, queue.length - 1);
      return;
    }

    const action = this.input.popAction();
    if (!action) return;

    // 操作方法・ログ履歴の画面を開いている間はゲームを操作させない（Esc/Bで閉じる）
    const openPanel = BLOCKING_PANEL_IDS
      .map(id => document.getElementById(id))
      .find(el => el && !el.classList.contains('hidden'));
    if (openPanel) {
      if (action.type === 'CANCEL' || action.type === 'DASH') openPanel.classList.add('hidden');
      return;
    }

    // インベントリが開いている場合
    if (this.inventoryUI.isOpen) {
      if (action.type === 'TOGGLE_INVENTORY') {
        this.inventoryUI.close();
      } else if (action.type === 'CANCEL' || action.type === 'DASH') {
        // Esc / Bボタン：コマンドメニューを閉じる（開いていなければ持ち物を閉じる）
        this.inventoryUI.handleInput(null, false, true);
      } else if (action.type === 'MOVE' || action.type === 'CHANGE_DIRECTION') {
        this.inventoryUI.handleInput(action.direction, false, false);
      } else if (action.type === 'ATTACK') {
        this.inventoryUI.handleInput(null, true, false); // 決定
      }
      return;
    }

    // ゲームオーバーまたはクリア時はリトライのみ（結果画面が出るまでは受け付けない）
    if (this.state !== GAME_STATES.PLAYING) {
      if (this.pendingModal) return;
      if (action.type === 'ATTACK' || action.type === 'TOGGLE_INVENTORY') {
        this.restartGame();
      }
      return;
    }

    // 通常ゲームプレイ中のアクション分岐
    switch (action.type) {
      case 'MOVE':
        this.stopDash();
        this.stepPlayer(action.direction);
        break;

      case 'CHANGE_DIRECTION':
        this.stopDash();
        this.player.facing = action.direction;
        this.sound.playStep();
        break;

      case 'DASH':
        this.startDash(action.direction || this.player.facing);
        break;

      case 'REST':
        this.stopDash();
        this.restOneTurn();
        break;

      case 'ATTACK':
        this.stopDash();
        this.playerAttack();
        break;

      case 'TOGGLE_INVENTORY':
        this.stopDash();
        this.inventoryUI.toggle();
        break;

      case 'TOGGLE_MAP': {
        const nextMode = this.overlayMap.cycleMode();
        this.sound.playMenuSelect();
        const modeNames = { full_overlay: '全体マップ', mini_map: '右ミニマップ', off: '非表示' };
        this.addLog(`マップ表示: ${modeNames[nextMode]}`, 'normal');
        break;
      }
    }
  }

  // プレイヤーの1歩移動
  stepPlayer(dir) {
    if (!this.player.canAct()) {
      this.addLog('体が痺れて／眠っていて動けない！', 'warning');
      this.processTurn();
      return false;
    }

    // 混乱中は入力と無関係な方向へふらつく
    if (this.player.statusEffects.confused > 0) {
      dir = CONFIG.DIRECTIONS[Math.floor(Math.random() * CONFIG.DIRECTIONS.length)];
    }

    this.player.facing = dir;
    const nx = this.player.x + dir.dx;
    const ny = this.player.y + dir.dy;

    // 1. 移動先にモンスターがいる場合は近接攻撃に変換（SFC風直感操作。壁の角越しは不可）
    const targetMonster = this.getMonsterAt(nx, ny);
    if (targetMonster && this.map.canMoveDiagonal(this.player.x, this.player.y, nx, ny)) {
      this.attackMonster(targetMonster);
      this.processTurn();
      return true;
    }

    // 2. 移動可能性＆角抜けチェック
    if (targetMonster || !this.map.isWalkable(nx, ny) || !this.map.canMoveDiagonal(this.player.x, this.player.y, nx, ny)) {
      // 壁にゴツン（ダッシュの停止時は鳴らさない）
      if (!this.isDashing) {
        this.sound.playBump();
        this.animations.kick(dir, 3);
      }
      return false;
    }

    // 3. 移動実行
    this.animations.addDust(this.player.x, this.player.y, this.isDashing ? 4 : 2);
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
    if (!this.player.canAct()) {
      this.addLog('体が痺れて／眠っていて動けない！', 'warning');
      this.processTurn();
      return;
    }

    // 階段の上にいる場合は階段を降りる
    if (this.player.x === this.map.stairs.x && this.player.y === this.map.stairs.y) {
      this.descendStairs();
      return;
    }

    const dir = this.player.facing;
    const targetX = this.player.x + dir.dx;
    const targetY = this.player.y + dir.dy;

    // 壁の角越しには攻撃が届かない
    const canReach = this.map.canMoveDiagonal(this.player.x, this.player.y, targetX, targetY);
    const monster = canReach ? this.getMonsterAt(targetX, targetY) : null;

    if (monster) {
      // モンスターへ攻撃
      this.attackMonster(monster);
    } else {
      // 素振り（空振り）
      this.player.triggerAttackAnim();
      this.sound.playSwing();
      this.animations.addSlash(targetX, targetY, dir);
      this.animations.kick(dir, 2);

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
      this.animations.kick(dir, 2);
      this.animations.addFloatingText(monster.x, monster.y, 'MISS', '#94a3b8');
      this.addLog(`攻撃を繰り出したが、${monster.name}にかわされた！`, 'normal');
      return;
    }

    // ダメージ計算（SFC風計算式）
    const playerAtk = this.player.getTotalAtk(this.inventory);
    const rawDmg = Math.max(1, playerAtk - Math.floor(monster.def * 0.7));
    const isCrit = Math.random() < 0.12; // 会心の一撃
    const variation = Math.floor(Math.random() * 3) - 1; // -1~+1
    const dmg = isCrit ? Math.floor(rawDmg * 2) : Math.max(1, rawDmg + variation);

    monster.takeDamage(dmg);
    this.animations.addDamageNumber(monster.x, monster.y, dmg, isCrit ? '#facc15' : '#ffffff', isCrit);

    // 手応え：打撃音・火花・ヒットストップ・カメラの反動
    this.sound.playHit(isCrit);
    this.animations.addHitSpark(monster.x, monster.y, dir, isCrit);
    this.animations.kick(dir, isCrit ? 9 : 5);
    this.animations.shake(isCrit ? 0.55 : 0.22);
    if (isCrit) {
      this.animations.zoomPunch(0.06);
      this.animations.flash('#fef9c3', 0.28, 160);
      this.animations.vibrate(35);
    }
    this.hitStop(isCrit ? CRIT_HIT_STOP_MS : HIT_STOP_MS);

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
    this.animations.addDeath(monster.x, monster.y, monster.icon, monster.color);
    this.animations.addFloatingText(monster.x, monster.y - 0.5, `+${monster.exp} EXP`, '#4ade80', 0.8);
    this.animations.shake(0.3);
    this.animations.vibrate(25);
    this.hitStop(KILL_HIT_STOP_MS);
    this.addLog(`${monster.name}を倒した！ （+${monster.exp} EXP）`, 'heal');
    this.player.gainExp(monster.exp, this);

    // 盗まれたアイテムを取り戻す
    if (monster.stolenItem) {
      const drop = monster.stolenItem;
      this.placeItem(drop, monster.x, monster.y);
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
      if (this.placeItem(drop, monster.x, monster.y)) {
        this.addLog(`${monster.name}は【${drop.name}】を落とした！`, 'accent');
      }
    }

    // 配列から除外
    const idx = this.monsters.indexOf(monster);
    if (idx !== -1) {
      this.monsters.splice(idx, 1);
    }
  }

  // モンスターもプレイヤーもいない歩けるマスか
  isTileFree(x, y) {
    return this.map.isWalkable(x, y) &&
      !this.getMonsterAt(x, y) &&
      !(x === this.player.x && y === this.player.y);
  }

  // ランダムな空き床マス（room 指定でその部屋内）。avoidPlayerRoom で開始直後の袋叩きを防ぐ
  findRandomFreeTile(room = null, avoidPlayerRoom = false) {
    const playerRoom = avoidPlayerRoom ? this.map.getRoomAt(this.player.x, this.player.y) : null;
    for (let attempt = 0; attempt < FREE_TILE_ATTEMPTS; attempt++) {
      const p = this.map.getRandomFloorTile(room);
      if (!p || !this.isTileFree(p.x, p.y)) continue;
      if (playerRoom && this.map.getRoomAt(p.x, p.y) === playerRoom) continue;
      return p;
    }
    return null;
  }

  // (x, y) から最も近い「歩ける・アイテムが無い・プレイヤーがいない」マスを探す
  // 同じマスにアイテムが重なると1つしか拾えず、残りが床に残って見えるため
  findItemDropPos(x, y) {
    const isFree = (nx, ny) =>
      this.map.isWalkable(nx, ny) &&
      !(nx === this.player.x && ny === this.player.y) &&
      !this.droppedItems.some(i => i.x === nx && i.y === ny);

    for (let r = 0; r <= ITEM_SCATTER_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (isFree(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  // アイテムを床に置く（重なる場合は近くの空きマスへ転がる）。置けなければ false
  placeItem(item, x, y) {
    const pos = this.findItemDropPos(x, y);
    if (!pos) {
      this.addLog(`【${item.name}】はどこかへ転がって消えてしまった…`, 'warning');
      return false;
    }
    item.x = pos.x;
    item.y = pos.y;
    this.droppedItems.push(item);
    return true;
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
      this.sound.playCoin();
      this.animations.addPickup(item.x, item.y, item.icon, `+${item.power || 50} G`, '#facc15');
      this.addLog(`${item.power || 50} ゴールドを拾った！`, 'accent');
      return;
    }

    // 通常アイテムのインベントリ自動収納試行
    const res = this.inventory.addItem(item);
    if (res.success) {
      this.droppedItems.splice(itemIdx, 1);
      this.sound.playPickup();
      this.animations.addPickup(item.x, item.y, item.icon, null, item.color || '#facc15');
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
    this.stopDash();
    this.sound.playStairs();

    if (this.currentFloor >= CONFIG.MAX_FLOOR) {
      // ゲームクリア！！
      this.gameClear();
      return;
    }

    // 暗転している間に次の階層を作り、明けたら階層名を出す
    const nextFloor = this.currentFloor + 1;
    this.animations.startFloorTransition(`地下 ${nextFloor} 階`, () => {
      this.addLog(`階段を降りて、地下 ${nextFloor} 階へ進んだ...`, 'level-up');
      this.generateFloor(nextFloor);
    });
  }

  // ダッシュ機能（シレンのBダッシュ：通路の角や敵に当たるまで一気に直進）
  startDash(dir) {
    if (this.isDashing) return;
    this.isDashing = true;
    this.dashDirection = dir;

    const doDashStep = () => {
      if (!this.isDashing) return;

      // 前方に敵がいるかチェック
      const frontX = this.player.x + this.dashDirection.dx;
      const frontY = this.player.y + this.dashDirection.dy;
      if (this.getMonsterAt(frontX, frontY)) {
        this.stopDash();
        return;
      }

      // 視界内に敵が出現したかチェック
      for (const m of this.monsters) {
        if (this.map.visible[m.y][m.x]) {
          this.stopDash();
          this.addLog('敵の気配を察知して立ち止まった！', 'warning');
          return;
        }
      }

      // 1歩進む
      const moved = this.stepPlayer(this.dashDirection);
      if (!moved || this.player.isDead()) {
        this.stopDash();
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
          this.stopDash();
          return;
        }
      } else {
        // 部屋の入口に入った瞬間に停止
        const prevTile = this.map.getTile(this.player.x - this.dashDirection.dx, this.player.y - this.dashDirection.dy);
        if (prevTile === CONFIG.TILES.CORRIDOR) {
          this.stopDash();
          return;
        }
      }

      this.dashTimer = setTimeout(doDashStep, CONFIG.DASH_DELAY);
    };

    doDashStep();
  }

  // 足踏み：その場で1ターン経過（満腹度が減り、HPが自然回復し、敵も行動する）
  restOneTurn() {
    this.sound.playStep();
    this.processTurn();
  }

  stopDash() {
    this.isDashing = false;
    if (this.dashTimer) {
      clearTimeout(this.dashTimer);
      this.dashTimer = null;
    }
  }

  // 1ターンの進行処理（プレイヤー行動後、全敵が1行動）
  processTurn() {
    if (this.state !== GAME_STATES.PLAYING) return;

    // 罠などプレイヤー自身の行動で倒れた場合（自然回復で生き返らないよう先に判定）
    if (this.player.isDead()) {
      this.gameOver('力尽きて倒れてしまった...');
      return;
    }

    // 倍速中は2回に1回、敵が行動しない追加行動になる
    if (this.player.statusEffects.speed > 0) {
      this.isPlayerBonusAction = !this.isPlayerBonusAction;
      if (this.isPlayerBonusAction) return;
    } else {
      this.isPlayerBonusAction = false;
    }

    // プレイヤーのターン終了処理（満腹度、自然回復、状態異常）
    this.player.onTurnEnd();

    // プレイヤー死亡チェック
    if (this.player.isDead()) {
      this.gameOver(this.player.hunger <= 0 ? '空腹で力尽きて倒れてしまった...' : '力尽きて倒れてしまった...');
      return;
    }

    // モンスターのターン（行動中に倒れた・召喚されたモンスターがいても安全なようにコピーを回す）
    // 自分の攻撃を見せ終えてから敵の攻撃を1体ずつ順に見せる（ロジックはここで確定し、演出だけ遅らせる）
    const playerFxActive = this.player.attackAnimTimer > 0 ||
      this.animations.projectiles.some(p => !p.isPickup) || this.animations.beams.length > 0;
    let fxOffset = playerFxActive ? PLAYER_TO_ENEMY_DELAY : 0;
    try {
      for (const m of [...this.monsters]) {
        if (m.isDead() || !this.monsters.includes(m)) continue;
        fxClock.delayMs = fxOffset;
        let seq = m.attackSeq;
        m.takeAction(this);

        // 倍速モンスター（死神など）の2回行動
        if (m.speed >= 2 && !this.player.isDead()) {
          if (m.attackSeq !== seq) {
            fxOffset += ENEMY_STAGGER;
            fxClock.delayMs = fxOffset;
            seq = m.attackSeq;
          }
          m.takeAction(this);
        }
        if (m.attackSeq !== seq) fxOffset += ENEMY_STAGGER;

        m.updateStatusEffects();

        // プレイヤーが敵の行動で死亡したかチェック
        if (this.player.isDead()) {
          this.gameOver(`${m.name}に倒されてしまった...`);
          return;
        }
      }
    } finally {
      fxClock.delayMs = 0;
    }
  }

  // 演出が終わるのを待ってから結果画面を出す
  updatePendingModal(deltaMs) {
    const pm = this.pendingModal;
    if (!pm || fxClock.isBusy()) return;
    pm.wait -= deltaMs;
    if (pm.wait > 0) return;
    this.pendingModal = null;
    const modal = document.getElementById(pm.id);
    if (modal) modal.classList.remove('hidden');
  }

  // ゲームオーバー
  gameOver(cause) {
    this.state = GAME_STATES.GAME_OVER;
    this.stopDash();
    this.sound.stopBGM();
    this.sound.playGameOver();
    this.animations.flash('#7f1d1d', 0.55, 900);
    this.animations.shake(0.9);
    this.animations.vibrate(200);

    const causeEl = document.getElementById('game-over-cause');
    const scoreEl = document.getElementById('game-over-score');

    if (causeEl) causeEl.textContent = cause;
    if (scoreEl) {
      const score = (this.currentFloor * 1000) + (this.player.lv * 200) + this.player.gold;
      scoreEl.textContent = `到達: 地下${this.currentFloor}階 | レベル: ${this.player.lv} | スコア: ${score} pts`;
    }
    // 倒れる瞬間を見せてから結果画面を出す
    this.pendingModal = { id: 'game-over-modal', wait: GAME_OVER_MODAL_DELAY };
  }

  // ゲームクリア
  gameClear() {
    this.state = GAME_STATES.GAME_CLEAR;
    this.stopDash();
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
    this.attachPlayerHooks();

    // 前の冒険の演出を片付ける
    fxClock.reset();
    this.animations = new AnimationEngine();
    this.pendingModal = null;

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

  // 演出の順番待ち中なら、その出来事が画面に出るタイミングでログに出す
  addLog(msg, type = 'normal') {
    if (this.hud) {
      fxClock.run(() => this.hud.addLog(msg, type));
    }
  }
}
