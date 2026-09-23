/**
 * メインエントリーポイント
 */
import { Game } from './engine/Game.js?v=20260924_10';

// これより短い間隔の2回目のタップはダブルタップ（拡大）とみなして抑止する (ms)
const DOUBLE_TAP_INTERVAL = 350;
// この拡大率を超えたら「元のサイズに戻す」ボタンを出す
const ZOOM_DETECT_SCALE = 1.02;
// 戻すボタンを表示する位置（見えている画面の左上からの余白 px）
const ZOOM_RESET_MARGIN = 8;
// viewport 設定を書き換えてから元に戻すまでの待ち時間 (ms)
const VIEWPORT_RESTORE_DELAY = 50;

// 何らかの理由でページが拡大されてしまった時に、元のサイズへ戻すボタンを用意する
function setupZoomResetButton() {
  const vv = window.visualViewport;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!vv || !meta) return;

  const btn = document.createElement('button');
  btn.id = 'zoom-reset-btn';
  btn.type = 'button';
  btn.className = 'hidden';
  btn.textContent = '🔍 元のサイズに戻す';
  document.body.appendChild(btn);

  // 拡大中は見えている範囲の左上に、拡大率に関係なく同じ大きさで表示する
  const update = () => {
    const isZoomed = vv.scale > ZOOM_DETECT_SCALE;
    btn.classList.toggle('hidden', !isZoomed);
    if (!isZoomed) return;
    btn.style.left = `${vv.offsetLeft + ZOOM_RESET_MARGIN / vv.scale}px`;
    btn.style.top = `${vv.offsetTop + ZOOM_RESET_MARGIN / vv.scale}px`;
    btn.style.transform = `scale(${1 / vv.scale})`;
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();

  // viewport の設定を一度変えてから戻すと、iOS Safari は拡大率を初期値(1倍)に戻す
  btn.addEventListener('click', () => {
    const original = meta.getAttribute('content');
    meta.setAttribute('content', `${original}, minimum-scale=1.0`);
    window.scrollTo(0, 0);
    setTimeout(() => {
      meta.setAttribute('content', original);
      update();
    }, VIEWPORT_RESTORE_DELAY);
  });
}

function preventIOSZoom() {
  // ピンチ拡大（iOS 独自の gesture イベント）
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  // ボタン以外の場所（パッドの隙間など）でのダブルタップ拡大。
  // ボタン上で止めると2回目のクリックが消えるため、ボタン類は CSS の touch-action に任せる
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const isControl = e.target.closest('button, a, input, select, textarea, li');
    if (!isControl && now - lastTouchEnd <= DOUBLE_TAP_INTERVAL) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
}

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const game = new Game();
  game.init(canvas);

  // ヘルプモーダル
  const helpModal = document.getElementById('help-modal');
  const openHelpBtn = document.getElementById('btn-open-help');
  const closeHelpBtn = document.getElementById('btn-close-help');

  if (openHelpBtn && helpModal) {
    openHelpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
      game.sound.playMenuSelect();
    });
  }
  if (closeHelpBtn && helpModal) {
    closeHelpBtn.addEventListener('click', () => {
      helpModal.classList.add('hidden');
      game.sound.playMenuCancel();
    });
  }

  // サウンドミュート切替
  const soundBtn = document.getElementById('btn-toggle-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const isMuted = game.sound.toggleMute();
      soundBtn.textContent = isMuted ? '🔇 消音中' : '🔊 音声ON';
    });
  }

  // ログ履歴モーダル（スマホでは展開ボタンを隠すため、ログ本体のタップでも開く）
  const logWindowEl = document.querySelector('.log-window');
  const closeHistoryBtn = document.getElementById('btn-close-log-history');
  if (logWindowEl) {
    logWindowEl.addEventListener('click', () => game.hud.toggleHistory());
  }
  if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', () => game.hud.toggleHistory());
  }

  // ゲームパッド接続状態の検知
  const padStatusEl = document.getElementById('gamepad-status-badge');
  window.addEventListener('gamepad-status-change', (e) => {
    if (!padStatusEl) return;
    if (e.detail.connected) {
      padStatusEl.textContent = '🎮 コントローラー接続済';
      padStatusEl.classList.remove('hidden');
      game.addLog('ゲームパッドが接続されました！', 'accent');
    } else {
      padStatusEl.classList.add('hidden');
    }
  });

  // HUDに覆われる上下領域をレンダラーへ通知し、プレイヤーを見える範囲の中央に表示する
  const topHudEl = document.getElementById('top-hud');
  const bottomHudEl = document.getElementById('bottom-hud');
  const syncViewInsets = () => {
    const canvasRect = canvas.getBoundingClientRect();
    const top = Math.max(0, topHudEl.getBoundingClientRect().bottom - canvasRect.top);
    const bottom = Math.max(0, canvasRect.bottom - bottomHudEl.getBoundingClientRect().top);
    game.renderer.setViewInsets(top, bottom);
  };
  syncViewInsets();
  window.addEventListener('resize', syncViewInsets);
  new ResizeObserver(syncViewInsets).observe(bottomHudEl);
  const vpadHideBtn = document.getElementById('btn-toggle-vpad-hide');
  if (vpadHideBtn) vpadHideBtn.addEventListener('click', syncViewInsets);

  // iOS Safari の拡大操作を抑止する
  // （iOS 10 以降の Safari は viewport の user-scalable=no を無視するため、
  //   パッドの隙間を素早く連打するとダブルタップ拡大され、元のサイズに戻せなくなっていた）
  preventIOSZoom();
  setupZoomResetButton();

  // グローバル露出（デバッグ・テスト用）
  window.__ROGUE_GAME__ = game;
});
