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
    this._wirePetting();
    this._wireTopbar();
    this._modalClosable = true;
    this.modalRoot.addEventListener('click', (e) => {
      if (this._modalClosable && e.target === this.modalRoot) this._closeModal();
    });

    this.game.onChange(() => this.refresh());

    this._initOverlays();
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
    if (!this._petHintShown) {
      this._petHintShown = true;
      this.toast('Stroke your creature with the mouse to pet it. 🖐️');
    }
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
    // feed / water / clean are hands-on: they spawn a tool you drag onto the
    // creature. The rest (play / train / sleep) stay as instant button actions.
    const GESTURE = { feed: '🍎', water: '🥣', clean: '🧽' };
    this.careDock.querySelectorAll('.care-btn').forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (action === 'clean') this._startClean();
        else if (GESTURE[action]) this._startTool(action, GESTURE[action]);
        else this.doCare(action);
      });
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

  // Pet by stroking the creature with the pointer. Accumulated pointer travel
  // while hovering the creature fills a "stroke"; each completed stroke applies
  // the pet care action, with a short cooldown so fast dragging can't spam it.
  _wirePetting() {
    const canvas = this.scene.canvas;
    const STROKE_DISTANCE = 240; // px of travel over the creature per pet
    const COOLDOWN_MS = 350;
    let stroking = false;
    let lastX = 0;
    let lastY = 0;
    let travel = 0;
    let lastPet = 0;

    const onDown = (e) => {
      if (!this.game.active) return;
      if (!this.scene.pointerOverCreature(e.clientX, e.clientY)) return;
      stroking = true;
      lastX = e.clientX;
      lastY = e.clientY;
      travel = 0;
      canvas.classList.add('petting');
    };

    const onMove = (e) => {
      if (!stroking) return;
      const over = this.scene.pointerOverCreature(e.clientX, e.clientY);
      canvas.classList.toggle('petting', over);
      if (!over) {
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      travel += Math.hypot(dx, dy);
      this._spawnHeart(e.clientX, e.clientY, 0.35);

      if (travel >= STROKE_DISTANCE && Date.now() - lastPet >= COOLDOWN_MS) {
        travel = 0;
        lastPet = Date.now();
        this._petStroke(e.clientX, e.clientY);
      }
    };

    const onUp = () => {
      stroking = false;
      canvas.classList.remove('petting');
    };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  // One completed pet stroke: reward + feedback.
  _petStroke(x, y) {
    const c = this.game.active;
    if (!c) return;
    const res = c.applyCare('pet');
    if (!res.ok) return;
    this.scene.playReaction('bounce');
    this._spawnHeart(x, y, 1);
    this.game.save();
    this.refresh();
    if (res.evolved) {
      this.toast(`🎉 ${c.name} evolved into a ${STAGE_LABELS[res.evolved]}!`);
      this.scene.playReaction('spin');
    }
  }

  // Floating heart particle at screen coordinates. `scale` shrinks trail hearts.
  _spawnHeart(x, y, scale = 1) {
    const heart = document.createElement('div');
    heart.className = 'pet-heart';
    heart.textContent = '💗';
    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.style.fontSize = `${18 * scale}px`;
    document.getElementById('app').appendChild(heart);
    setTimeout(() => heart.remove(), 900);
  }

  // ---- hands-on tools (feed / water) ---------------------------------------
  // Spawns a tool emoji you drag onto the creature. Dropping it over the
  // creature applies the matching care action.
  _startTool(action, emoji) {
    const c = this.game.active;
    if (!c) return;
    this._dismissTool();

    const layer = document.createElement('div');
    layer.className = 'tool-layer';
    const tool = document.createElement('div');
    tool.className = 'care-tool';
    tool.textContent = emoji;
    const cancel = document.createElement('button');
    cancel.className = 'tool-cancel';
    cancel.textContent = '✕';
    layer.append(tool, cancel);
    document.getElementById('app').appendChild(layer);
    this._toolLayer = layer;

    const circle = this.scene.creatureScreenCircle();
    const startX = circle ? circle.x : window.innerWidth / 2;
    const startY = circle ? circle.y + circle.r + 96 : window.innerHeight * 0.72;
    const place = (x, y) => {
      tool.style.left = `${x}px`;
      tool.style.top = `${y}px`;
    };
    place(startX, startY);
    const verb = action === 'feed' ? 'feed' : 'give it a drink';
    this.toast(`Drag the ${emoji} onto your creature to ${verb}.`);

    let dragging = false;
    let ox = 0;
    let oy = 0;
    const onDown = (e) => {
      dragging = true;
      const r = tool.getBoundingClientRect();
      ox = e.clientX - (r.left + r.width / 2);
      oy = e.clientY - (r.top + r.height / 2);
      tool.classList.add('grabbed');
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      place(e.clientX - ox, e.clientY - oy);
      tool.classList.toggle('over', this.scene.pointerOverCreature(e.clientX, e.clientY));
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      tool.classList.remove('grabbed', 'over');
      if (this.scene.pointerOverCreature(e.clientX, e.clientY)) {
        this._applyToolCare(action, e.clientX, e.clientY);
        this._dismissTool();
      } else {
        place(startX, startY); // snap back for another try
      }
    };

    tool.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cancel.addEventListener('click', () => this._dismissTool());
    this._toolCleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  _applyToolCare(action, x, y) {
    const c = this.game.active;
    if (!c) return;
    const res = c.applyCare(action);
    if (!res.ok) {
      this.toast(res.reason);
      return;
    }
    this._reactTo(action, res);
    this.game.save();
    this.refresh();
    this._spawnHeart(x, y, 1);
    if (res.evolved) {
      this.toast(`🎉 ${c.name} evolved into a ${STAGE_LABELS[res.evolved]}!`);
      this.scene.playReaction('spin');
    } else {
      const def = CARE_ACTIONS[action];
      const fav = res.favourite ? ' (favourite! ✨)' : '';
      this.toast(`${def.label} · +${res.xp} XP${fav}`);
    }
  }

  _dismissTool() {
    if (this._toolCleanup) this._toolCleanup();
    this._toolCleanup = null;
    if (this._toolLayer) this._toolLayer.remove();
    this._toolLayer = null;
  }

  // ---- cleaning (sponge + dirt) --------------------------------------------
  _startClean() {
    const c = this.game.active;
    if (!c) return;
    this._dismissTool();

    // Guarantee something to scrub: top the creature up with grime specks.
    this._cleaning = true;
    while (this._dirt.length < 8) this._addSpeck();

    const layer = document.createElement('div');
    layer.className = 'tool-layer';
    const sponge = document.createElement('div');
    sponge.className = 'care-tool sponge';
    sponge.textContent = '🧽';
    const cancel = document.createElement('button');
    cancel.className = 'tool-cancel';
    cancel.textContent = '✕';
    layer.append(sponge, cancel);
    document.getElementById('app').appendChild(layer);
    this._toolLayer = layer;
    this.toast('Scrub the sponge over your creature to wash off the grime.');

    const place = (x, y) => {
      sponge.style.left = `${x}px`;
      sponge.style.top = `${y}px`;
    };
    const circle = this.scene.creatureScreenCircle();
    place(circle ? circle.x : window.innerWidth / 2, circle ? circle.y + circle.r + 96 : window.innerHeight * 0.72);

    let scrubbing = false;
    const scrubAt = (x, y) => {
      this._scrubDirt(x, y);
      if (this._dirt.length === 0) this._finishClean();
    };
    const onDown = (e) => {
      scrubbing = true;
      sponge.classList.add('grabbed');
      place(e.clientX, e.clientY);
      if (this.scene.pointerOverCreature(e.clientX, e.clientY)) scrubAt(e.clientX, e.clientY);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!scrubbing) return;
      place(e.clientX, e.clientY);
      const over = this.scene.pointerOverCreature(e.clientX, e.clientY);
      sponge.classList.toggle('over', over);
      if (over) scrubAt(e.clientX, e.clientY);
    };
    const onUp = () => {
      scrubbing = false;
      sponge.classList.remove('grabbed', 'over');
    };
    sponge.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    cancel.addEventListener('click', () => {
      this._cleaning = false;
      this._dismissTool();
      this.refresh();
    });
    this._toolCleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }

  _finishClean() {
    const c = this.game.active;
    this._cleaning = false;
    this._dismissTool();
    if (!c) return;
    const res = c.applyCare('clean');
    this._reactTo('clean', res);
    this.game.save();
    this.refresh();
    if (res.ok) {
      const def = CARE_ACTIONS.clean;
      this.toast(`Squeaky clean! ${def.label} · +${res.xp} XP ✨`);
    }
  }

  // ---- dirt overlay ---------------------------------------------------------
  _initOverlays() {
    this._dirt = [];
    this._cleaning = false;
    this.dirtLayer = document.createElement('div');
    this.dirtLayer.id = 'dirt-layer';
    this.dirtLayer.setAttribute('aria-hidden', 'true');
    document.getElementById('app').appendChild(this.dirtLayer);

    const frame = () => {
      const circle = this.scene.creatureScreenCircle();
      if (circle && this._dirt.length) {
        for (const s of this._dirt) {
          s.el.style.left = `${circle.x + s.nx * circle.r * 0.82}px`;
          s.el.style.top = `${circle.y + s.ny * circle.r * 0.82}px`;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  _addSpeck() {
    // Random point inside the unit disk (sqrt keeps it uniform, not centre-heavy).
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random());
    const el = document.createElement('div');
    el.className = 'dirt-speck';
    const size = 8 + Math.random() * 10;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    this.dirtLayer.appendChild(el);
    this._dirt.push({ el, nx: Math.cos(a) * rad, ny: Math.sin(a) * rad });
  }

  _removeSpeck(speck) {
    speck.el.remove();
    this._dirt = this._dirt.filter((s) => s !== speck);
  }

  _scrubDirt(x, y) {
    const circle = this.scene.creatureScreenCircle();
    if (!circle) return;
    const radius = Math.max(34, circle.r * 0.32);
    for (const s of [...this._dirt]) {
      const sx = circle.x + s.nx * circle.r * 0.82;
      const sy = circle.y + s.ny * circle.r * 0.82;
      if (Math.hypot(sx - x, sy - y) <= radius) {
        this._removeSpeck(s);
        this._spawnHeart(sx, sy, 0.4);
      }
    }
  }

  // Match the number of grime specks to how dirty the creature is. Skipped
  // while actively cleaning so scrubbed-off dirt doesn't respawn mid-bath.
  _syncDirt() {
    if (this._cleaning) return;
    const c = this.game.active;
    if (!c) {
      while (this._dirt.length) this._removeSpeck(this._dirt[0]);
      return;
    }
    const MAX_SPECKS = 14;
    const dirtiness = Math.max(0, (70 - c.stats.cleanliness) / 70);
    const desired = Math.round(dirtiness * MAX_SPECKS);
    while (this._dirt.length < desired) this._addSpeck();
    while (this._dirt.length > desired) this._removeSpeck(this._dirt[this._dirt.length - 1]);
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
      const state = val > 55 ? 'good' : val > 25 ? 'warn' : 'bad';
      fill.classList.remove('good', 'warn', 'bad');
      fill.classList.add(state);
    });

    // Disable non-pet actions while an egg (eggs can only be kept warm/petted/fed).
    const eggAllowed = new Set(['pet', 'feed', 'water', 'clean', 'sleep']);
    this.careDock.querySelectorAll('.care-btn').forEach((btn) => {
      const a = btn.dataset.action;
      btn.disabled = c.stage === 'egg' && !eggAllowed.has(a);
    });

    this._syncDirt();
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
