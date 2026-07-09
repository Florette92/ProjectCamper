import * as THREE from 'three';
import { SPECIES } from '../data/creatures.js';

// Live shaders for holographic parts, so the render loop can advance their
// scanline animation. Cleared whenever a creature is rebuilt.
const holoShaders = [];
export function updateHoloTime(t) {
  for (const s of holoShaders) s.uniforms.uTime.value = t;
}
export function resetHoloShaders() {
  holoShaders.length = 0;
}

// Builds a fully procedural 3D creature out of Three.js primitives.
// No external model assets are required — every species/stage combination is
// assembled from spheres, capsules, cones and tori so the game is self-contained.
//
// Returns a THREE.Group whose `userData.anim` holds references to the parts that
// the render loop animates (head, eyes, wings, tail, limbs).

// Holographic material: strongly emissive + semi-transparent so the creature
// reads as a projected light-field (Bitzee style). Bloom post-processing makes
// the emissive edges bleed and glow. A Fresnel term brightens the silhouette so
// the rim glows like a real hologram.
function mat(color, { flat = false, glow = false } = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshStandardMaterial({
    color: c,
    emissive: c.clone().multiplyScalar(glow ? 0.7 : 0.5),
    emissiveIntensity: glow ? 1.05 : 0.7,
    roughness: 0.35,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
    depthWrite: true,
    flatShading: flat
  });
  applyFresnel(m, c);
  return m;
}

// Injects a view-dependent rim glow into a MeshStandardMaterial via
// onBeforeCompile so the creature's edges brighten toward the camera.
function applyFresnel(material, color) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55) };
    shader.uniforms.uRimPower = { value: 2.2 };
    shader.uniforms.uTime = { value: 0 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimPower;
         uniform float uTime;`
      )
      // Inject at the very end of main() where the view-space `normal` and
      // `vViewPosition` are always in scope (works for flat- and smooth-shaded
      // materials alike, unlike `vNormal` which is absent under FLAT_SHADED).
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         // View-dependent rim glow makes the silhouette read as a hologram.
         float fresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
         gl_FragColor.rgb += uRimColor * fresnel * 1.15;
         // Travelling horizontal scanlines + gentle flicker for the projected look.
         float scan = 0.5 + 0.5 * sin((vViewPosition.y * 42.0) - uTime * 4.0);
         gl_FragColor.rgb += uRimColor * scan * 0.06;
         float flicker = 0.97 + 0.03 * sin(uTime * 40.0);
         gl_FragColor.rgb *= flicker;
         // Keep the rim opaque so the glowing edge stays crisp against the void.
         gl_FragColor.a = clamp(gl_FragColor.a + fresnel * 0.4, 0.0, 1.0);`
      );
    holoShaders.push(shader);
  };
}

function eyeMesh(color) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xbfefff,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.92,
      roughness: 0.2
    })
  );
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.2 })
  );
  pupil.position.z = 0.08;
  const shine = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  shine.position.set(0.03, 0.03, 0.12);
  g.add(white, pupil, shine);
  return g;
}

// ---- Egg stage: a speckled ovoid ------------------------------------------
function buildEgg(def) {
  const group = new THREE.Group();
  const p = def.palette;

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), mat(p.belly));
  shell.scale.set(1, 1.28, 1);
  shell.position.y = 0.72;
  shell.castShadow = true;
  group.add(shell);

  // Coloured speckles hint at the species inside.
  const speckleMat = mat(p.body, { flat: true });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 + Math.random() * 0.05, 10, 10), speckleMat);
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.4 + Math.random() * 1.9;
    const r = 0.69;
    s.position.set(
      Math.sin(phi) * Math.cos(theta) * r,
      0.72 + Math.cos(phi) * r * 1.28,
      Math.sin(phi) * Math.sin(theta) * r
    );
    s.scale.z = 0.35;
    s.lookAt(0, s.position.y, 0);
    group.add(s);
  }

  group.userData.anim = { type: 'egg', shell };
  return group;
}

