/**
 * 画面上バーチャル十字キー（D-Pad）＆ジョイスティック＆SFCアクションボタン
 */
import { CONFIG } from '../config.js?v=20260924_7';

// ボタン長押し時の連続入力：最初のリピートまでの待ち時間と、その後の間隔 (ms)
const HOLD_REPEAT_DELAY = 280;
const HOLD_REPEAT_INTERVAL = 150;
// ジョイスティック：連続移動の間隔 (ms) とデッドゾーン (px)
const JOYSTICK_REPEAT_INTERVAL = 160;
const JOYSTICK_DEADZONE = 15;

// 押した瞬間に fire し、押し続けている間は一定間隔で fire し続ける
function bindHoldRepeat(el, fire) {
  let delayTimer = null;
  let repeatTimer = null;

  const release = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
  };

  const press = (e) => {
    e.preventDefault();
    e.stopPropagation();
    release();
    fire();
    delayTimer = setTimeout(() => {
      repeatTimer = setInterval(fire, HOLD_REPEAT_INTERVAL);
    }, HOLD_REPEAT_DELAY);
  };

  el.addEventListener('touchstart', press, { passive: false });
  el.addEventListener('mousedown', press);
  for (const type of ['touchend', 'touchcancel', 'mouseup', 'mouseleave']) {
    el.addEventListener(type, release);
  }
}

export class VirtualPad {
  constructor(inputManager) {
    this.input = inputManager;
    this.mode = 'dpad'; // 'dpad' or 'joystick'
    this.isVisible = true;

    // DOM要素
    this.containerEl = document.getElementById('virtual-controls-container');
    this.dpadEl = document.getElementById('vpad-dpad');
    this.joystickEl = document.getElementById('vpad-joystick');
    this.stickKnobEl = document.getElementById('joystick-knob');
    this.toggleModeBtn = document.getElementById('btn-toggle-vpad-mode');
    this.toggleHideBtn = document.getElementById('btn-toggle-vpad-hide');

    this.initButtons();
    this.initJoystick();
  }

  initButtons() {
    // 8方向十字キーボタン
    const dpadButtons = document.querySelectorAll('[data-vdir]');
    dpadButtons.forEach(btn => {
      const dirIndex = parseInt(btn.dataset.vdir, 10);
      const dir = CONFIG.DIRECTIONS[dirIndex];
      // 押しっぱなしで歩き続けられるようにする
      bindHoldRepeat(btn, () => this.input.triggerMovement(dir));
    });

    // SFCアクションボタン
    const bindAction = (id, actionType) => {
      const el = document.getElementById(id);
      if (!el) return;
      const trigger = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.queueAction({ type: actionType });
      };
      el.addEventListener('touchstart', trigger, { passive: false });
      el.addEventListener('mousedown', trigger);
    };

    bindAction('vbtn-attack', 'ATTACK'); // Aボタン
    bindAction('vbtn-dash', 'DASH');     // Bボタン
    bindAction('vbtn-item', 'TOGGLE_INVENTORY'); // Xボタン
    // 足踏み：押しっぱなしで連続ターン送り
    const restBtn = document.getElementById('vbtn-rest');
    if (restBtn) bindHoldRepeat(restBtn, () => this.input.queueAction({ type: 'REST' }));
    bindAction('vbtn-map', 'TOGGLE_MAP'); // マップ切替

    // Yボタン（向き変更トグル/ホールド）
    const yBtn = document.getElementById('vbtn-face');
    if (yBtn) {
      yBtn.addEventListener('click', () => {
        this.input.isFacingToggled = !this.input.isFacingToggled;
        yBtn.classList.toggle('active', this.input.isFacingToggled);
      });
    }

    // Rボタン（斜め移動固定トグル）
    const rBtn = document.getElementById('vbtn-diagonal');
    if (rBtn) {
      rBtn.addEventListener('click', () => {
        this.input.isDiagonalToggled = !this.input.isDiagonalToggled;
        rBtn.classList.toggle('active', this.input.isDiagonalToggled);
      });
    }

