// SOLMAR BAY — the HUD and the minimap. DOM text for health, cash, wanted
// stars, mission objective, speed and messages; a live canvas minimap that
// draws the street grid, the mission marker (gold), police (blue/red),
// traffic (grey) and the player (green arrow), rotated to the player's
// heading. All DOM ids live in game/index.html.
import { PLACES } from './config.js';

export class Hud {
  constructor() {
    this.el = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective'),
      missionTitle: document.getElementById('mission-title'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      message: document.getElementById('message'),
      hint: document.getElementById('hint'),
      minimap: document.getElementById('minimap'),
    };
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.messageTimer = 0;
    this.lastCash = -1;
    this.lastStars = -1;
    this.lastHp = -1;
  }

  showMessage(text, seconds) {
    this.el.message.textContent = text;
    this.el.message.style.opacity = '1';
    this.messageTimer = seconds || 5;
  }

  update(dt, state) {
    // state: {hp, cash, stars, objective, missionTitle, speedKmh, inCar,
    // hint, playerX, playerZ, heading, marker, police, traffic, shells}
    if (state.hp !== this.lastHp) {
      this.lastHp = state.hp;
      this.el.healthFill.style.width = `${Math.max(0, state.hp)}%`;
      this.el.healthFill.style.background = state.hp > 50 ? '#3ad86a' : state.hp > 25 ? '#f2c94c' : '#e84a4a';
      this.el.healthText.textContent = `${Math.ceil(state.hp)}`;
    }
    if (state.cash !== this.lastCash) {
      this.lastCash = state.cash;
      this.el.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
    }
    if (state.stars !== this.lastStars) {
      this.lastStars = state.stars;
      this.el.stars.textContent = '★'.repeat(state.stars) + '☆'.repeat(5 - state.stars);
      this.el.stars.style.color = state.stars > 0 ? '#ffd94a' : '#ffffff88';
    }
    this.el.objective.textContent = state.objective;
    this.el.missionTitle.textContent = state.missionTitle;
    this.el.speed.textContent = state.inCar ? `${Math.round(state.speedKmh)}` : '—';
    this.el.speedLabel.textContent = state.inCar ? 'km/h' : '';
    this.el.hint.textContent = state.hint || '';
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.el.message.style.opacity = '0';
    }
    this.drawMinimap(state);
  }

  drawMinimap(state) {
    const ctx = this.minimapCtx;
    const size = 180;
    const half = 190; // world units shown from centre to edge
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#101c26ee';
    ctx.fillRect(0, 0, size, size);
    const toMap = (x, z) => [
      size / 2 + ((x - state.playerX) / half) * (size / 2),
      size / 2 + ((z - state.playerZ) / half) * (size / 2),
    ];
    // Street grid.
    ctx.strokeStyle = '#4a5a6a';
    ctx.lineWidth = 3;
    for (let i = -3; i <= 3; i += 1) {
      const c = i * 56;
      const [x1, y1] = toMap(c, state.playerZ - half);
      const [x2, y2] = toMap(c, state.playerZ + half);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = toMap(state.playerX - half, c);
      const [x4, y4] = toMap(state.playerX + half, c);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#2a7ab8';
    for (const place of Object.values(PLACES)) {
      const [x, y] = toMap(place.x, place.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Mission marker: pulsing gold diamond.
    if (state.marker) {
      const [x, y] = toMap(state.marker.x, state.marker.z);
      const r = 6 + Math.sin(performance.now() / 250) * 2;
      ctx.fillStyle = '#ffd94a';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
    // Police: red dots. Traffic: grey dots.
    ctx.fillStyle = '#ff4040';
    for (const p of state.police || []) {
      const [x, y] = toMap(p.x, p.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#9aa8b8';
    for (const c of state.traffic || []) {
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Player: green arrow pointing along the heading.
    const cx = size / 2;
    const cy = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#3ad86a';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Border.
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
}