// ---- Body helper for adolescent/adult -------------------------------------
function buildBody(def, scale) {
  const group = new THREE.Group();
  const p = def.palette;
  const b = def.build;
  const bodyMat = mat(p.body, { glow: !!b.glow });
  const accentMat = mat(p.accent);
  const bellyMat = mat(p.belly);

  const anim = { type: 'creature', wings: [], legs: [], tail: null, head: null };

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.35, 8, 16), bodyMat);
  torso.castShadow = true;
  if (b.shape === 'quad') {
    torso.rotation.z = Math.PI / 2;
    torso.position.y = 0.55;
  } else {
    torso.position.y = 0.7;
  }
  group.add(torso);

  // Belly patch
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), bellyMat);
  belly.scale.set(0.8, 1.05, 0.55);
  belly.position.set(0, b.shape === 'quad' ? 0.42 : 0.62, 0.28);
  group.add(belly);

  // Head
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 24), bodyMat);
  skull.castShadow = true;
  head.add(skull);

  const eyeL = eyeMesh(p.eye);
  const eyeR = eyeMesh(p.eye);
  eyeL.position.set(-0.16, 0.08, 0.34);
  eyeR.position.set(0.16, 0.08, 0.34);
  head.add(eyeL, eyeR);
  anim.eyes = [eyeL, eyeR];

  // Snout / cheeks
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), bellyMat);
  snout.scale.set(1, 0.7, 0.8);
  snout.position.set(0, -0.08, 0.4);
  head.add(snout);

  if (b.horns) {
    const hornMat = accentMat;
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 12), hornMat);
      horn.position.set(sx * 0.18, 0.42, 0);
      horn.rotation.z = sx * -0.3;
      head.add(horn);
    }
  }
  if (b.antennae) {
    for (const sx of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), accentMat);
      stalk.position.set(sx * 0.12, 0.5, 0);
      stalk.rotation.z = sx * -0.25;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), mat(p.accent, { glow: true }));
      ball.position.set(sx * 0.18, 0.66, 0);
      head.add(stalk, ball);
    }
  }
  if (b.ears === 'long') {
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 6, 10), bodyMat);
      ear.position.set(sx * 0.22, 0.48, -0.02);
      ear.rotation.z = sx * -0.28;
      head.add(ear);
    }
  }

  head.position.y = b.shape === 'quad' ? 0.78 : 1.28;
  head.position.z = b.shape === 'quad' ? 0.42 : 0;
  group.add(head);
  anim.head = head;

  // Legs
  const legMat = bodyMat;
  const legPositions = b.shape === 'quad'
    ? [[-0.28, 0.34], [0.28, 0.34], [-0.28, -0.28], [0.28, -0.28]]
    : [[-0.22, 0], [0.22, 0]];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 6, 10), legMat);
    leg.castShadow = true;
    leg.position.set(lx, 0.2, lz);
    group.add(leg);
    anim.legs.push(leg);
  }

  // Feet
  for (const [lx, lz] of legPositions) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), accentMat);
    foot.scale.set(1, 0.5, 1.3);
    foot.position.set(lx, 0.06, lz + 0.05);
    group.add(foot);
  }

  // Wings
  if (b.wings) {
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        new THREE.MeshStandardMaterial({
          color: p.accent,
          transparent: true,
          opacity: 0.82,
          roughness: 0.4,
          side: THREE.DoubleSide
        })
      );
      wing.scale.set(0.5, 0.9, 0.08);
      wing.position.set(sx * 0.5, 0.9, -0.1);
      wing.rotation.y = sx * 0.5;
      group.add(wing);
      anim.wings.push(wing);
    }
  }

  // Fins (water)
  if (b.fins) {
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 3), accentMat);
      fin.position.set(sx * 0.42, 0.55, 0);
      fin.rotation.z = sx * (Math.PI / 2) * 0.8;
      group.add(fin);
      anim.wings.push(fin);
    }
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 3), accentMat);
    dorsal.position.set(0, 0.95, -0.05);
    group.add(dorsal);
  }

  // Tail
  const tail = new THREE.Group();
  if (b.tail === 'flame') {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 12), mat(p.accent, { glow: true }));
    flame.position.y = 0.25;
    tail.add(flame);
  } else if (b.tail === 'fish') {
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 3), accentMat);
    fluke.rotation.x = Math.PI / 2;
    tail.add(fluke);
  } else if (b.tail === 'bolt') {
    const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), mat(p.accent, { glow: true }));
    bolt.position.y = 0.2;
    bolt.rotation.y = Math.PI / 4;
    tail.add(bolt);
  } else if (b.tail === 'puff') {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), bellyMat);
    tail.add(puff);
  }
  tail.position.set(0, b.shape === 'quad' ? 0.55 : 0.5, -0.5);
  group.add(tail);
  anim.tail = tail;

  group.scale.setScalar(scale);
  group.userData.anim = anim;
  return group;
}

// ---- Fire kitsune: chibi nine-tailed fox ----------------------------------
// A single fluffy, tapering flame tail built from stacked spheres following a
// gently up-curling bezier, so it reads as a wisp of holographic fire.
function buildFlameTail(baseMat, tipMat) {
  const tail = new THREE.Group();
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.4, -0.42),
    new THREE.Vector3(0, 0.95, -0.2)
  );
  const N = 9;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const r = 0.17 * (1 - s * 0.72); // taper toward a fine flame tip
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), i >= N - 3 ? tipMat : baseMat);
    seg.position.copy(curve.getPoint(s));
    tail.add(seg);
  }
  return tail;
}

