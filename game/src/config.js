// SOLMAR BAY — tuning numbers and story data. One place for every knob the
// game balances on, so a tweak here retunes the whole game without touching
// the rules. Solmar Bay is an original sun-soaked coastal city; every name,
// character and place below is invented for this game.
export const GAME = {
  title: 'SOLMAR BAY',
  subtitle: 'An original open-world crime story',
  seedDefault: 7,
  saveKey: 'solmarbay-save-v1',
};

export const CITY = {
  blocks: 7, // blocks per side
  blockSize: 42,
  roadWidth: 14,
  // City spans from -half to +half on x and z.
  get half() {
    return (this.blocks * (this.blockSize + this.roadWidth)) / 2;
  },
  buildingMaxHeight: 46,
};

export const PLAYER = {
  walkSpeed: 9,
  runSpeed: 14,
  maxHp: 100,
  punchDamage: 15,
  punchRange: 2.4,
  shootDamage: 34,
  shootRange: 90,
  fireRate: 5, // shots per second
  radius: 0.7,
};

export const CAR = {
  accel: 26,
  brake: 42,
  maxSpeed: 34,
  reverseSpeed: 12,
  turnRate: 1.9,
  maxHp: 100,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds unseen before a star drops
  stealStars: 1,
  shootStars: 2,
  killStars: 2,
  hitPedStars: 1,
};

export const ECONOMY = {
  startCash: 120,
  missionRewards: [500, 1200, 3000],
  taxiFare: 180,
  shellValue: 150,
  shellCount: 12,
};

// Story: three chained missions. Each step is a marker the player must reach
// (on foot or in a car); some steps need an action key (E) at the marker.
export const STORY = [
  {
    id: 'm1',
    title: 'FIRST WHEELS',
    giver: 'Rosa Marlin — your fixer, calls from the marina payphone',
    intro:
      "Rosa: \"Kid, welcome to Solmar Bay. You need wheels before you need anything. There is a sunset-orange coupe parked by the marina. Take it. Don't ask whose it is.\"",
    steps: [
      { kind: 'goto', label: 'Steal the orange coupe at the marina', at: 'marina' },
      { kind: 'drive', label: "Drive the coupe to Rosa's garage", at: 'garage' },
    ],
    reward: 500,
    outro: 'Rosa: "Clean work. The garage is yours now — park anything there."',
  },
  {
    id: 'm2',
    title: 'THE PICKUP',
    giver: 'Rosa Marlin',
    intro:
      'Rosa: "A crate of harbour lights is sitting at the old fish warehouse. Customs never cleared it. Go get it — on foot, quiet — then drive it to the Neon Palms hotel."',
    steps: [
      { kind: 'goto', label: 'Reach the fish warehouse', at: 'warehouse' },
      { kind: 'action', label: 'Press E to grab the crate', at: 'warehouse' },
      { kind: 'drive', label: 'Deliver the crate to the Neon Palms hotel', at: 'hotel' },
    ],
    reward: 1200,
    outro: 'Rosa: "The hotel pays in cash and asks no questions. You are earning a name."',
  },
  {
    id: 'm3',
    title: 'BAY HEIST',
    giver: 'Rosa Marlin',
    intro:
      'Rosa: "Last job, big money. The Bay Credit vault opens at noon and the guard takes a long lunch. Grab the cash, then lose the heat and get to the hideout. Do not get busted."',
    steps: [
      { kind: 'goto', label: 'Reach Bay Credit bank', at: 'bank' },
      { kind: 'action', label: 'Press E to crack the vault', at: 'bank' },
      { kind: 'escape', label: 'Escape the police and reach the hideout', at: 'hideout' },
    ],
    reward: 3000,
    outro:
      'Rosa: "Three grand, no cuffs. You own this bay now, kid. Solmar Bay is yours — keep driving."',
  },
];

export const PLACES = {
  marina: { x: -120, z: -120, label: 'Marina' },
  garage: { x: 118, z: -118, label: "Rosa's Garage" },
  warehouse: { x: -118, z: 118, label: 'Fish Warehouse' },
  hotel: { x: 118, z: 118, label: 'Neon Palms Hotel' },
  bank: { x: 0, z: -118, label: 'Bay Credit Bank' },
  hideout: { x: 0, z: 118, label: 'Hideout' },
  plaza: { x: 0, z: 0, label: 'Solmar Plaza' },
};

export const DIALOGUE = {
  start:
    'You are Milo Vane, a drifter with $120 and a borrowed jacket. Rosa Marlin, the fixer who runs the marina, has work for you — if you can handle it. Steal cars, outrun the Bay Police, and take Solmar Bay for yourself.',
  busted: 'BUSTED — The Bay Police caught up with you. Rosa posts your bail... this time.',
  wasted: 'WASTED — Solmar Bay is unforgiving. You wake up at the marina clinic, lighter in the pocket.',
  complete:
    'SOLMAR BAY IS YOURS — Every mission done, every debt paid. The bay belongs to Milo Vane.',
};
