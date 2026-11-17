// SOLMAR BAY — the city itself. A seeded grid of streets and blocks: asphalt
// roads with centre dashes, sidewalks, procedural buildings with lit windows,
// streetlights, palm trees, beach sand at the south edge, and the named
// landmark spots (marina, garage, warehouse, hotel, bank, hideout, plaza).
// Everything is built from boxes and cylinders in code — no model files.
// The city also owns the collision boxes and the golden-shell collectibles.
import * as THREE from 'three';
import { CITY, ECONOMY, PLACES } from './config.js';
import { makeRng } from './rng.js';

const BUILDING_COLORS = [0xf2e3c6, 0xe8b4a0, 0xa8c8d8, 0xd8d8c8, 0xf0c8d8, 0xb8d8b8, 0xe0d0b0, 0xc8b8e0];
const ROOF_COLORS = [0x8a5a3a, 0x5a6a7a, 0x7a4a3a, 0x4a5a6a];

function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// Road centre lines, one per gap between blocks, both directions.
export function roadLines() {
  const pitch = CITY.blockSize + CITY.roadWidth;
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const c = -CITY.half + i * pitch - CITY.roadWidth / 2;
    lines.push(c);
  }
  return lines;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const group = new THREE.Group();
  group.name = 'city';

  // Ground: grass-green base, then the beach strip at the south edge.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 80),
    new THREE.MeshLambertMaterial({ color: 0x7fae62 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 20;
  group.add(ground);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, 46),
    new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, CITY.half + 42);
  group.add(beach);
  // The bay itself: a blue plane beyond the beach.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, 60),
    new THREE.MeshLambertMaterial({ color: 0x2a7ab8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, CITY.half + 95);
  group.add(sea);

  // Roads: dark asphalt ribbons along every grid line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2d060 });
  const lines = roadLines();
  for (const c of lines) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY.half * 2, CITY.roadWidth), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.05, c);
    group.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, CITY.half * 2), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.05, 0);
    group.add(v);
    // Centre dashes along each road.
    for (let d = -CITY.half + 8; d < CITY.half; d += 10) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(d, 0.08, c);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.08, d);
      group.add(dashV);
    }
  }

  // Blocks: 1–4 buildings each, with window grids made of small emissive
  // planes, plus a plaza park in the centre block and a marina pier.
  const pitch = CITY.blockSize + CITY.roadWidth;
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const windowDark = new THREE.MeshBasicMaterial({ color: 0x2a3542 });
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const cx = -CITY.half + CITY.roadWidth / 2 + bx * pitch + CITY.blockSize / 2;
      const cz = -CITY.half + CITY.roadWidth / 2 + bz * pitch + CITY.blockSize / 2;
      const isPlaza = bx === 3 && bz === 3;
      const isMarina = bx === 0 && bz === 0;
      if (isPlaza) {
        // Solmar Plaza: a fountain circle and benches, no buildings.
        const fountain = new THREE.Mesh(
          new THREE.CylinderGeometry(6, 7, 1.2, 20),
          new THREE.MeshLambertMaterial({ color: 0x9ac8e8 }),
        );
        fountain.position.set(cx, 0.6, cz);
        group.add(fountain);
        for (let i = 0; i < 6; i += 1) {
          const palm = makePalm(rng);
          palm.position.set(cx + Math.cos((i / 6) * Math.PI * 2) * 15, 0, cz + Math.sin((i / 6) * Math.PI * 2) * 15);
          group.add(palm);
        }
        continue;
      }
      if (isMarina) {
        // Marina: wooden pier out toward the corner, plus low sheds.
        const pier = box(8, 0.8, 26, 0x8a6a4a, cx, 0.4, cz - 6);
        group.add(pier);
        const shed = box(14, 5, 8, 0xd8c8a8, cx + 8, 2.5, cz + 10);
        group.add(shed);
        colliders.push({ minX: cx + 1, maxX: cx + 15, minZ: cz + 6, maxZ: cz + 14 });
        continue;
      }
      const count = rng.int(1, 4);
      for (let n = 0; n < count; n += 1) {
        const w = rng.range(10, 18);
        const d = rng.range(10, 18);
        const h = rng.range(8, CITY.buildingMaxHeight);
        const ox = cx + rng.range(-10, 10);
        const oz = cz + rng.range(-10, 10);
        const color = rng.pick(BUILDING_COLORS);
        const building = box(w, h, d, color, ox, h / 2, oz);
        group.add(building);
        const roof = box(w + 0.6, 0.8, d + 0.6, rng.pick(ROOF_COLORS), ox, h + 0.4, oz);
        group.add(roof);
        colliders.push({ minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2 });
        // Windows on the two street-facing sides.
        const floors = Math.max(1, Math.floor(h / 5));
        const cols = Math.max(2, Math.floor(w / 4));
        for (let f = 0; f < floors; f += 1) {
          for (let c = 0; c < cols; c += 1) {
            const win = new THREE.Mesh(
              new THREE.PlaneGeometry(1.4, 1.8),
              rng.chance(0.45) ? windowMat : windowDark,
            );
            win.position.set(ox - w / 2 + 2 + c * 3.4, 3.5 + f * 5, oz + d / 2 + 0.06);
            group.add(win);
          }
        }
      }
      // One palm per block, at a random corner.
      const palm = makePalm(rng);
      palm.position.set(cx + rng.range(-16, 16), 0, cz + rng.range(-16, 16));
      group.add(palm);
    }
  }

  // Streetlights along the roads, every other intersection.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (const c of lines) {
    for (let d = -CITY.half + 20; d < CITY.half; d += 56) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 8), lampMat);
      pole.position.set(c + CITY.roadWidth / 2 - 1, 3.5, d);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), bulbMat);
      bulb.position.set(c + CITY.roadWidth / 2 - 1, 7.1, d);
      group.add(bulb);
    }
  }

  // Landmark signs: coloured beacon pillars so mission spots read at a glance.
  const landmarkColors = { marina: 0x2ab8e8, garage: 0xff8c2a, warehouse: 0x8a6ad8, hotel: 0xff4ad8, bank: 0x2ad86a, hideout: 0xe82a2a };
  for (const [key, place] of Object.entries(PLACES)) {
    if (key === 'plaza') continue;
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 9, 8),
      new THREE.MeshBasicMaterial({ color: landmarkColors[key] || 0xffffff }),
    );
    beacon.position.set(place.x + 6, 4.5, place.z);
    group.add(beacon);
  }

  // Golden shells: the side collectible, scattered on sidewalks.
  const shells = [];
  const shellGeo = new THREE.SphereGeometry(0.55, 10, 10);
  const shellMat = new THREE.MeshBasicMaterial({ color: 0xffd94a });
  for (let i = 0; i < ECONOMY.shellCount; i += 1) {
    const x = rng.range(-CITY.half + 10, CITY.half - 10);
    const z = rng.range(-CITY.half + 10, CITY.half - 10);
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.set(x, 0.8, z);
    group.add(mesh);
    shells.push({ x, z, mesh, taken: false });
  }

  scene.add(group);
  return { group, colliders, shells, lines };
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.4, 6, 7),
    new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
  );
  trunk.position.y = 3;
  trunk.rotation.z = rng.range(-0.12, 0.12);
  palm.add(trunk);
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 2.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x3a9a4a }),
  );
  leaves.position.y = 6.8;
  palm.add(leaves);
  return palm;
}

// Keep a circle (player or car) out of building boxes; returns corrected x/z.
export function resolveCollisions(colliders, x, z, radius) {
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        nx = cx + (dx / dist) * radius;
        nz = cz + (dz / dist) * radius;
      } else {
        nz = c.maxZ + radius;
      }
    }
  }
  const half = CITY.half + 30;
  nx = Math.max(-half, Math.min(half, nx));
  nz = Math.max(-half, Math.min(half + 60, nz));
  return { x: nx, z: nz };
}

// Snap a point to the nearest road centre line (used for traffic lanes).
export function nearestRoadCoord(value, lines) {
  let best = lines[0];
  for (const line of lines) {
    if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  }
  return best;
}