// A large upright triangular fox ear with an inner accent.
function buildFoxEar(sx, bodyMat, innerMat) {
  const ear = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.44, 4), bodyMat);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), innerMat);
  inner.position.z = 0.03;
  inner.position.y = -0.02;
  ear.add(outer, inner);
  ear.rotation.z = sx * -0.28;
  ear.rotation.x = -0.12;
  return ear;
}

function buildFox(def, scale, tailCount) {
  const group = new THREE.Group();
  const p = def.palette;
  const bodyMat = mat(p.body, { glow: true });
  const accentMat = mat(p.accent, { glow: true });
  const bellyMat = mat(p.belly);

  const anim = { type: 'creature', wings: [], legs: [], tail: null, head: null };

  // Upright chibi torso: pear-shaped, cream belly.
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 24), bodyMat);
  torso.scale.set(0.9, 1.15, 0.85);
  torso.position.y = 0.66;
  torso.castShadow = true;
  group.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 20), bellyMat);
  belly.scale.set(0.72, 1.0, 0.55);
  belly.position.set(0, 0.6, 0.26);
  group.add(belly);

  // Big chibi head.
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 28), bodyMat);
  skull.scale.set(1.02, 0.96, 0.98);
  skull.castShadow = true;
  head.add(skull);

  // Cheek fluff tufts.
  for (const sx of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 5), bellyMat);
    tuft.position.set(sx * 0.44, -0.08, 0.08);
    tuft.rotation.z = sx * (Math.PI / 2);
    head.add(tuft);
  }

  // Big expressive eyes.
  const eyeL = eyeMesh(p.eye);
  const eyeR = eyeMesh(p.eye);
  eyeL.scale.setScalar(1.55);
  eyeR.scale.setScalar(1.55);
  eyeL.position.set(-0.19, 0.04, 0.4);
  eyeR.position.set(0.19, 0.04, 0.4);
  head.add(eyeL, eyeR);
  anim.eyes = [eyeL, eyeR];

  // Snout + nose.
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), bellyMat);
  snout.scale.set(1, 0.72, 0.9);
  snout.position.set(0, -0.14, 0.44);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), mat(p.eye));
  nose.position.set(0, -0.1, 0.58);
  head.add(snout, nose);

  // Fiery brow markings.
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), accentMat);
    brow.position.set(sx * 0.14, 0.34, 0.36);
    brow.rotation.z = sx * -0.5;
    head.add(brow);
  }

  // Big fox ears.
  const earL = buildFoxEar(-1, bodyMat, accentMat);
  const earR = buildFoxEar(1, bodyMat, accentMat);
  earL.position.set(-0.26, 0.46, -0.02);
  earR.position.set(0.26, 0.46, -0.02);
  head.add(earL, earR);

  head.position.y = 1.24;
  group.add(head);
  anim.head = head;

  // Little arms held forward, chibi style.
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.2, 6, 10), bodyMat);
    arm.position.set(sx * 0.4, 0.62, 0.08);
    arm.rotation.z = sx * 0.5;
    arm.rotation.x = -0.4;
    group.add(arm);
  }

  // Short legs + paws.
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 6, 10), bodyMat);
    leg.castShadow = true;
    leg.position.set(sx * 0.19, 0.22, 0.02);
    group.add(leg);
    anim.legs.push(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), accentMat);
    paw.scale.set(1, 0.55, 1.35);
    paw.position.set(sx * 0.19, 0.06, 0.1);
    group.add(paw);
  }

  // Fan of curling flame tails, spread horizontally behind the fox. The whole
  // fan is parented to anim.tail so the idle loop sways it as one.
  const tailFan = new THREE.Group();
  const tipMat = mat(p.belly, { glow: true });
  for (let i = 0; i < tailCount; i++) {
    const t = buildFlameTail(accentMat, tipMat);
    const frac = tailCount === 1 ? 0 : i / (tailCount - 1) - 0.5; // -0.5 .. 0.5
    t.rotation.y = frac * 1.9;
    t.rotation.z = frac * 0.5;
    t.rotation.x = -0.2 - Math.abs(frac) * 0.25;
    t.scale.setScalar(1 - Math.abs(frac) * 0.18);
    tailFan.add(t);
  }
  tailFan.position.set(0, 0.5, -0.34);
  group.add(tailFan);
  anim.tail = tailFan;

  group.scale.setScalar(scale);
  group.userData.anim = anim;
  return group;
}

export function buildCreatureMesh(speciesId, stage) {
  const def = SPECIES[speciesId];
  if (!def) throw new Error(`Unknown species: ${speciesId}`);

  let group;
  if (stage === 'egg') group = buildEgg(def);
  else if (def.build.shape === 'foxfire') {
    group = buildFox(def, stage === 'adult' ? 1.05 : 0.72, stage === 'adult' ? 9 : 5);
  } else if (stage === 'adolescent') group = buildBody(def, 0.7);
  else group = buildBody(def, 1.05);

  group.userData.speciesId = speciesId;
  group.userData.stage = stage;
  return group;
}
