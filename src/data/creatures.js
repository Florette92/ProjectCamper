// Static definitions for the five collectible creature species.
// Each species has an element, a colour palette, personality modifiers that
// tweak how fast individual stats decay, and per-stage descriptive flavour.
// The 3D geometry for every stage is generated procedurally in
// src/creatures/CreatureFactory.js from the `build` descriptor here.

export const STAGES = ['egg', 'adolescent', 'adult'];

export const STAGE_LABELS = {
  egg: 'Egg',
  adolescent: 'Adolescent',
  adult: 'Adult'
};

// XP thresholds (cumulative) required to reach a stage.
export const STAGE_XP = {
  egg: 0,
  adolescent: 120,
  adult: 400
};

export const SPECIES = {
  emberling: {
    id: 'emberling',
    name: 'Emberling',
    element: 'Fire',
    emoji: '🔥',
    blurb: 'A hot-headed spark that loves training and hates the cold.',
    palette: {
      body: 0xff7043,
      accent: 0xffca62,
      belly: 0xffe0b2,
      eye: 0x2b0a00
    },
    // Personality: multipliers applied to base decay rates (higher = drains faster).
    decay: { hunger: 1.15, hydration: 1.35, cleanliness: 0.9, happiness: 1.0, energy: 1.1 },
    favourite: 'train',
    build: { shape: 'foxfire', tail: 'flame', wings: false }
  },

  aquari: {
    id: 'aquari',
    name: 'Aquari',
    element: 'Water',
    emoji: '💧',
    blurb: 'A calm amphibian who is happiest splashing in fresh water.',
    palette: {
      body: 0x4fc3f7,
      accent: 0x0288d1,
      belly: 0xe1f5fe,
      eye: 0x02233a
    },
    decay: { hunger: 0.95, hydration: 0.7, cleanliness: 1.2, happiness: 1.0, energy: 0.9 },
    favourite: 'water',
    build: { shape: 'quad', fins: true, tail: 'fish', wings: false }
  },

  florabun: {
    id: 'florabun',
    name: 'Florabun',
    element: 'Grass',
    emoji: '🌿',
    blurb: 'A gentle herbivore that thrives on food and cuddles.',
    palette: {
      body: 0x81c784,
      accent: 0x388e3c,
      belly: 0xf1f8e9,
      eye: 0x14300f
    },
    decay: { hunger: 1.25, hydration: 1.0, cleanliness: 0.95, happiness: 0.85, energy: 0.95 },
    favourite: 'feed',
    build: { shape: 'quad', ears: 'long', tail: 'puff', wings: false }
  },

  voltibee: {
    id: 'voltibee',
    name: 'Voltibee',
    element: 'Electric',
    emoji: '⚡',
    blurb: 'A buzzing bundle of energy that never wants to sleep.',
    palette: {
      body: 0xfff176,
      accent: 0xf9a825,
      belly: 0xfffde7,
      eye: 0x2a2200
    },
    decay: { hunger: 1.0, hydration: 1.0, cleanliness: 1.0, happiness: 1.1, energy: 1.45 },
    favourite: 'play',
    build: { shape: 'biped', wings: true, tail: 'bolt', antennae: true }
  },

  lumagon: {
    id: 'lumagon',
    name: 'Lumagon',
    element: 'Light',
    emoji: '✨',
    blurb: 'A serene, glowing dragonet that adores being kept clean.',
    palette: {
      body: 0xb39ddb,
      accent: 0x7e57c2,
      belly: 0xede7f6,
      eye: 0x1a0f2e
    },
    decay: { hunger: 0.9, hydration: 0.95, cleanliness: 1.3, happiness: 1.0, energy: 0.9 },
    favourite: 'clean',
    build: { shape: 'biped', horns: true, wings: true, tail: 'flame', glow: true }
  }
};

export const SPECIES_LIST = Object.values(SPECIES);

export function stageForXp(xp) {
  if (xp >= STAGE_XP.adult) return 'adult';
  if (xp >= STAGE_XP.adolescent) return 'adolescent';
  return 'egg';
}

// Random flavour names so freshly hatched creatures feel unique.
const NAME_PARTS_A = ['Zip', 'Mo', 'Pip', 'Lu', 'Bo', 'Ny', 'Ka', 'Fen', 'Ori', 'Tam', 'Sol', 'Vex'];
const NAME_PARTS_B = ['zu', 'ko', 'na', 'ri', 'lo', 'mi', 'ka', 'do', 'sy', 'ba', 'wen', 'tix'];

export function randomName() {
  const a = NAME_PARTS_A[Math.floor(Math.random() * NAME_PARTS_A.length)];
  const b = NAME_PARTS_B[Math.floor(Math.random() * NAME_PARTS_B.length)];
  return a + b;
}
