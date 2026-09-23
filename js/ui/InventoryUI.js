/**
 * SFC風アイテムウィンドウUI（インベントリメニュー ＆ コマンドポップアップ）
 */
export class InventoryUI {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.selectedIndex = 0;
    this.selectedCommandIndex = 0;
    this.isCommandSubmenuOpen = false;
    this.currentCommands = [];

    // DOM要素
    this.modalEl = document.getElementById('inventory-modal');
    this.listEl = document.getElementById('inventory-item-list');
    this.commandMenuEl = document.getElementById('inventory-command-menu');
    this.commandListEl = document.getElementById('inventory-command-list');
    this.descEl = document.getElementById('inventory-item-desc');
    this.capacityEl = document.getElementById('inventory-capacity');
    this.underfootBannerEl = document.getElementById('inventory-underfoot-banner');

    this.initEvents();
  }

  initEvents() {
    // 閉じるボタン
    const closeBtn = document.getElementById('inventory-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 足元アイテムを拾う（ワープ等でアイテムの上に着地した場合用）
    if (this.underfootBannerEl) {
      this.underfootBannerEl.addEventListener('click', (e) => {
        if (!e.target.closest('.underfoot-pickup-btn')) return;
        this.game.checkUnderfoot();
        this.render();
      });
    }
  }

  open() {
    this.isOpen = true;
    this.selectedIndex = 0;
    this.isCommandSubmenuOpen = false;
    this.modalEl.classList.remove('hidden');
    this.game.sound.playMenuSelect();
    this.render();
  }

  close() {
    this.isOpen = false;
    this.isCommandSubmenuOpen = false;
    this.modalEl.classList.add('hidden');
    this.commandMenuEl.classList.add('hidden');
    this.game.sound.playMenuCancel();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  render() {
    const items = this.game.inventory.items;
    this.listEl.innerHTML = '';

    // 容量表示
    if (this.capacityEl) {
      this.capacityEl.textContent = `${items.length} / ${this.game.inventory.capacity}`;
    }

    // 足元アイテムの有無確認
    const underfoot = this.game.getItemUnderfoot();
    if (this.underfootBannerEl) {
      if (underfoot) {
        this.underfootBannerEl.classList.remove('hidden');
        this.underfootBannerEl.innerHTML = `足元: <span class="text-amber-400">${underfoot.icon} ${underfoot.getDisplayName()}</span>
          <button type="button" class="underfoot-pickup-btn">拾う</button>`;
      } else {
        this.underfootBannerEl.classList.add('hidden');
      }
    }

    if (items.length === 0) {
      this.listEl.innerHTML = '<li class="empty-item">持ち物はありません</li>';
      if (this.descEl) this.descEl.textContent = 'アイテムを持っていません。ダンジョンを探索して入手しましょう。';
      return;
    }

    // アイテムリスト生成
    items.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = `inv-item-row ${idx === this.selectedIndex ? 'selected' : ''}`;
      
      const isEq = this.game.inventory.isEquipped(item);
      li.innerHTML = `
        <span class="inv-item-eq">${isEq ? '<b class="eq-badge">[E]</b>' : ''}</span>
        <span class="inv-item-icon">${item.icon}</span>
        <span class="inv-item-name" style="color: ${item.color}">${item.getDisplayName()}</span>
      `;

      // クリック操作
      li.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.openCommandSubmenu();
      });

      this.listEl.appendChild(li);
    });

    this.updateDescription();
  }

  updateDescription() {
    const items = this.game.inventory.items;
    const item = items[this.selectedIndex];
    if (item && this.descEl) {
      this.descEl.textContent = item.desc || item.name;
    }
  }

  // コマンドサブメニューを開く
  openCommandSubmenu() {
    const items = this.game.inventory.items;
    const item = items[this.selectedIndex];
    if (!item) return;

    this.currentCommands = this.game.inventory.getAvailableCommands(item);
    this.selectedCommandIndex = 0;
    this.isCommandSubmenuOpen = true;

    this.commandListEl.innerHTML = '';
    this.currentCommands.forEach((cmd, idx) => {
      const btn = document.createElement('button');
      btn.className = `command-btn ${idx === this.selectedCommandIndex ? 'selected' : ''}`;
      btn.textContent = cmd.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeCommand(cmd.id);
      });
      this.commandListEl.appendChild(btn);
    });

    this.commandMenuEl.classList.remove('hidden');
    this.game.sound.playMenuSelect();
  }

  closeCommandSubmenu() {
    this.isCommandSubmenuOpen = false;
    this.commandMenuEl.classList.add('hidden');
    this.game.sound.playMenuCancel();
  }

  // コマンド実行
  executeCommand(cmdId) {
    const items = this.game.inventory.items;
    const item = items[this.selectedIndex];
    if (!item) return;

    this.close();

    // 眠り・金縛り中はアイテムを使えない（説明を見るだけは可）
    if (cmdId !== 'info' && !this.game.player.canAct()) {
      this.game.addLog('体が動かず、アイテムを使えない！', 'warning');
      return;
    }

    switch (cmdId) {
      case 'equip':
      case 'unequip':
        const res = this.game.inventory.equip(item);
        this.game.sound.playMenuSelect();
        this.game.addLog(res.equipped ? `${item.name}を装備した！` : `${item.name}を外した。`, 'normal');
        this.game.processTurn();
        break;

      case 'eat':
        this.game.itemEffects.useFood(item, this.game.player);
        this.game.processTurn();
        break;

      case 'drink':
        this.game.itemEffects.useHerb(item, this.game.player);
        this.game.processTurn();
        break;

      case 'read':
        this.game.itemEffects.useScroll(item, this.game.player);
        this.game.processTurn();
        break;

      case 'wave':
        this.game.itemEffects.useStaff(item, this.game.player);
        this.game.processTurn();
        break;

      case 'shoot':
        this.game.itemEffects.useShoot(item, this.game.player);
        this.game.processTurn();
        break;

      case 'throw':
        this.game.itemEffects.throwItem(item, this.game.player);
        this.game.processTurn();
        break;

      case 'drop':
        if (this.game.getItemUnderfoot()) {
          this.game.addLog('足元にはすでにアイテムがあるので置けない。', 'warning');
          break;
        }
        this.game.inventory.removeItem(item);
        item.x = this.game.player.x;
        item.y = this.game.player.y;
        this.game.droppedItems.push(item);
        this.game.sound.playPickup();
        this.game.addLog(`${item.name}を足元に置いた。`, 'normal');
        this.game.processTurn();
        break;

      case 'info':
        this.game.addLog(`【${item.name}】${item.desc}`, 'normal');
        break;
    }
  }

  // キー操作ハンドリング
  handleInput(dir, isConfirm, isCancel) {
    if (!this.isOpen) return false;

    if (isCancel) {
      if (this.isCommandSubmenuOpen) {
        this.closeCommandSubmenu();
      } else {
        this.close();
      }
      return true;
    }

    if (this.isCommandSubmenuOpen) {
      // コマンドサブメニューの操作
      if (dir) {
        if (dir.dy > 0 || dir.dx > 0) {
          this.selectedCommandIndex = (this.selectedCommandIndex + 1) % this.currentCommands.length;
          this.game.sound.playStep();
          this.updateCommandMenuSelection();
        } else if (dir.dy < 0 || dir.dx < 0) {
          this.selectedCommandIndex = (this.selectedCommandIndex - 1 + this.currentCommands.length) % this.currentCommands.length;
          this.game.sound.playStep();
          this.updateCommandMenuSelection();
        }
      }
      if (isConfirm) {
        const cmd = this.currentCommands[this.selectedCommandIndex];
        if (cmd) this.executeCommand(cmd.id);
      }
      return true;
    }

    // アイテム一覧の選択操作
    const items = this.game.inventory.items;
    if (items.length === 0) return true;

    if (dir) {
      if (dir.dy > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % items.length;
        this.game.sound.playStep();
        this.render();
      } else if (dir.dy < 0) {
        this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length;
        this.game.sound.playStep();
        this.render();
      }
    }

    if (isConfirm) {
      this.openCommandSubmenu();
    }

    return true;
  }

  updateCommandMenuSelection() {
    const btns = this.commandListEl.querySelectorAll('.command-btn');
    btns.forEach((b, idx) => {
      if (idx === this.selectedCommandIndex) {
        b.classList.add('selected');
        b.focus();
      } else {
        b.classList.remove('selected');
      }
    });
  }
}
