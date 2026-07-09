import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCreatureMesh, updateHoloTime, resetHoloShaders } from '../creatures/CreatureFactory.js';
import { SPECIES } from '../data/creatures.js';

// Owns the Three.js renderer, camera, lighting, the little habitat diorama and
// the currently displayed creature mesh. Exposes helpers to swap the creature,
// drive mood-based idle animation, and play one-shot reaction animations.
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04060f);
    this.scene.fog = new THREE.FogExp2(0x04060f, 0.055);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, 5.4);
    this.camera.lookAt(0, 1, 0);

    this.clock = new THREE.Clock();
    this.creatureGroup = new THREE.Group();
    this.creatureGroup.position.y = 0.4; // hover above the projector
    this.scene.add(this.creatureGroup);
    this.currentMesh = null;
    this.mood = 'neutral';
    this.reaction = null; // { type, until }
    this.orbit = 0;

    this._buildLights();
    this._buildProjector();
    this._buildComposer();

    this._onResize = this._resize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._resize();
  }

  _buildComposer() {
    // Bloom gives the holographic emissive surfaces their signature glow bleed.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.5, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  _buildLights() {
    // Dim ambient — the creature is mostly self-lit (emissive), like a hologram.
    this.scene.add(new THREE.AmbientLight(0x223055, 0.6));

    const key = new THREE.DirectionalLight(0x9fd8ff, 0.5);
    key.position.set(3, 6, 4);
    this.scene.add(key);

    // Coloured accent lights that tint the creature and emitter.
    const cyan = new THREE.PointLight(0x35e6ff, 8, 12, 2);
    cyan.position.set(0, 0.2, 0);
    this.scene.add(cyan);

    const magenta = new THREE.PointLight(0xff4fd8, 4, 14, 2);
    magenta.position.set(-2.5, 2, -2);
    this.scene.add(magenta);
  }

  _buildProjector() {
    // Emitter base disc.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0a1428,
      metalness: 0.7,
      roughness: 0.35,
      emissive: 0x08202e,
      emissiveIntensity: 0.5
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 64), baseMat);
    base.position.y = -0.55;
    this.scene.add(base);

    // Glowing emitter ring on top of the base.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.06, 16, 80),
      new THREE.MeshBasicMaterial({ color: 0x4ff0ff })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.37;
    this.scene.add(ring);
    this.emitterRing = ring;

    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.03, 12, 60),
      new THREE.MeshBasicMaterial({ color: 0x9b6bff })
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -0.36;
    this.scene.add(innerRing);
    this.emitterRingInner = innerRing;

    // Reflected glow puddle under the emitter.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 48),
      new THREE.MeshBasicMaterial({ color: 0x2fd8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.35;
    this.scene.add(glow);

    // Floating holo-dust particles rising from the emitter.
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 120;
    const pos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = Math.random() * 1.0;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 2.6 - 0.3;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0x7ff0ff,
        size: 0.035,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.scene.add(this.dust);

    // Distant sparse stars for depth.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 120;
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 12 + Math.random() * 5;
      const t = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI;
      sp[i * 3] = Math.sin(p) * Math.cos(t) * r;
      sp[i * 3 + 1] = Math.cos(p) * r * 0.6 + 2;
      sp[i * 3 + 2] = Math.sin(p) * Math.sin(t) * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x88aaff, size: 0.06, transparent: true, opacity: 0.7 })));
  }

  setCreature(speciesId, stage) {
    if (this.currentMesh) {
      this.creatureGroup.remove(this.currentMesh);
      this._dispose(this.currentMesh);
    }
    resetHoloShaders();
    this.currentMesh = buildCreatureMesh(speciesId, stage);
    this.creatureGroup.add(this.currentMesh);
    this._shownSpecies = speciesId;
    this._shownStage = stage;
  }

  ensureCreature(speciesId, stage) {
    if (this._shownSpecies !== speciesId || this._shownStage !== stage) {
      this.setCreature(speciesId, stage);
    }
  }

  clearCreature() {
    if (this.currentMesh) {
      this.creatureGroup.remove(this.currentMesh);
      this._dispose(this.currentMesh);
      this.currentMesh = null;
      this._shownSpecies = null;
      this._shownStage = null;
    }
  }

  setMood(mood) {
    this.mood = mood;
  }

  // Trigger a short reaction animation: 'happy' bounce, 'eat', 'shake', 'sleep'.
  playReaction(type) {
    this.reaction = { type, start: this.clock.getElapsedTime(), duration: type === 'bounce' ? 0.6 : 0.9 };
  }

  update() {
    // getDelta() must come first: getElapsedTime() consumes the delta internally.
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    const mesh = this.currentMesh;

    if (mesh) {
      const anim = mesh.userData.anim || {};
      if (anim.type === 'egg') {
        // Gentle wobble that speeds up subtly.
        mesh.rotation.z = Math.sin(t * 2) * 0.06;
        mesh.position.y = Math.abs(Math.sin(t * 3)) * 0.02;
      } else {
        const moodSpeed = this.mood === 'happy' ? 1.6 : this.mood === 'sad' ? 0.6 : 1.0;
        const bob = Math.sin(t * 2 * moodSpeed) * (this.mood === 'sleep' ? 0.02 : 0.05);
        mesh.position.y = bob;

        if (anim.head) {
          anim.head.rotation.y = Math.sin(t * 0.8) * 0.25;
          anim.head.rotation.x = this.mood === 'sad' ? 0.25 : Math.sin(t * 1.3) * 0.05;
        }
        if (anim.wings) {
          for (let i = 0; i < anim.wings.length; i++) {
            const w = anim.wings[i];
            const dir = i % 2 === 0 ? 1 : -1;
            w.rotation.z = (w.userData.baseZ ?? 0) + Math.sin(t * 10) * 0.4 * dir;
          }
        }
        if (anim.tail) anim.tail.rotation.z = Math.sin(t * 4) * 0.3;
        if (anim.eyes && this.mood === 'sleep') {
          for (const e of anim.eyes) e.scale.y = 0.15;
        } else if (anim.eyes) {
          // Occasional blink.
          const blink = (t % 4) > 3.9 ? 0.15 : 1;
          for (const e of anim.eyes) e.scale.y = blink;
        }
      }

      // One-shot reactions layered on top.
      if (this.reaction) {
        const elapsed = t - this.reaction.start;
        const k = elapsed / this.reaction.duration;
        if (k >= 1) {
          this.reaction = null;
          mesh.rotation.z = 0;
        } else if (this.reaction.type === 'bounce') {
          mesh.position.y += Math.sin(k * Math.PI) * 0.5;
        } else if (this.reaction.type === 'shake') {
          mesh.rotation.z = Math.sin(k * Math.PI * 8) * 0.2;
        } else if (this.reaction.type === 'spin') {
          mesh.rotation.y = k * Math.PI * 2;
        }
      }
    }

    // Hovering + gentle sway so the projection feels weightless.
    this.creatureGroup.position.y = 0.4 + Math.sin(t * 1.3) * 0.06;
    this.creatureGroup.rotation.y = Math.sin(t * 0.4) * 0.35;

    // Advance the creature's holographic scanline/flicker shader.
    updateHoloTime(t);

    // Projector animation: counter-rotating emitter rings and drifting dust.
    if (this.emitterRing) this.emitterRing.rotation.z = t * 0.6;
    if (this.emitterRingInner) this.emitterRingInner.rotation.z = -t * 0.9;
    if (this.dust) {
      this.dust.rotation.y = t * 0.15;
      const arr = this.dust.geometry.attributes.position.array;
      for (let i = 1; i < arr.length; i += 3) {
        arr[i] += dt * 0.25;
        if (arr[i] > 2.4) arr[i] = -0.3;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    // Slow idle camera drift for a lively feel.
    this.orbit += dt * 0.08;
    this.camera.position.x = Math.sin(this.orbit) * 0.6;
    this.camera.position.y = 1.6 + Math.sin(this.orbit * 0.7) * 0.15;
    this.camera.lookAt(0, 0.9, 0);

    this.composer.render();
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
