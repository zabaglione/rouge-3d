/**
 * SFC風操作系・マルチ入力マネージャー (キーボード, Gamepad API, バーチャルパッド)
 */
import { CONFIG } from '../config.js';

export class InputManager {
  constructor() {
    // 現在押されているキー
    this.keys = new Set();
    
    // 入力コマンドバッファ
    this.actionQueue = [];

    // モード状態フラグ
    this.isDiagonalLock = false; // 斜め移動固定 (SFCシレンのRボタン)
    this.isFacingLock = false;   // 向き変更モード (SFCシレンのYボタン)
    this.isDashHolding = false;  // ダッシュ待機 (SFCシレンのBボタン)

    // ゲームパッド状態
    this.gamepadIndex = null;
    this.lastGamepadAxes = { x: 0, y: 0 };
    this.gamepadButtonStates = {};
    this.gamepadDeadzone = 0.28;
    this.gamepadRepeatTimer = 0;
    this.gamepadRepeatDelay = 180; // ms

    // リピート制御（キー長押し移動用）
    this.keyRepeatTimer = 0;
    this.keyRepeatInterval = 140; // ms
    this.lastKeyDirection = null;

    // イベントリスナー登録
    this.initKeyboardListeners();
    this.initGamepadListeners();
  }

  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      // ゲームプレイ中の特定キーのデフォルト動作（スクロールなど）を抑止
      const preventKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Alt'];
      if (preventKeys.includes(e.code) || e.key === 'Tab') {
        e.preventDefault();
      }

      this.keys.add(e.code);
      this.keys.add(e.key);

      // モディファイアキーの即時反映
      if (e.code === 'KeyR' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.isDiagonalLock = true;
      }
      if (e.code === 'KeyC' || e.code === 'AltLeft' || e.code === 'AltRight' || e.shiftKey) {
        this.isFacingLock = true;
      }
      if (e.code === 'KeyX' || e.shiftKey) {
        this.isDashHolding = true;
      }

      // 単発トリガーアクション
      this.handleKeyDownDirect(e);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.keys.delete(e.key);

