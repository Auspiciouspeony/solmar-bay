// SOLMAR BAY — missions and the story. Three chained story missions from
// Rosa Marlin (see config.js STORY), plus two side activities: taxi fares
// (pick up a flagged passenger and drive them to their stop) and golden
// shells (collectibles hidden around the city). The mission marker is a
// tall glowing beacon plus a floating ring in the 3D world; the HUD shows
// the current objective text.
import * as THREE from 'three';
import { ECONOMY, PLACES, STORY } from './config.js';

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.state = 'idle'; // idle | active | done | allDone
    this.marker = null;
    this.markerRing = null;
    this.taxi = null; // {x, z, destX, destZ, passenger} | null
    this.taxiCooldown = 0;
    this.shellsCollected = 0;
    this.lastMessage = '';
    this.onReward = null; // (amount, text) => void, wired by main.js
    this.onEvent = null; // (kind) => void, e.g. 'heist' raises wanted
  }

  get currentMission() {
    return STORY[this.missionIndex] || null;
  }

  get currentStep() {
    const m = this.currentMission;
    return m ? m.steps[this.stepIndex] : null;
  }

  get objectiveText() {
    if (this.state === 'allDone') return 'Free roam — Solmar Bay is yours. Taxi fares and shells still pay.';
    if (this.state === 'idle') return 'Talk to Rosa: walk to the marina payphone.';
    const m = this.currentMission;
    const s = this.currentStep;
    if (!m || !s) return '';
    return `${m.title}: ${s.label}`;
  }

  start() {
    this.state = 'active';
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.lastMessage = STORY[0].intro;
    this.placeMarker();
  }

  startFromSave(missionIndex, stepIndex) {
    this.missionIndex = Math.min(missionIndex, STORY.length - 1);
    this.stepIndex = stepIndex;
    this.state = this.missionIndex >= STORY.length ? 'allDone' : 'active';
    if (this.state === 'active') this.placeMarker();
  }

  // World position of the current step's target.
  targetPos() {
    const step = this.currentStep;
    if (!step) return null;
    const place = PLACES[step.at];
    return place ? { x: place.x, z: place.z, label: place.label } : null;
  }

  placeMarker() {
    this.clearMarker();
    const target = this.targetPos();
    if (!target) return;
    const geo = new THREE.CylinderGeometry(0.35, 0.35, 60, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(target.x, 30, target.z);
    this.scene.add(this.marker);
    const ringGeo = new THREE.TorusGeometry(3, 0.25, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd94a });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = Math.PI / 2;
    this.markerRing.position.set(target.x, 0.3, target.z);
    this.scene.add(this.markerRing);
  }

  clearMarker() {
    if (this.marker) this.scene.remove(this.marker);
    if (this.markerRing) this.scene.remove(this.markerRing);
    this.marker = null;
    this.markerRing = null;
  }

  // Advance when the player reaches the target (radius 6). Returns the
  // message to show, or null. 'action' steps wait for the player to press F.
  reachCheck(px, pz, inCar, pressedUse) {
    if (this.state !== 'active') return null;
    const step = this.currentStep;
    const target = this.targetPos();
    if (!step || !target) return null;
    const dist = Math.hypot(px - target.x, pz - target.z);
    if (dist > 6) return null;
    if (step.kind === 'action') {
      if (!pressedUse) return 'press-use';
      // Vault crack on the heist raises the heat.
      if (this.currentMission.id === 'm3' && this.stepIndex === 1 && this.onEvent) {
        this.onEvent('heist');
      }
      return this.advance();
    }
    if (step.kind === 'drive' && !inCar) return null;
    if (step.kind === 'escape') {
      // Escape step needs the player at the hideout AND no wanted stars.
      return null; // handled by escapeCheck
    }
    return this.advance();
  }

  escapeCheck(px, pz, wantedStars) {
    if (this.state !== 'active') return null;
    const step = this.currentStep;
    if (!step || step.kind !== 'escape') return null;
    const target = this.targetPos();
    if (!target) return null;
    const dist = Math.hypot(px - target.x, pz - target.z);
    if (dist <= 6 && wantedStars === 0) return this.advance();
    return null;
  }

  advance() {
    const mission = this.currentMission;
    this.stepIndex += 1;
    if (this.stepIndex < mission.steps.length) {
      this.placeMarker();
      return { text: `Objective updated: ${this.currentStep.label}`, kind: 'step' };
    }
    // Mission complete: pay out and move to the next.
    const reward = mission.reward;
    this.missionIndex += 1;
    this.stepIndex = 0;
    this.clearMarker();
    if (this.onReward) this.onReward(reward, `${mission.title} complete — $${reward}`);
    if (this.missionIndex >= STORY.length) {
      this.state = 'allDone';
      return { text: mission.outro, kind: 'complete' };
    }
    this.placeMarker();
    const next = STORY[this.missionIndex];
    return { text: `${mission.outro} Next: ${next.title} — ${next.intro}`, kind: 'mission' };
  }

  // Taxi side job: a passenger waves at a random corner; drive them to
  // their stop for a fare. Offered when no mission step needs the car.
  updateTaxi(dt, px, pz, inCar, onPickup, onDropoff) {
    this.taxiCooldown -= dt;
    if (!this.taxi && this.taxiCooldown <= 0 && this.state !== 'idle') {
      const place = PLACES[['plaza', 'hotel', 'bank', 'marina'][Math.floor(Math.random() * 4)]];
      this.taxi = { x: place.x + 12, z: place.z + 8, destX: -place.x, destZ: -place.z, waiting: true };
      this.taxiCooldown = 45;
    }
    if (!this.taxi) return;
    const d = Math.hypot(px - this.taxi.x, pz - this.taxi.z);
    if (this.taxi.waiting && d < 5 && inCar) {
      this.taxi.waiting = false;
      if (onPickup) onPickup('Passenger aboard — drive to the far corner of town.');
    } else if (!this.taxi.waiting) {
      const dd = Math.hypot(px - this.taxi.destX, pz - this.taxi.destZ);
      if (dd < 6 && inCar) {
        if (onDropoff) onDropoff(ECONOMY.taxiFare);
        this.taxi = null;
        this.taxiCooldown = 30;
      }
    }
  }

  update(dt) {
    if (this.markerRing) {
      this.markerRing.rotation.z += dt;
      this.markerRing.position.y = 0.3 + Math.sin(performance.now() / 400) * 0.15;
    }
  }
}
