import * as THREE from 'three';
import { SPECIES } from '../data/creatures.js';

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
    emissive: c.clone().multiplyScalar(glow ? 0.6 : 0.4),
    emissiveIntensity: glow ? 0.9 : 0.6,
    roughness: 0.4,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
    flatShading: flat
  });
  applyFresnel(m, c);
  return m;
}

// Injects a view-dependent rim glow into a MeshStandardMaterial via
// onBeforeCompile so the creature's edges brighten toward the camera.
function applyFresnel(material, color) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4) };
    shader.uniforms.uRimPower = { value: 2.6 };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uRimColor;
         uniform float uRimPower;`
      )
      // Inject at the very end of main() where the view-space `normal` and
      // `vViewPosition` are always in scope (works for flat- and smooth-shaded
      // materials alike, unlike `vNormal` which is absent under FLAT_SHADED).
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float fresnel = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);
         gl_FragColor.rgb += uRimColor * fresnel * 0.7;`
      );
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

export function buildCreatureMesh(speciesId, stage) {
  const def = SPECIES[speciesId];
  if (!def) throw new Error(`Unknown species: ${speciesId}`);

  let group;
  if (stage === 'egg') group = buildEgg(def);
  else if (stage === 'adolescent') group = buildBody(def, 0.7);
  else group = buildBody(def, 1.05);

  group.userData.speciesId = speciesId;
  group.userData.stage = stage;
  return group;
}
