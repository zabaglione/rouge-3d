/**
 * 画面上部ステータスHUD ＆ 画面下部メッセージログ管理
 */
export class HUD {
  constructor() {
    // 上部ステータスDOM
    this.floorEl = document.getElementById('hud-floor');
    this.hpTextEl = document.getElementById('hud-hp-text');
    this.hpBarEl = document.getElementById('hud-hp-bar');
    this.hungerTextEl = document.getElementById('hud-hunger-text');
    this.hungerBarEl = document.getElementById('hud-hunger-bar');
    this.lvEl = document.getElementById('hud-lv');
    this.expBarEl = document.getElementById('hud-exp-bar');
    this.atkEl = document.getElementById('hud-atk');
    this.defEl = document.getElementById('hud-def');
    this.goldEl = document.getElementById('hud-gold');
    this.facingEl = document.getElementById('hud-facing');
    this.modeBadgesEl = document.getElementById('hud-mode-badges');

    // 下部ログDOM
    this.logContainerEl = document.getElementById('log-messages');
    this.logHistoryModalEl = document.getElementById('log-history-modal');
    this.logHistoryListEl = document.getElementById('log-history-list');

    this.logs = []; // ログ履歴
    this.maxLogs = 80;
  }

  // 毎フレームまたは状態変化時にステータスを更新
  updateStatus(game) {
    const player = game.player;
    const inventory = game.inventory;

    // 階層
    if (this.floorEl) this.floorEl.textContent = `地下 ${game.currentFloor} 階`;

    // HP
    if (this.hpTextEl && this.hpBarEl) {
      this.hpTextEl.textContent = `${player.hp} / ${player.maxHp}`;
      const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      this.hpBarEl.style.width = `${hpPct}%`;

      // ピンチ演出
      if (hpPct <= 25) {
        this.hpBarEl.classList.add('danger-pulse');
      } else {
        this.hpBarEl.classList.remove('danger-pulse');
      }
    }

    // 満腹度（食料）
    if (this.hungerTextEl && this.hungerBarEl) {
      this.hungerTextEl.textContent = `${player.hunger} %`;
      const hungerPct = Math.max(0, Math.min(100, player.hunger));
      this.hungerBarEl.style.width = `${hungerPct}%`;

      if (hungerPct <= 15) {
        this.hungerBarEl.classList.add('starving-pulse');
      } else {
        this.hungerBarEl.classList.remove('starving-pulse');
      }
    }

    // Lv, 攻防, ゴールド
    if (this.lvEl) this.lvEl.textContent = `Lv.${player.lv}`;
    if (this.atkEl) this.atkEl.textContent = player.getTotalAtk(inventory);
    if (this.defEl) this.defEl.textContent = player.getTotalDef(inventory);
    if (this.goldEl) this.goldEl.textContent = `${player.gold} G`;

    // 向きインジケータ
    if (this.facingEl) {
      this.facingEl.textContent = player.facing.label;
    }

    // モードバッジ（斜め固定、向き変更モード）
    if (this.modeBadgesEl) {
      let badges = '';
      if (game.input.isDiagonalLock) {
        badges += '<span class="badge badge-diagonal">斜め固定中 [R]</span>';
      }
      if (game.input.isFacingLock) {
        badges += '<span class="badge badge-facing">向き変更中 [C/Y]</span>';
      }
      this.modeBadgesEl.innerHTML = badges;
    }
  }

  // ログの追加
  addLog(message, type = 'normal') {
    const entry = { text: message, type, time: Date.now() };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 画面下部ログエリアへ追加
    if (this.logContainerEl) {
      const msgDiv = document.createElement('div');
      msgDiv.className = `log-entry log-${type} animate-fade-in`;
      msgDiv.textContent = message;

      this.logContainerEl.appendChild(msgDiv);

      // 最新ログ3行程度を残して古いものをフェードアウト
      while (this.logContainerEl.children.length > 3) {
        this.logContainerEl.removeChild(this.logContainerEl.firstChild);
      }
    }
  }

  // ログ全履歴モーダルの開閉
  toggleHistory() {
    if (!this.logHistoryModalEl) return;
    const isHidden = this.logHistoryModalEl.classList.contains('hidden');
    if (isHidden) {
      this.renderHistory();
      this.logHistoryModalEl.classList.remove('hidden');
    } else {
      this.logHistoryModalEl.classList.add('hidden');
    }
  }

  renderHistory() {
    if (!this.logHistoryListEl) return;
    this.logHistoryListEl.innerHTML = '';
    for (const log of this.logs) {
      const li = document.createElement('li');
      li.className = `log-${log.type}`;
      li.textContent = log.text;
      this.logHistoryListEl.appendChild(li);
    }
    this.logHistoryListEl.scrollTop = this.logHistoryListEl.scrollHeight;
  }
}
