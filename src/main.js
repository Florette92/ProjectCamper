import { SceneManager } from './core/SceneManager.js';
import { GameState } from './game/GameState.js';
import { UI } from './ui/UI.js';

// Bootstraps the game: builds the 3D scene, restores any save, wires the UI and
// runs the render + simulation loop.
function main() {
  const canvas = document.getElementById('scene');
  const scene = new SceneManager(canvas);
  const game = new GameState();
  const ui = new UI(game, scene);

  const loaded = game.load();
  if (loaded && game.active) {
    ui._enterGame();
  } else {
    ui.showBoot();
  }

  // Simulation tick — decays stats roughly once per second, plus autosave.
  let lastSim = performance.now();
  let sinceSave = 0;
  setInterval(() => {
    const now = performance.now();
    const dt = (now - lastSim) / 1000;
    lastSim = now;
    if (game.creatures.length > 0) {
      game.tick(dt);
      // Refresh the active creature's HUD (mood may have changed).
      if (game.active) ui.refresh();
      sinceSave += dt;
      if (sinceSave > 15) {
        sinceSave = 0;
        game.save();
      }
    }
  }, 1000);

  // Save when the tab is hidden or closed so progress is never lost.
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) game.save();
  });
  window.addEventListener('beforeunload', () => game.save());

  // Render loop.
  function animate() {
    scene.update();
    requestAnimationFrame(animate);
  }
  animate();

  // Expose for debugging in the console.
  window.__critterCove = { game, scene, ui };
}

main();
