// Lightweight DOM-overlay mini-games. Each returns a Promise resolving to a
// `{ score, bonus }` object the caller turns into a care-action bonus.
// Two games are implemented:
//   - fetch  (Play):  tap the bouncing toys before the timer runs out
//   - reflex (Train): tap the target the instant it turns green, over N rounds

function overlay() {
  const root = document.getElementById('modal-root');
  root.classList.remove('hidden');
  root.innerHTML = '';
  return root;
}

function closeOverlay() {
  const root = document.getElementById('modal-root');
  root.classList.add('hidden');
  root.innerHTML = '';
}

function hud(labelHtml) {
  const el = document.createElement('div');
  el.id = 'minigame-hud';
  el.innerHTML = labelHtml + ' &nbsp; <span class="mg-quit">✕ Quit</span>';
  return el;
}

// ---- Fetch! -----------------------------------------------------------------
export function playFetch() {
  return new Promise((resolve) => {
    const root = overlay();
    const arena = document.createElement('div');
    arena.style.cssText = 'position:absolute;inset:0;';
    root.appendChild(arena);

    let score = 0;
    let timeLeft = 15;
    const toys = ['🎾', '🧶', '🦴', '🪀', '🍡'];

    const bar = hud(`<span>🎾 Score: <b id="mg-score">0</b></span><span>⏱ <b id="mg-time">15</b>s</span>`);
    arena.appendChild(bar);
    const scoreEl = () => document.getElementById('mg-score');
    const timeEl = () => document.getElementById('mg-time');

    let spawnTimer = null;
    let tickTimer = null;

    function finish() {
      clearInterval(tickTimer);
      clearTimeout(spawnTimer);
      closeOverlay();
      // Bonus scales with score; capped so it stays balanced.
      const bonus = 1 + Math.min(score, 20) * 0.05;
      resolve({ score, bonus });
    }

    bar.querySelector('.mg-quit').addEventListener('click', finish);

    function spawn() {
      const btn = document.createElement('button');
      btn.className = 'mg-target';
      btn.textContent = toys[Math.floor(Math.random() * toys.length)];
      const pad = 90;
      btn.style.left = pad + Math.random() * (window.innerWidth - pad * 2) + 'px';
      btn.style.top = 120 + Math.random() * (window.innerHeight - 260) + 'px';
      btn.style.background = `radial-gradient(circle at 35% 30%, #ffffff55, #ffffff00), hsl(${Math.random() * 360},70%,60%)`;
      let alive = true;
      const remove = () => {
        if (!alive) return;
        alive = false;
        btn.remove();
      };
      btn.addEventListener('click', () => {
        if (!alive) return;
        score++;
        scoreEl().textContent = score;
        remove();
      });
      arena.appendChild(btn);
      setTimeout(remove, 1100);
      const next = 500 + Math.random() * 500;
      spawnTimer = setTimeout(spawn, next);
    }

    tickTimer = setInterval(() => {
      timeLeft--;
      if (timeEl()) timeEl().textContent = timeLeft;
      if (timeLeft <= 0) finish();
    }, 1000);
    spawn();
  });
}

// ---- Reflex trainer ---------------------------------------------------------
export function playReflex() {
  return new Promise((resolve) => {
    const root = overlay();
    const arena = document.createElement('div');
    arena.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;';
    root.appendChild(arena);

    const totalRounds = 4;
    let round = 0;
    const times = [];

    const bar = hud(`<span>🎯 Round <b id="mg-round">1</b>/${totalRounds}</span>`);
    arena.appendChild(bar);

    const pad = document.createElement('button');
    pad.style.cssText =
      'width:min(340px,70vw);height:min(340px,70vw);border-radius:24px;border:none;font-size:26px;font-weight:800;color:#06122a;cursor:pointer;transition:background .1s;';
    arena.appendChild(pad);

    const hint = document.createElement('p');
    hint.className = 'center-hint';
    hint.textContent = 'Tap the pad the instant it turns green!';
    arena.appendChild(hint);

    let state = 'wait'; // wait -> armed -> go
    let goTime = 0;
    let armTimer = null;

    function nextRound() {
      round++;
      const rEl = document.getElementById('mg-round');
      if (rEl) rEl.textContent = Math.min(round, totalRounds);
      state = 'armed';
      pad.style.background = '#ff6b8b';
      pad.textContent = 'Wait…';
      const delay = 900 + Math.random() * 2200;
      armTimer = setTimeout(() => {
        state = 'go';
        goTime = performance.now();
        pad.style.background = '#6bffa0';
        pad.textContent = 'TAP!';
      }, delay);
    }

    function finish() {
      clearTimeout(armTimer);
      closeOverlay();
      if (times.length === 0) return resolve({ score: 0, bonus: 1 });
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      // Faster average reaction => bigger bonus (fast ~250ms).
      const bonus = 1 + Math.max(0, Math.min(1, (700 - avg) / 450)) * 0.9;
      resolve({ score: Math.round(avg), bonus });
    }

    bar.querySelector('.mg-quit').addEventListener('click', finish);

    pad.addEventListener('click', () => {
      if (state === 'armed') {
        // Jumped the gun — small penalty round, no time recorded.
        clearTimeout(armTimer);
        pad.style.background = '#ffd166';
        pad.textContent = 'Too soon!';
        setTimeout(() => (round < totalRounds ? nextRound() : finish()), 700);
        state = 'wait';
      } else if (state === 'go') {
        const rt = performance.now() - goTime;
        times.push(rt);
        pad.textContent = `${Math.round(rt)} ms`;
        pad.style.background = '#7be0ff';
        state = 'wait';
        setTimeout(() => (round < totalRounds ? nextRound() : finish()), 700);
      }
    });

    nextRound();
  });
}

export const MINIGAMES = {
  fetch: playFetch,
  reflex: playReflex
};
