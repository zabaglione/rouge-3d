/**
 * メインエントリーポイント
 */
import { Game } from './engine/Game.js?v=20260924_8';

// これより短い間隔の2回目のタップはダブルタップ（拡大）とみなして抑止する (ms)
const DOUBLE_TAP_INTERVAL = 350;

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

  // グローバル露出（デバッグ・テスト用）
  window.__ROGUE_GAME__ = game;
});