    // D-Pad / ジョイスティック切替
    if (this.toggleModeBtn) {
      this.toggleModeBtn.addEventListener('click', () => {
        this.mode = this.mode === 'dpad' ? 'joystick' : 'dpad';
        this.updateModeDisplay();
      });
    }

    // バーチャルコントローラー自体の表示/非表示切替
    // （.hidden だと再表示ボタンごと消えるため、ボタンだけ残す .collapsed を使う）
    if (this.toggleHideBtn) {
      this.toggleHideBtn.addEventListener('click', () => {
        this.isVisible = !this.isVisible;
        this.containerEl.classList.toggle('collapsed', !this.isVisible);
        this.toggleHideBtn.textContent = this.isVisible ? '🎮 パッド隠す' : '🎮 パッド表示';
      });
    }
  }

  updateModeDisplay() {
    if (this.mode === 'dpad') {
      this.dpadEl.classList.remove('hidden');
      this.joystickEl.classList.add('hidden');
      if (this.toggleModeBtn) this.toggleModeBtn.textContent = '🕹️ スティック切替';
    } else {
      this.dpadEl.classList.add('hidden');
      this.joystickEl.classList.remove('hidden');
      if (this.toggleModeBtn) this.toggleModeBtn.textContent = '➕ 十字キー切替';
    }
  }

  // アナログジョイスティックのドラッグ判定
  initJoystick() {
    if (!this.joystickEl || !this.stickKnobEl) return;

    let isDragging = false;
    let baseRect = null;
    let joyTimer = null;
    let touchId = null; // スティックを操作している指（他の指のボタン操作と混同しない）

    // イベントからスティック操作中の指の座標を取り出す（該当する指が無ければ null）
    const getPoint = (e) => {
      if (!e.changedTouches) return e;
      return Array.from(e.touches).find(t => t.identifier === touchId) || null;
    };

    const startDrag = (e) => {
      e.preventDefault();
      isDragging = true;
      touchId = e.changedTouches ? e.changedTouches[0].identifier : null;
      baseRect = this.joystickEl.getBoundingClientRect();
      handleMove(e);

      // ジョイスティック傾け中の連続移動ループ
      if (joyTimer) clearInterval(joyTimer);
      joyTimer = setInterval(() => {
        if (isDragging && this.currentJoyDir) {
          this.input.triggerMovement(this.currentJoyDir);
        }
      }, JOYSTICK_REPEAT_INTERVAL);
    };

    const handleMove = (e) => {
      if (!isDragging || !baseRect) return;
      const point = getPoint(e);
      if (!point) return;
      const clientX = point.clientX;
      const clientY = point.clientY;

      const centerX = baseRect.left + baseRect.width / 2;
      const centerY = baseRect.top + baseRect.height / 2;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);
      const maxRadius = baseRect.width / 2 - 16;

      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }

      this.stickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;

      // デッドゾーン
      if (dist > JOYSTICK_DEADZONE) {
        const angle = Math.atan2(dy, dx);
        const octant = Math.round((8 * angle) / (2 * Math.PI) + 8) % 8;
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
        this.currentJoyDir = octantMap[octant];
      } else {
        this.currentJoyDir = null;
      }
    };

    const endDrag = (e) => {
      if (!isDragging) return;
      // 別の指（Aボタン等）を離しただけならスティック操作は継続
      if (e && e.changedTouches && !Array.from(e.changedTouches).some(t => t.identifier === touchId)) return;
      isDragging = false;
      touchId = null;
      this.currentJoyDir = null;
      this.stickKnobEl.style.transform = 'translate(0px, 0px)';
      if (joyTimer) {
        clearInterval(joyTimer);
        joyTimer = null;
      }
    };

    this.joystickEl.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', endDrag);
    window.addEventListener('touchcancel', endDrag);

    this.joystickEl.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', endDrag);
  }
}
