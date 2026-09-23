/**
 * メインエントリーポイント
 */
import { Game } from './engine/Game.js?v=20260923_1';

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

  // ログ履歴モーダル
  const logExpandBtn = document.getElementById('btn-expand-logs');
  const closeHistoryBtn = document.getElementById('btn-close-log-history');
  if (logExpandBtn) {
    logExpandBtn.addEventListener('click', () => game.hud.toggleHistory());
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

  // グローバル露出（デバッグ・テスト用）
  window.__ROGUE_GAME__ = game;
});
