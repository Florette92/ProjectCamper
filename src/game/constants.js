export const SAVE_KEY = 'critter-cove-save-v1';

// Full stat range.
export const STAT_MAX = 100;

// Base decay per real second for each stat (before species personality modifiers).
// Kept intentionally gentle so a creature left alone for a few minutes degrades
// noticeably but does not die instantly.
export const BASE_DECAY = {
  hunger: 0.09,
  hydration: 0.08,
  cleanliness: 0.05,
  happiness: 0.07,
  energy: 0.06
};

// How much each care action restores / changes stats, plus XP awarded.
// `energy` costs are negative (actions tire the creature) except sleep.
export const CARE_ACTIONS = {
  pet: { label: 'Pet', happiness: 8, energy: -1, xp: 3 },
  feed: { label: 'Feed', hunger: 34, happiness: 4, energy: 2, xp: 6 },
  water: { label: 'Water', hydration: 38, happiness: 3, xp: 5 },
  clean: { label: 'Clean', cleanliness: 45, happiness: 5, xp: 6 },
  play: { label: 'Play', happiness: 18, energy: -12, hunger: -6, xp: 10, minigame: 'fetch' },
  train: { label: 'Train', happiness: 6, energy: -16, hunger: -8, xp: 18, discipline: 4, minigame: 'reflex' },
  // Sleep grants no instant energy — it recovers gradually while asleep
  // (see Creature.tick), so the creature stays visibly asleep for a while.
  sleep: { label: 'Sleep', health: 6, happiness: 4, xp: 4 }
};

// XP needed for each level (level grows within a stage; purely cosmetic progress).
export function levelForXp(xp) {
  return Math.floor(Math.sqrt(xp / 10)) + 1;
}

export function xpForLevel(level) {
  return Math.pow(level - 1, 2) * 10;
}
