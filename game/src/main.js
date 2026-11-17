// SOLMAR BAY — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between screens: title, play, paused, busted, wasted and
// mission-complete. ?seed=N fixes the city; ?shot=start|play|drive|end
// stages that scene instead of waiting for input and sets
// window.__shotReady once it has painted, for screenshots.
import * as THREE from 'three';
import { CITY, DIALOGUE, ECONOMY, GAME, PLACES, PLAYER, STORY } from './config.js';
import { makeRng } from './rng.js';
import { SoundBank } from './audio.js';
import { ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_USE, createInput } from './input.js';
import { buildCity, resolveCollisions, roadLines } from './world.js';
import { Traffic, driveCar } from './vehicles.js';
import { Pedestrians, buildPedMesh } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : GAME.seedDefault;

const canvas = document.getElementById('game');
const audio = new SoundBank();
const hud = new Hud();

// --- Three.js scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8d8);
scene.fog = new THREE.Fog(0x87b8d8, 180, 420);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.position.set(120, 200, 60);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xbfd8e8, 0.9));

const city = buildCity(scene, seed);
const lines = roadLines();
const traffic = new Traffic(scene, seed, lines, city.colliders);
const peds = new Pedestrians(scene, seed, lines, city.colliders);
const police = new Police(scene, seed, city.colliders, lines);
const missions = new Missions(scene);
const combat = new Combat(scene, audio);

// --- Game state -----------------------------------------------------------
const game = {
  screen: 'title',
  cash: ECONOMY.startCash,
  hp: PLAYER.maxHp,
  inCar: false,
  playerCar: null,
  camYaw: Math.PI,
  camPitch: 0.3,
  camDist: 9,
  orbitAngle: 0,
  endTitle: '',
  endText: '',
  muted: false,
  elapsed: 0,
  saveTimer: 0,
};
game.traffic = traffic;
game.police = police;
game.missions = missions;
game.player = null; // set below
game.playerCar = null;

// Milo Vane, the player, on foot: teal jacket, dark jeans.
const playerMesh = buildPedMesh(0x2a9a8a);
playerMesh.position.set(PLACES.plaza.x, 0, PLACES.plaza.z + 10);
scene.add(playerMesh);
game.player = {
  mesh: playerMesh,
  x: PLACES.plaza.x,
  z: PLACES.plaza.z + 10,
  heading: Math.PI,
  speed: 0,
};

// Mission marker beacon for the HUD minimap.
function currentMarker() {
  const target = missions.targetPos();
  return target && missions.state === 'active' ? { x: target.x, z: target.z } : null;
}

// --- Screens --------------------------------------------------------------
const overlays = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  end: document.getElementById('screen-end'),
};
const endTitleEl = document.getElementById('end-title');
const endTextEl = document.getElementById('end-text');
const hudEl = document.getElementById('hud');

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('hidden', key !== name);
  }
  hudEl.classList.toggle('hidden', name === 'title');
  document.body.dataset.playing = game.screen === 'play' ? '1' : '0';
}

game.setScreen = function setScreen(name) {
  game.screen = name;
  if (name === 'title') showOverlay('title');
  else if (name === 'paused') showOverlay('pause');
  else if (name === 'busted' || name === 'wasted' || name === 'complete') {
    endTitleEl.textContent = game.endTitle;
    endTextEl.textContent = game.endText;
    showOverlay('end');
  } else showOverlay(null);
  if (name === 'play') document.getElementById('status').textContent = 'Playing Solmar Bay.';
};

game.orbitCamera = function orbitCamera(angle) {
  game.orbitAngle = angle;
};