      if (e.code === 'KeyR' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.isDiagonalLock = false;
      }
      if (e.code === 'KeyC' || e.code === 'AltLeft' || e.code === 'AltRight') {
        this.isFacingLock = false;
      }
      if (e.code === 'KeyX' || !e.shiftKey) {
        this.isDashHolding = false;
      }
    });

    // フォーカス外れ時はリセット
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.isDiagonalLock = false;
      this.isFacingLock = false;
      this.isDashHolding = false;
    });
  }

  initGamepadListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log('Gamepad connected:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
      window.dispatchEvent(new CustomEvent('gamepad-status-change', { detail: { connected: true, id: e.gamepad.id } }));
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('Gamepad disconnected');
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
      }
      window.dispatchEvent(new CustomEvent('gamepad-status-change', { detail: { connected: false } }));
    });
  }

  // ダイレクト単発アクション処理
  handleKeyDownDirect(e) {
    // メニュー/インベントリ
    if (e.code === 'KeyI' || e.code === 'KeyE') {
      this.queueAction({ type: 'TOGGLE_INVENTORY' });
      return;
    }
    // マップ表示切替
    if (e.code === 'KeyM' || e.code === 'Tab') {
      this.queueAction({ type: 'TOGGLE_MAP' });
      return;
    }
    // 足踏み（ターン送り）
    if (e.code === 'Period' || e.code === 'KeyT' || e.code === 'Numpad5') {
      this.queueAction({ type: 'REST' });
      return;
    }
    // 攻撃 / 決定 / 会話
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') {
      this.queueAction({ type: 'ATTACK' });
      return;
    }
    // キャンセル / 閉じる
    if (e.code === 'Escape' || e.code === 'Backspace') {
      this.queueAction({ type: 'CANCEL' });
      return;
    }
    // 斜め切り替えトグル（Shift+R等）
    if (e.code === 'KeyR' && e.ctrlKey) {
      this.isDiagonalLock = !this.isDiagonalLock;
      return;
    }
  }

  // ゲームループから毎フレーム更新
  update(deltaMs) {
    this.pollGamepad(deltaMs);
    this.pollContinuousKeyboard(deltaMs);
  }

  // キーボード移動のポーリング＆リピート
  pollContinuousKeyboard(deltaMs) {
    const dir = this.getKeyboardDirection();
    if (!dir) {
      this.keyRepeatTimer = 0;
      this.lastKeyDirection = null;
      return;
    }

    if (!this.lastKeyDirection || this.lastKeyDirection.name !== dir.name) {
      // 最初の1歩（即時発火）
      this.lastKeyDirection = dir;
      this.keyRepeatTimer = this.keyRepeatInterval + 100; // 初回遅延
      this.triggerMovement(dir);
    } else {
      // 押し続けリピート
      this.keyRepeatTimer -= deltaMs;
      if (this.keyRepeatTimer <= 0) {
        this.keyRepeatTimer = this.keyRepeatInterval;
        this.triggerMovement(dir);
      }
    }
  }

  // 押下キーから8方向を合成
  getKeyboardDirection() {
    let dx = 0;
    let dy = 0;

    // テンキー（1-9）ダイレクト
    if (this.keys.has('Numpad8')) { dx = 0; dy = -1; }
    else if (this.keys.has('Numpad9')) { dx = 1; dy = -1; }
    else if (this.keys.has('Numpad6')) { dx = 1; dy = 0; }
    else if (this.keys.has('Numpad3')) { dx = 1; dy = 1; }
    else if (this.keys.has('Numpad2')) { dx = 0; dy = 1; }
    else if (this.keys.has('Numpad1')) { dx = -1; dy = 1; }
    else if (this.keys.has('Numpad4')) { dx = -1; dy = 0; }
    else if (this.keys.has('Numpad7')) { dx = -1; dy = -1; }
    // Vimキー (HJKL + YUBNE)
    else if (this.keys.has('KeyK')) { dy -= 1; }
    else if (this.keys.has('KeyJ')) { dy += 1; }
    else if (this.keys.has('KeyH')) { dx -= 1; }
    else if (this.keys.has('KeyL')) { dx += 1; }
    else if (this.keys.has('KeyY')) { dx = -1; dy = -1; }
    else if (this.keys.has('KeyU')) { dx = 1; dy = -1; }
    else if (this.keys.has('KeyB')) { dx = -1; dy = 1; }
    else if (this.keys.has('KeyN')) { dx = 1; dy = 1; }
    else {
      // 矢印キー & WASD の合成
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
    }

    if (dx === 0 && dy === 0) return null;

    // 正規化方向オブジェクトを検索
    return this.findDirection(dx, dy);
  }

  // ゲームパッドのポーリング
  pollGamepad(deltaMs) {
    if (this.gamepadIndex === null) return;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gamepads[this.gamepadIndex];
    if (!pad) return;

    // ボタンチェック
    const isPressed = (btnIdx) => {
      const b = pad.buttons[btnIdx];
      return b && (typeof b === 'object' ? b.pressed : b > 0.5);
    };

    // SFCボタンマッピング
    // 0: A (攻撃/決定)
    // 1: B (ダッシュ/キャンセル)
    // 2: X (インベントリ)
    // 3: Y (向き変更)
    // 4: L1 (マップ切替)
    // 5: R1 (斜め固定)
    // 6: L2
    // 7: R2 (足踏み)
    // 8: Select (マップ)
    // 9: Start (メニュー)
    // 12: D-Pad Up, 13: Down, 14: Left, 15: Right

    // 斜めロック状態 (R1 または R2)
    this.isDiagonalLock = isPressed(5) || this.keys.has('KeyR');
    // 向き変更状態 (Yボタン または Alt)
    this.isFacingLock = isPressed(3) || this.keys.has('KeyC') || this.keys.has('AltLeft');
    // ダッシュホールド (Bボタン または Xキー)
    this.isDashHolding = isPressed(1) || this.keys.has('KeyX') || this.keys.has('ShiftLeft');

    // ワンショットボタントリガー
    const checkTrigger = (btnIdx, actionType) => {
      const pressed = isPressed(btnIdx);
      const wasPressed = !!this.gamepadButtonStates[btnIdx];
      if (pressed && !wasPressed) {
        this.queueAction({ type: actionType });
      }
      this.gamepadButtonStates[btnIdx] = pressed;
    };

    checkTrigger(0, 'ATTACK'); // Aボタン
    checkTrigger(2, 'TOGGLE_INVENTORY'); // Xボタン
    checkTrigger(4, 'TOGGLE_MAP'); // L1
    checkTrigger(8, 'TOGGLE_MAP'); // Select
    checkTrigger(7, 'REST'); // R2
    checkTrigger(9, 'TOGGLE_INVENTORY'); // Start

    // スティック＆D-Pad移動
    let stickX = pad.axes[0] || 0;
    let stickY = pad.axes[1] || 0;

    // D-Padの入力をアナログ値に上書き
    if (isPressed(14)) stickX = -1;
    if (isPressed(15)) stickX = 1;
    if (isPressed(12)) stickY = -1;
    if (isPressed(13)) stickY = 1;

    // デッドゾーン
    if (Math.abs(stickX) < this.gamepadDeadzone) stickX = 0;
    if (Math.abs(stickY) < this.gamepadDeadzone) stickY = 0;

    if (stickX !== 0 || stickY !== 0) {
      // 8方向に量子化
      const angle = Math.atan2(stickY, stickX);
      const octant = Math.round((8 * angle) / (2 * Math.PI) + 8) % 8;
      // 方向テーブルから取得
      const octantMap = [
        CONFIG.DIRECTIONS[2], // RIGHT
        CONFIG.DIRECTIONS[3], // DOWN_RIGHT
        CONFIG.DIRECTIONS[4], // DOWN
        CONFIG.DIRECTIONS[5], // DOWN_LEFT
        CONFIG.DIRECTIONS[6], // LEFT
        CONFIG.DIRECTIONS[7], // UP_LEFT
        CONFIG.DIRECTIONS[0], // UP
        CONFIG.DIRECTIONS[1], // UP_RIGHT
      ];
      const dir = octantMap[octant];

      this.gamepadRepeatTimer -= deltaMs;
      if (this.gamepadRepeatTimer <= 0) {
        this.gamepadRepeatTimer = this.gamepadRepeatDelay;
        this.triggerMovement(dir);
      }
    } else {
      this.gamepadRepeatTimer = 0;
    }
  }

  // 移動・方向転換・ダッシュコマンドの生成
  triggerMovement(direction) {
    if (!direction) return;

    // 斜め移動固定（Rボタン）有効時：斜め以外の入力を無視
    if (this.isDiagonalLock && !direction.isDiagonal) {
      return;
    }

    if (this.isFacingLock) {
      // その場で向き変更
      this.queueAction({
        type: 'CHANGE_DIRECTION',
        direction: direction,
      });
    } else if (this.isDashHolding) {
      // ダッシュ移動
      this.queueAction({
        type: 'DASH',
        direction: direction,
      });
    } else {
      // 通常の1歩移動
      this.queueAction({
        type: 'MOVE',
        direction: direction,
      });
    }
  }

  // dx, dyからCONFIG.DIRECTIONSの対応オブジェクトを取得
  findDirection(dx, dy) {
    const signX = Math.sign(dx);
    const signY = Math.sign(dy);
    return CONFIG.DIRECTIONS.find(d => d.dx === signX && d.dy === signY) || null;
  }

  // 外部（バーチャルパッド等）からアクション追加
  queueAction(action) {
    this.actionQueue.push(action);
  }

  // アクションを取り出す
  popAction() {
    return this.actionQueue.shift() || null;
  }

  clearQueue() {
    this.actionQueue.length = 0;
  }
}
