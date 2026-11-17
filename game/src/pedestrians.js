// SOLMAR BAY — pedestrians. Simple walkers with names and a colour each, who
// stroll the sidewalks, cross at intersections, and scatter when a car or a
// gunshot comes too close. They are the city's life — and the reason a
// careless driver earns wanted stars.
import * as THREE from 'three';
import { CITY } from './config.js';
import { makeRng } from './rng.js';
import { nearestRoadCoord, resolveCollisions } from './world.js';

const PED_NAMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Felix', 'Greta', 'Hugo',
  'Ines', 'Jorge', 'Kira', 'Leo', 'Marta', 'Nico', 'Olga', 'Pablo',
  'Rita', 'Sofia', 'Tomas', 'Vera',
];
const SHIRT_COLORS = [0xe84a4a, 0x4a8ae8, 0x4ad88a, 0xe8c94a, 0xd84ad8, 0xffffff, 0x8a5a2a, 0x2a2a2a];

export function buildPedMesh(shirtColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), skin);
  head.position.y = 1.62;
  group.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirt);
  body.position.y = 1.05;
  group.add(body);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), pants);
  legL.position.set(-0.16, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.24), pants);
  legR.position.set(0.16, 0.35, 0);
  group.add(legR);
  return group;
}

export class Pedestrians {
  constructor(scene, seed, lines, colliders) {
    this.scene = scene;
    this.rng = makeRng(seed + 202);
    this.lines = lines;
    this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < 16; i += 1) this.spawn();
  }

  spawn() {
    const line = this.rng.pick(this.lines);
    const along = this.rng.range(-CITY.half + 10, CITY.half - 10);
    const horizontal = this.rng.chance(0.5);
    const x = horizontal ? along : line + 6.5;
    const z = horizontal ? line + 6.5 : along;
    const mesh = buildPedMesh(this.rng.pick(SHIRT_COLORS));
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.peds.push({
      mesh,
      name: this.rng.pick(PED_NAMES),
      x,
      z,
      heading: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(1.2, 2.2),
      horizontal,
      lane: line,
      hp: 50,
      flee: 0,
      alive: true,
    });
  }

  // A scare (gunshot, crash, car) at x,z makes nearby peds run away.
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.flee = 3;
        ped.heading = Math.atan2(ped.x - x, ped.z - z);
      }
    }
  }

  update(dt, playerPos) {
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      if (ped.flee > 0) {
        ped.flee -= dt;
        ped.speed = 5.5;
      } else {
        ped.speed = 1.8;
      }
      const along = ped.horizontal ? ped.x : ped.z;
      const cross = nearestRoadCoord(along, this.lines);
      if (Math.abs(along - cross) < 1 && this.rng.chance(dt * 0.2) && ped.flee <= 0) {
        ped.horizontal = !ped.horizontal;
        ped.lane = cross;
        ped.heading = ped.horizontal ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : this.rng.chance(0.5) ? 0 : Math.PI;
      }
      const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
      const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
      const fixed = resolveCollisions(this.colliders, nx, nz, 0.5);
      ped.x = fixed.x;
      ped.z = fixed.z;
      if (fixed.x !== nx || fixed.z !== nz) ped.heading += Math.PI / 2;
      if (Math.abs(ped.x) > CITY.half + 5 || Math.abs(ped.z) > CITY.half + 5) {
        ped.heading += Math.PI;
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
      // Bob while walking, so the crowd reads as alive.
      ped.mesh.position.y = Math.abs(Math.sin(performance.now() / 180 + ped.x)) * 0.06;
      void playerPos;
    }
  }

  // Nearest living ped within maxDist of a point (for punching / shooting).
  nearest(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  kill(ped) {
    ped.alive = false;
    ped.mesh.visible = false;
  }
}