// --- Save / load ----------------------------------------------------------
function saveGame() {
  try {
    window.localStorage.setItem(GAME.saveKey, JSON.stringify({
      cash: game.cash,
      hp: game.hp,
      missionIndex: missions.missionIndex,
      stepIndex: missions.stepIndex,
      state: missions.state,
      x: game.player.x,
      z: game.player.z,
      shells: missions.shellsCollected,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(GAME.saveKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Starting and ending ---------------------------------------------------
game.startGame = function startGame(fromShot) {
  const save = fromShot ? null : loadSave();
  game.cash = ECONOMY.startCash;
  game.hp = PLAYER.maxHp;
  game.inCar = false;
  game.playerCar = null;
  police.clear();
  if (save && save.cash !== undefined) {
    game.cash = save.cash;
    game.hp = save.hp || PLAYER.maxHp;
    game.player.x = save.x ?? PLACES.plaza.x;
    game.player.z = save.z ?? PLACES.plaza.z + 10;
    missions.shellsCollected = save.shells || 0;
    missions.startFromSave(save.missionIndex || 0, save.stepIndex || 0);
    hud.showMessage('Save loaded — welcome back to Solmar Bay.', 4);
  } else {
    game.player.x = PLACES.plaza.x;
    game.player.z = PLACES.plaza.z + 10;
    missions.start();
    hud.showMessage(STORY[0].intro, 8);
  }
  playerMesh.position.set(game.player.x, 0, game.player.z);
  game.setScreen('play');
};

function endGame(kind) {
  if (kind === 'busted') {
    game.endTitle = 'BUSTED';
    game.endText = DIALOGUE.busted;
    game.cash = Math.max(0, game.cash - 300);
  } else if (kind === 'wasted') {
    game.endTitle = 'WASTED';
    game.endText = DIALOGUE.wasted;
    game.cash = Math.max(0, game.cash - 200);
  } else if (kind === 'complete') {
    game.endTitle = 'SOLMAR BAY IS YOURS';
    game.endText = DIALOGUE.complete;
  }
  if (game.inCar) exitCar();
  police.clear();
  saveGame();
  game.setScreen(kind);
  audio.setSiren(false);
  audio.setEngine(0, false);
}

function restart() {
  try {
    window.localStorage.removeItem(GAME.saveKey);
  } catch {
    // ignore
  }
  game.cash = ECONOMY.startCash;
  game.hp = PLAYER.maxHp;
  missions.missionIndex = 0;
  missions.stepIndex = 0;
  missions.start();
  game.player.x = PLACES.plaza.x;
  game.player.z = PLACES.plaza.z + 10;
  playerMesh.position.set(game.player.x, 0, game.player.z);
  saveGame();
  game.setScreen('play');
}

// --- Cars -----------------------------------------------------------------
game.enterCar = function enterCar(car, silent) {
  car.driver = 'player';
  game.playerCar = car;
  game.inCar = true;
  playerMesh.visible = false;
  if (!silent) {
    police.addStars(1);
    hud.showMessage(`You took the ${car.kind}. The Bay Police noticed — 1 star.`, 4);
    audio.blip(520, 0.15, 'square', 0.2);
  }
};

function exitCar() {
  const car = game.playerCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  game.playerCar = null;
  game.inCar = false;
  game.player.x = car.x + Math.cos(car.heading) * 2.5;
  game.player.z = car.z - Math.sin(car.heading) * 2.5;
  playerMesh.visible = true;
  playerMesh.position.set(game.player.x, 0, game.player.z);
}

// --- Wiring the mission callbacks ------------------------------------------
missions.onReward = (amount, text) => {
  game.cash += amount;
  audio.cash();
  hud.showMessage(`${text} — cash now $${game.cash.toLocaleString('en-US')}.`, 6);
  saveGame();
  if (missions.state === 'allDone') {
    game.endTitle = 'SOLMAR BAY IS YOURS';
    game.endText = DIALOGUE.complete;
    game.setScreen('complete');
  }
};
missions.onEvent = (kind) => {
  if (kind === 'heist') {
    police.addStars(3);
    hud.showMessage('The vault alarm is screaming — 3 stars! Lose the heat and reach the hideout.', 6);
  }
};

// --- Input ------------------------------------------------------------------
const input = createInput(canvas);

document.getElementById('start-btn').addEventListener('click', () => {
  audio.ensure();
  game.startGame(false);
});
document.getElementById('resume-btn').addEventListener('click', () => game.setScreen('play'));
document.getElementById('restart-btn').addEventListener('click', restart);
document.getElementById('continue-btn').addEventListener('click', () => {
  game.setScreen('play');
  saveGame();
});
document.getElementById('mute-btn').addEventListener('click', () => {
  game.muted = !game.muted;
  audio.setMuted(game.muted);
  document.getElementById('mute-btn').textContent = game.muted ? '🔇 Muted' : '🔊 Sound';
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'play' && !shot) game.setScreen('paused');
});

// --- One fixed step ---------------------------------------------------------
function step(dt) {
  game.elapsed += dt;
  const actions = input.takeActions();
  const move = input.move();
  game.camYaw -= move.dx * 0.0032;
  game.camPitch = Math.max(0.05, Math.min(0.9, game.camPitch + move.dy * 0.002));
  input.consumeMouse();

  if (actions & ACTION_MUTE) {
    game.muted = !game.muted;
    audio.setMuted(game.muted);
  }
  if (actions & ACTION_PAUSE) {
    if (game.screen === 'play') game.setScreen('paused');
    else if (game.screen === 'paused') game.setScreen('play');
    return;
  }
  if (actions & ACTION_RESTART && (game.screen === 'busted' || game.screen === 'wasted' || game.screen === 'complete')) {
    restart();
    return;
  }
  if (game.screen !== 'play') return;

  // --- Enter / exit cars (E) ---
  if (actions & ACTION_ENTER) {
    if (game.inCar) {
      exitCar();
    } else {
      const car = traffic.nearestStealable(game.player.x, game.player.z, 4);
      if (car) game.enterCar(car, false);
    }
  }
  const pressedUse = !!(actions & ACTION_USE);

  // --- Player movement ---
  if (game.inCar && game.playerCar) {
    const car = game.playerCar;
    driveCar(car, move, dt, city.colliders, () => {
      audio.crash();
      peds.scare(car.x, car.z, 12);
    });
    // Ramming a pedestrian is a crime, and it hurts.
    const hit = peds.nearest(car.x, car.z, 2.2);
    if (hit && Math.abs(car.speed) > 4) {
      peds.kill(hit);
      police.addStars(1);
      audio.crash();
      hud.showMessage('You hit a pedestrian! The police are coming.', 4);
    }
    // Police cars ramming the player damage the car (a few hp per second
    // of contact, not a wreck in one touch).
    for (const pc of police.cars) {
      if (Math.hypot(pc.x - car.x, pc.z - car.z) < 3 && Math.abs(pc.speed) > 5) {
        car.hp -= 6 * dt;
        if (car.hp <= 0) {
          hud.showMessage('Your car is wrecked! Bail out!', 4);
          audio.crash();
          exitCar();
        }
      }
    }
    audio.setEngine(Math.abs(car.speed) / 34, true);
  } else {
    audio.setEngine(0, false);
    const speed = move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(game.camYaw);
    const cos = Math.cos(game.camYaw);
    // Camera-relative movement: W walks away from the camera.
    const mx = (sin * move.f + cos * move.s) * speed * dt;
    const mz = (cos * move.f - sin * move.s) * speed * dt;
    const nx = game.player.x + mx;
    const nz = game.player.z + mz;
    const fixed = resolveCollisions(city.colliders, nx, nz, PLAYER.radius);
    game.player.x = fixed.x;
    game.player.z = fixed.z;
    if (mx !== 0 || mz !== 0) {
      game.player.heading = Math.atan2(mx, mz);
      playerMesh.position.y = Math.abs(Math.sin(game.elapsed * 10)) * 0.05;
    }
    playerMesh.position.set(game.player.x, playerMesh.position.y, game.player.z);
    playerMesh.rotation.y = game.player.heading;

    // Combat on foot: click shoots, Space punches.
    if (input.firing) {
      const dir = { x: Math.sin(game.player.heading), z: Math.cos(game.player.heading) };
      const result = combat.shoot(game.player, dir, peds.peds, police.officers, [...traffic.cars, ...traffic.parked]);
      if (result && result.type !== 'none') {
        if (result.type === 'ped' || result.type === 'officer') {
          police.addStars(result.killed ? 2 : 1);
          peds.scare(game.player.x, game.player.z, 20);
          if (result.killed) hud.showMessage(result.type === 'officer' ? 'You took down an officer! 2 stars.' : 'That was a civilian! 2 stars.', 4);
        } else if (result.type === 'car') {
          police.addStars(1);
        }
      }
    }
    if (input.space) {
      const result = combat.punch(game.player, game.player.heading, peds.peds, police.officers);
      if (result && result.killed) {
        police.addStars(2);
        peds.scare(game.player.x, game.player.z, 15);
      }
    }
    // Golden shells on foot.
    for (const shell of city.shells) {
      if (!shell.taken && Math.hypot(shell.mesh.position.x - game.player.x, shell.mesh.position.z - game.player.z) < 2) {
        shell.taken = true;
        shell.mesh.visible = false;
        missions.shellsCollected += 1;
        game.cash += ECONOMY.shellValue;
        audio.pickup();
        hud.showMessage(`Golden shell! +$${ECONOMY.shellValue} (${missions.shellsCollected}/${ECONOMY.shellCount})`, 3);
      }
    }
    // Slow health regen when calm.
    if (police.stars === 0 && game.hp < PLAYER.maxHp) game.hp = Math.min(PLAYER.maxHp, game.hp + 2 * dt);
  }

  // --- Missions ---
  const pos = game.inCar && game.playerCar ? { x: game.playerCar.x, z: game.playerCar.z } : game.player;
  const reached = missions.reachCheck(pos.x, pos.z, game.inCar, pressedUse);
  if (reached && reached !== 'press-use') {
    hud.showMessage(reached.text, 6);
    audio.pickup();
  } else if (reached === 'press-use') {
    hud.showMessage('Press F to do the job.', 1);
  }
  const escaped = missions.escapeCheck(pos.x, pos.z, police.stars);
  if (escaped) {
    hud.showMessage(escaped.text, 6);
    audio.pickup();
  }
  missions.updateTaxi(dt, pos.x, pos.z, game.inCar,
    (msg) => hud.showMessage(msg, 4),
    (fare) => {
      game.cash += fare;
      audio.cash();
      hud.showMessage(`Taxi fare paid — $${fare}.`, 4);
    });
  missions.update(dt);

  // --- World life ---
  traffic.update(dt, game.playerCar);
  peds.update(dt, game.player);
  combat.update(dt);
  const busted = police.update(dt, pos, game.inCar);
  if (busted === 'busted') {
    endGame('busted');
    return;
  }
  // At 5 stars the police shoot the player on foot.
  if (police.stars >= 5 && !game.inCar && Math.random() < dt * 0.4) {
    game.hp -= 8;
    if (game.hp <= 0) {
      endGame('wasted');
      return;
    }
  }
  if (game.hp <= 0) {
    endGame('wasted');
    return;
  }
  audio.setSiren(police.stars > 0);

  // --- Camera ---
  const focus = game.inCar && game.playerCar ? game.playerCar : game.player;
  const focusHeading = game.inCar && game.playerCar ? game.playerCar.heading : game.camYaw;
  const dist = game.inCar ? 13 : game.camDist;
  const height = game.inCar ? 5.5 : 4.2;
  const cx = focus.x - Math.sin(focusHeading) * dist;
  const cz = focus.z - Math.cos(focusHeading) * dist;
  camera.position.set(cx, height + game.camPitch * 6, cz);
  camera.lookAt(focus.x, 1.6, focus.z);

  // --- HUD ---
  const hint = game.inCar
    ? 'WASD drive · E exit car · mouse camera'
    : 'WASD move · Shift run · E steal car · Click shoot · Space punch · F use · P pause';
  hud.update(dt, {
    hp: game.hp,
    cash: game.cash,
    stars: police.stars,
    objective: missions.objectiveText,
    missionTitle: missions.currentMission ? missions.currentMission.title : 'FREE ROAM',
    speedKmh: game.inCar && game.playerCar ? Math.abs(game.playerCar.speed) * 3.6 : 0,
    inCar: game.inCar,
    hint,
    playerX: pos.x,
    playerZ: pos.z,
    heading: focusHeading,
    marker: currentMarker(),
    police: [...police.cars.map((c) => ({ x: c.x, z: c.z })), ...police.officers.filter((o) => o.alive).map((o) => ({ x: o.x, z: o.z }))],
    traffic: traffic.cars.map((c) => ({ x: c.x, z: c.z })),
  });

  // Autosave every 15 seconds while playing.
  game.saveTimer += dt;
  if (game.saveTimer > 15) {
    game.saveTimer = 0;
    saveGame();
  }
}

// Title-screen backdrop: slow orbit over Solmar Plaza.
function titleFrame(dt) {
  game.orbitAngle += dt * 0.05;
  traffic.update(dt, null);
  peds.update(dt, game.player);
  const r = 90;
  camera.position.set(Math.sin(game.orbitAngle) * r, 55, Math.cos(game.orbitAngle) * r);
  camera.lookAt(0, 0, 0);
}

// --- Frame loop -------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
let painted = 0;

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  // Pause / end screens still read their keys: P resumes, R restarts.
  if (game.screen === 'paused' || game.screen === 'busted' || game.screen === 'wasted' || game.screen === 'complete') {
    const a = input.takeActions();
    if ((a & ACTION_PAUSE) && game.screen === 'paused') game.setScreen('play');
    if ((a & ACTION_RESTART) && game.screen !== 'paused') restart();
  }
  if (game.screen === 'title') {
    while (accumulator >= STEP) {
      titleFrame(STEP);
      accumulator -= STEP;
    }
  } else if (game.screen === 'play' || game.screen === 'paused' || game.screen === 'complete') {
    while (accumulator >= STEP) {
      if (game.screen === 'play') step(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  renderer.render(scene, camera);
  painted += 1;
  if (shot && painted > 45) window.__shotReady = true;
}

game.setScreen('title');
document.getElementById('status').textContent = 'Solmar Bay. Press Start to play.';
if (shot) {
  stageShot(shot, game);
  // Let the staged scene settle (traffic, police chase) before the shot.
  for (let i = 0; i < 90; i += 1) {
    if (game.screen === 'play') step(STEP);
    else if (game.screen === 'title') titleFrame(STEP);
  }
  // The end shot stages its panel only now, once camera and HUD are framed.
  if (game.pendingScreen) game.setScreen(game.pendingScreen);
}
requestAnimationFrame(frame);
