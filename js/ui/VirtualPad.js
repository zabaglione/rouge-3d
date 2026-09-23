/**
 * 画面上バーチャル十字キー（D-Pad）＆ジョイスティック＆SFCアクションボタン
 */
import { CONFIG } from '../config.js';

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

      const handlePress = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.triggerMovement(dir);
      };

      btn.addEventListener('touchstart', handlePress, { passive: false });
      btn.addEventListener('mousedown', handlePress);
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
    bindAction('vbtn-rest', 'REST');     // 足踏み
    bindAction('vbtn-map', 'TOGGLE_MAP'); // マップ切替

    // Yボタン（向き変更トグル/ホールド）
    const yBtn = document.getElementById('vbtn-face');
    if (yBtn) {
      yBtn.addEventListener('click', () => {
        this.input.isFacingLock = !this.input.isFacingLock;
        yBtn.classList.toggle('active', this.input.isFacingLock);
      });
    }

    // Rボタン（斜め移動固定トグル）
    const rBtn = document.getElementById('vbtn-diagonal');
    if (rBtn) {
      rBtn.addEventListener('click', () => {
        this.input.isDiagonalLock = !this.input.isDiagonalLock;
        rBtn.classList.toggle('active', this.input.isDiagonalLock);
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
    if (this.toggleHideBtn) {
      this.toggleHideBtn.addEventListener('click', () => {
        this.isVisible = !this.isVisible;
        this.containerEl.classList.toggle('hidden', !this.isVisible);
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

    const startDrag = (e) => {
      isDragging = true;
      baseRect = this.joystickEl.getBoundingClientRect();
      handleMove(e);

      // ジョイスティック傾け中の連続移動ループ
      if (joyTimer) clearInterval(joyTimer);
      joyTimer = setInterval(() => {
        if (isDragging && this.currentJoyDir) {
          this.input.triggerMovement(this.currentJoyDir);
        }
      }, 160);
    };

    const handleMove = (e) => {
      if (!isDragging || !baseRect) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

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
      if (dist > 15) {
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

    const endDrag = () => {
      isDragging = false;
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

    this.joystickEl.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', endDrag);
  }
}
