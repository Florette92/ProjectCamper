import { SPECIES, stageForXp, STAGE_XP } from '../data/creatures.js';
import { BASE_DECAY, STAT_MAX, CARE_ACTIONS, NEED_STATS, EMPTY_BAR_PENALTY, levelForXp } from './constants.js';

let uidCounter = 0;
function uid() {
  return `c_${Date.now().toString(36)}_${(uidCounter++).toString(36)}`;
}

function clamp(v, lo = 0, hi = STAT_MAX) {
  return Math.max(lo, Math.min(hi, v));
}

// A single collected creature. Holds serializable state and the logic for
// stat decay over time, care actions, growth and health.
export class Creature {
  constructor(data) {
    this.id = data.id || uid();
    this.speciesId = data.speciesId;
    this.name = data.name;
    this.xp = data.xp ?? 0;
    this.discipline = data.discipline ?? 0;
    this.asleep = data.asleep ?? false;
    this.createdAt = data.createdAt ?? Date.now();
    this.lastTick = data.lastTick ?? Date.now();
    this.stats = {
      hunger: data.stats?.hunger ?? 80,
      hydration: data.stats?.hydration ?? 80,
      cleanliness: data.stats?.cleanliness ?? 90,
      happiness: data.stats?.happiness ?? 75,
      energy: data.stats?.energy ?? 80,
      health: data.stats?.health ?? 100
    };
  }

  get def() {
    return SPECIES[this.speciesId];
  }

  get stage() {
    return stageForXp(this.xp);
  }

  get level() {
    return levelForXp(this.xp);
  }

  // Progress (0..1) toward the next growth stage, for the XP bar.
  get stageProgress() {
    const stage = this.stage;
    if (stage === 'adult') return 1;
    const nextThreshold = stage === 'egg' ? STAGE_XP.adolescent : STAGE_XP.adult;
    const prevThreshold = stage === 'egg' ? 0 : STAGE_XP.adolescent;
    return clamp((this.xp - prevThreshold) / (nextThreshold - prevThreshold), 0, 1);
  }

  // Advance the simulation by `dtSeconds`. Applies decay and derives health.
  tick(dtSeconds) {
    if (dtSeconds <= 0) return;
    const decayMods = this.def.decay;

    if (this.asleep) {
      // While sleeping, energy recovers and other needs decay slower.
      this.stats.energy = clamp(this.stats.energy + dtSeconds * 4);
      for (const key of ['hunger', 'hydration', 'cleanliness', 'happiness']) {
        this.stats[key] = clamp(this.stats[key] - dtSeconds * BASE_DECAY[key] * (decayMods[key] ?? 1) * 0.3);
      }
      if (this.stats.energy >= STAT_MAX) this.asleep = false;
    } else {
      for (const key of ['hunger', 'hydration', 'cleanliness', 'happiness', 'energy']) {
        this.stats[key] = clamp(this.stats[key] - dtSeconds * BASE_DECAY[key] * (decayMods[key] ?? 1));
      }
    }

    // Neglect penalty: every fully-empty need bar drags ALL bars down at an
    // equal extra rate. The more bars sit at zero, the faster everything drops.
    // Reduced while asleep, matching the slower decay of the sleep branch above.
    // Health is intentionally included here AND still subject to the critical
    // drain below, so sustained neglect compounds into a fast health loss.
    const emptyBars = NEED_STATS.filter((key) => this.stats[key] <= 0).length;
    if (emptyBars > 0) {
      const penalty = dtSeconds * EMPTY_BAR_PENALTY * emptyBars * (this.asleep ? 0.3 : 1);
      for (const key of [...NEED_STATS, 'health']) {
        this.stats[key] = clamp(this.stats[key] - penalty);
      }
    }

    // Health is derived from how well needs are met.
    const needs = [this.stats.hunger, this.stats.hydration, this.stats.cleanliness, this.stats.happiness];
    const avgNeed = needs.reduce((a, b) => a + b, 0) / needs.length;
    const critical = needs.filter((v) => v < 20).length;
    if (avgNeed > 55 && critical === 0) {
      this.stats.health = clamp(this.stats.health + dtSeconds * 1.2);
    } else if (critical > 0 || avgNeed < 30) {
      this.stats.health = clamp(this.stats.health - dtSeconds * (0.6 + critical * 0.6));
    }

    this.lastTick = Date.now();
  }

  // Overall wellbeing 0..1 used to pick the creature's mood/animation.
  get mood() {
    const s = this.stats;
    const score = (s.hunger + s.hydration + s.cleanliness + s.happiness + s.energy + s.health) / 6 / STAT_MAX;
    if (this.asleep) return 'sleep';
    if (score > 0.7) return 'happy';
    if (score > 0.4) return 'neutral';
    return 'sad';
  }

  // Apply a care action. Returns a result describing what happened, or an error.
  applyCare(action, { bonus = 1 } = {}) {
    const def = CARE_ACTIONS[action];
    if (!def) return { ok: false, reason: 'unknown action' };

    if (action === 'sleep') {
      if (this.asleep) return { ok: false, reason: `${this.name} is already asleep.` };
      this.asleep = true;
    } else if (this.asleep && action !== 'pet') {
      return { ok: false, reason: `${this.name} is sleeping. Pet them to wake up, or let them rest.` };
    } else if (action === 'pet' && this.asleep) {
      this.asleep = false;
    }

    const changed = {};
    for (const key of ['hunger', 'hydration', 'cleanliness', 'happiness', 'energy', 'health']) {
      if (def[key] != null) {
        const before = this.stats[key];
        const delta = def[key] > 0 ? def[key] * bonus : def[key];
        this.stats[key] = clamp(this.stats[key] + delta);
        changed[key] = Math.round(this.stats[key] - before);
      }
    }
    if (def.discipline) this.discipline = clamp(this.discipline + def.discipline * bonus, 0, 100);

    // Favourite action gives a happiness + XP bonus.
    let xp = def.xp;
    let favourite = false;
    if (this.def.favourite === action) {
      favourite = true;
      xp = Math.round(xp * 1.5);
      this.stats.happiness = clamp(this.stats.happiness + 6);
    }

    const beforeStage = this.stage;
    this.xp += Math.round(xp * bonus);
    const afterStage = this.stage;

    return {
      ok: true,
      changed,
      xp: Math.round(xp * bonus),
      favourite,
      evolved: beforeStage !== afterStage ? afterStage : null
    };
  }

  toJSON() {
    return {
      id: this.id,
      speciesId: this.speciesId,
      name: this.name,
      xp: this.xp,
      discipline: this.discipline,
      asleep: this.asleep,
      createdAt: this.createdAt,
      lastTick: this.lastTick,
      stats: this.stats
    };
  }
}
