import { SPECIES, SPECIES_LIST, STAGE_LABELS, STAGE_XP } from '../data/creatures.js';
import { CARE_ACTIONS } from '../game/constants.js';
import { MINIGAMES } from '../minigames/MiniGames.js';

// Escapes user-supplied strings before insertion via innerHTML.
function esc(str) {
  return String(str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// Binds the DOM HUD to the GameState and SceneManager. Handles care buttons,
// stat bars, toasts, modals (roster / collection / hatch) and the start screen.
export class UI {
  constructor(game, scene) {
    this.game = game;
    this.scene = scene;

    this.topbar = document.getElementById('topbar');
    this.statsPanel = document.getElementById('stats-panel');
    this.careDock = document.getElementById('care-dock');
    this.modalRoot = document.getElementById('modal-root');
    this.toastWrap = document.getElementById('toast-wrap');

    this._wireCareButtons();
    this._wireTopbar();
    this._modalClosable = true;
    this.modalRoot.addEventListener('click', (e) => {
      if (this._modalClosable && e.target === this.modalRoot) this._closeModal();
    });

    this.game.onChange(() => this.refresh());
  }

  // ---- start / boot ---------------------------------------------------------
  showBoot() {
    const boot = document.createElement('div');
    boot.id = 'boot';
    const hasSave = this.game.hasSave();
    boot.innerHTML = `
      <div class="logo">🥚✨</div>
      <h1>CRITTER COVE</h1>
      <p>Raise glowing holographic creatures</p>
      <div class="row" style="justify-content:center">
        ${hasSave ? '<button class="btn" id="boot-continue">Continue</button>' : ''}
        <button class="btn ${hasSave ? 'secondary' : ''}" id="boot-new">New Creature</button>
      </div>
    `;
    document.getElementById('app').appendChild(boot);

    const remove = () => boot.remove();
    if (hasSave) {
      boot.querySelector('#boot-continue').addEventListener('click', () => {
        remove();
        this._enterGame();
      });
    }
    boot.querySelector('#boot-new').addEventListener('click', () => {
      remove();
      this.openHatch(true);
    });
  }

  _enterGame() {
    this.topbar.classList.remove('hidden');
    this.statsPanel.classList.remove('hidden');
    this.careDock.classList.remove('hidden');
    this.refresh();
  }

  // ---- hatch / species picker ----------------------------------------------
  openHatch(isFirst = false) {
    const cards = SPECIES_LIST.map((s) => {
      const known = this.game.isDiscovered(s.id);
      return `
        <div class="card" data-species="${s.id}">
          <div class="big">${s.emoji}</div>
          <div class="title">${s.name}</div>
          <div class="meta">${s.element}${known ? ' · seen' : ''}</div>
          <div class="meta" style="margin-top:6px">${s.blurb}</div>
        </div>`;
    }).join('');

    this._modal(`
      <h2>${isFirst ? 'Choose your first egg' : 'Hatch a new egg'}</h2>
      <p class="sub">Pick a species. Each has a personality that changes how it grows.</p>
      <div class="grid">${cards}</div>
    `, { closable: !isFirst });

    this.modalRoot.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => {
        const speciesId = card.dataset.species;
        this._promptName(speciesId, isFirst);
      });
    });
  }

  _promptName(speciesId, isFirst) {
    const def = SPECIES[speciesId];
    this._modal(`
      <h2>${def.emoji} Name your ${def.name}</h2>
      <p class="sub">Give your new companion a name (or leave blank for a random one).</p>
      <input class="field" id="name-input" maxlength="14" placeholder="e.g. Pixel" />
      <div class="row">
        <button class="btn secondary" id="name-back">Back</button>
        <button class="btn" id="name-go">Hatch! 🥚</button>
      </div>
    `, { closable: !isFirst });

    const input = this.modalRoot.querySelector('#name-input');
    input.focus();
    this.modalRoot.querySelector('#name-back').addEventListener('click', () => this.openHatch(isFirst));
    const go = () => {
      const name = input.value.trim();
      this.game.hatch(speciesId, name || undefined);
      this._closeModal();
      this._enterGame();
      this.toast(`A wild egg appeared! Care for it to hatch. ${def.emoji}`);
    };
    this.modalRoot.querySelector('#name-go').addEventListener('click', go);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  }

  // ---- roster ---------------------------------------------------------------
  openRoster() {
    if (this.game.creatures.length === 0) return this.openHatch(true);
    const cards = this.game.creatures.map((c) => {
      const active = c.id === this.game.activeId;
      return `
        <div class="card ${active ? '' : ''}" data-id="${c.id}" style="${active ? 'border-color:var(--accent)' : ''}">
          <div class="big">${c.stage === 'egg' ? '🥚' : c.def.emoji}</div>
          <div class="title">${esc(c.name)}</div>
          <div class="meta">${c.def.name} · ${STAGE_LABELS[c.stage]}</div>
          <div class="meta">Lv ${c.level} · ${active ? '★ active' : 'tap to select'}</div>
        </div>`;
    }).join('');

    this._modal(`
      <h2>My Creatures 🐾</h2>
      <p class="sub">${this.game.creatures.length} in your care. Tap one to make it active.</p>
      <div class="grid">${cards}</div>
      <div class="row">
        <button class="btn secondary" id="roster-release">Release active</button>
        <button class="btn" id="roster-hatch">Hatch new egg 🥚</button>
      </div>
    `);

    this.modalRoot.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => {
        this.game.setActive(card.dataset.id);
        this._closeModal();
        this.toast('Switched active creature.');
      });
    });
    this.modalRoot.querySelector('#roster-hatch').addEventListener('click', () => this.openHatch(false));
    this.modalRoot.querySelector('#roster-release').addEventListener('click', () => {
      const active = this.game.active;
      if (!active) return;
      if (confirm(`Release ${active.name}? This cannot be undone.`)) {
        this.game.release(active.id);
        this._closeModal();
        this.toast('Creature released to the wild. 🌿');
        if (this.game.creatures.length === 0) this.openHatch(true);
      }
    });
  }

  // ---- collection / pokedex -------------------------------------------------
  openCollection() {
    const cards = SPECIES_LIST.map((s) => {
      const known = this.game.isDiscovered(s.id);
      return `
        <div class="card ${known ? '' : 'locked'}">
          <div class="big">${known ? s.emoji : '❔'}</div>
          <div class="title">${known ? s.name : '???'}</div>
          <div class="meta">${known ? s.element : 'Undiscovered'}</div>
          <div class="meta" style="margin-top:6px">${known ? s.blurb : 'Hatch this species to reveal it.'}</div>
        </div>`;
    }).join('');

    this._modal(`
      <h2>Collection 📖</h2>
      <p class="sub">Discovered ${this.game.discoveredCount()} / ${SPECIES_LIST.length} species.</p>
      <div class="grid">${cards}</div>
    `);
  }

  // ---- care actions ---------------------------------------------------------
  _wireCareButtons() {
    this.careDock.querySelectorAll('.care-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.doCare(btn.dataset.action));
    });
  }

  async doCare(action) {
    const c = this.game.active;
    if (!c) return;

    const def = CARE_ACTIONS[action];
    let bonus = 1;

    // Play / train launch a mini-game whose performance boosts the reward.
    if (def.minigame && c.stage !== 'egg') {
      const result = await MINIGAMES[def.minigame]();
      bonus = result.bonus;
    }

    const res = c.applyCare(action, { bonus });
    if (!res.ok) {
      this.toast(res.reason);
      return;
    }

    // Reaction animation + feedback.
    this._reactTo(action, res);
    this.game.save();
    this.refresh();

    if (res.evolved) {
      this.toast(`🎉 ${c.name} evolved into a ${STAGE_LABELS[res.evolved]}!`);
      this.scene.playReaction('spin');
    } else {
      const fav = res.favourite ? ' (favourite! ✨)' : '';
      this.toast(`${def.label} · +${res.xp} XP${fav}`);
    }
  }

  _reactTo(action, res) {
    if (action === 'clean' || action === 'water') this.scene.playReaction('shake');
    else if (action === 'sleep') this.scene.setMood('sleep');
    else this.scene.playReaction('bounce');
  }

  // ---- topbar buttons -------------------------------------------------------
  _wireTopbar() {
    document.getElementById('btn-roster').addEventListener('click', () => this.openRoster());
    document.getElementById('btn-collection').addEventListener('click', () => this.openCollection());
    document.getElementById('btn-save').addEventListener('click', () => {
      this.game.save();
      this.toast('Game saved. 💾');
    });
  }

  // ---- render ---------------------------------------------------------------
  refresh() {
    const c = this.game.active;
    if (!c) return;

    // Swap 3D model if species/stage changed.
    this.scene.ensureCreature(c.speciesId, c.stage);
    this.scene.setMood(c.mood);

    document.getElementById('creature-emoji').textContent = c.stage === 'egg' ? '🥚' : c.def.emoji;
    document.getElementById('creature-name').textContent = c.name;
    document.getElementById('creature-species').textContent = `${c.def.name} · ${c.def.element}`;
    document.getElementById('stage-badge').textContent = STAGE_LABELS[c.stage];
    document.getElementById('level-label').textContent = `Lv ${c.level}`;
    document.getElementById('xp-fill').style.width = `${Math.round(c.stageProgress * 100)}%`;

    // Stat bars.
    this.statsPanel.querySelectorAll('.stat').forEach((row) => {
      const key = row.dataset.stat;
      const val = Math.round(c.stats[key]);
      const fill = row.querySelector('.bar-fill');
      fill.style.width = `${val}%`;
      fill.style.background = val > 55 ? 'var(--good)' : val > 25 ? 'var(--warn)' : 'var(--bad)';
    });

    // Disable non-pet actions while an egg (eggs can only be kept warm/petted/fed).
    const eggAllowed = new Set(['pet', 'feed', 'water', 'clean', 'sleep']);
    this.careDock.querySelectorAll('.care-btn').forEach((btn) => {
      const a = btn.dataset.action;
      btn.disabled = c.stage === 'egg' && !eggAllowed.has(a);
    });
  }

  // ---- helpers --------------------------------------------------------------
  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  _modal(html, { closable = true } = {}) {
    this._modalClosable = closable;
    this.modalRoot.classList.remove('hidden');
    this.modalRoot.innerHTML = `<div class="modal">${closable ? '<button class="modal-close">✕</button>' : ''}${html}</div>`;
    if (closable) {
      this.modalRoot.querySelector('.modal-close').addEventListener('click', () => this._closeModal());
    }
  }

  _closeModal() {
    this.modalRoot.classList.add('hidden');
    this.modalRoot.innerHTML = '';
  }
}
