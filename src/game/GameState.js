import { Creature } from './Creature.js';
import { SAVE_KEY } from './constants.js';
import { SPECIES, randomName } from '../data/creatures.js';

// Owns the whole save-able game: the collection of creatures, which one is
// active, and the set of species the player has discovered. Persists to
// localStorage and applies offline decay when a save is loaded.
export class GameState {
  constructor() {
    this.creatures = [];
    this.activeId = null;
    this.discovered = new Set();
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  get active() {
    return this.creatures.find((c) => c.id === this.activeId) || null;
  }

  setActive(id) {
    this.activeId = id;
    this.save();
    this.emit();
  }

  hatch(speciesId, name) {
    const creature = new Creature({
      speciesId,
      name: name || randomName(),
      xp: 0
    });
    this.creatures.push(creature);
    this.discovered.add(speciesId);
    this.activeId = creature.id;
    this.save();
    this.emit();
    return creature;
  }

  release(id) {
    this.creatures = this.creatures.filter((c) => c.id !== id);
    if (this.activeId === id) {
      this.activeId = this.creatures[0]?.id ?? null;
    }
    this.save();
    this.emit();
  }

  // Advance every creature's simulation. Active creature is emphasised but all
  // owned creatures decay so the collection feels alive.
  tick(dtSeconds) {
    for (const c of this.creatures) c.tick(dtSeconds);
  }

  discoveredCount() {
    return this.discovered.size;
  }

  isDiscovered(speciesId) {
    return this.discovered.has(speciesId);
  }

  save() {
    try {
      const payload = {
        version: 1,
        savedAt: Date.now(),
        activeId: this.activeId,
        discovered: [...this.discovered],
        creatures: this.creatures.map((c) => c.toJSON())
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.warn('Save failed:', err);
      return false;
    }
  }

  load() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      console.warn('Load failed:', err);
      return false;
    }
    if (!raw) return false;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn('Corrupt save, ignoring:', err);
      return false;
    }

    this.creatures = (data.creatures || [])
      .filter((c) => SPECIES[c.speciesId])
      .map((c) => new Creature(c));
    this.discovered = new Set((data.discovered || []).filter((id) => SPECIES[id]));
    this.activeId = data.activeId && this.creatures.some((c) => c.id === data.activeId)
      ? data.activeId
      : this.creatures[0]?.id ?? null;

    // Apply offline progress (capped so a long absence doesn't wipe everyone out).
    const now = Date.now();
    for (const c of this.creatures) {
      const elapsed = Math.min((now - (c.lastTick || now)) / 1000, 60 * 60 * 6); // cap 6h
      c.tick(elapsed);
    }
    return this.creatures.length > 0;
  }

  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  wipe() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.creatures = [];
    this.activeId = null;
    this.discovered = new Set();
    this.emit();
  }
}
