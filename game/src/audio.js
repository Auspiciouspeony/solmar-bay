// SOLMAR BAY — every sound is synthesised live with WebAudio: no audio
// files, no network, just oscillators and filtered noise. The bank stays
// silent until the player first interacts (browsers block audio before a
// gesture), and the M key toggles it. In a headless run it simply does
// nothing, and every method guards for a missing context.
export class SoundBank {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.context.destination);
      this.startMusic();
    } catch {
      this.context = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.4;
  }

  // A short blip of an oscillator, used for chimes and UI clicks.
  blip(freq, dur, type, vol) {
    if (!this.context || this.muted) return;
    const t = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // A burst of filtered noise: gunshots, punches, crashes.
  noise(dur, vol, freq) {
    if (!this.context || this.muted) return;
    const t = this.context.currentTime;
    const len = Math.max(1, Math.floor(this.context.sampleRate * dur));
    const buffer = this.context.createBuffer(1, len, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.context.createBufferSource();
    src.buffer = buffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 1200;
    const gain = this.context.createGain();
    gain.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shoot() {
    this.noise(0.12, 0.5, 2600);
    this.blip(180, 0.08, 'square', 0.15);
  }

  punch() {
    this.noise(0.09, 0.35, 500);
  }

  crash() {
    this.noise(0.3, 0.5, 700);
  }

  pickup() {
    this.blip(880, 0.12, 'sine', 0.25);
    setTimeout(() => this.blip(1318, 0.18, 'sine', 0.25), 90);
  }

  cash() {
    this.blip(1046, 0.1, 'triangle', 0.25);
    setTimeout(() => this.blip(1568, 0.22, 'triangle', 0.25), 110);
  }

  // Engine hum: a sawtooth whose pitch follows speed, started once.
  setEngine(speed01, driving) {
    if (!this.context || this.muted) return;
    if (!this.engineOsc) {
      this.engineOsc = this.context.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.context.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const target = driving ? 0.05 + speed01 * 0.09 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.context.currentTime, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 110, this.context.currentTime, 0.1);
  }

  // Two-tone police siren, started once, gain toggled by wanted level.
  setSiren(on) {
    if (!this.context) return;
    if (!this.sirenOsc) {
      this.sirenOsc = this.context.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.context.createGain();
      this.sirenGain.gain.value = 0;
      const lfo = this.context.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.context.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.frequency.value = 750;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
    }
    this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.045 : 0, this.context.currentTime, 0.3);
  }

  // A slow, sunny four-chord loop: C – Am – F – G, one soft triangle note
  // per beat, so the bay always has music without any audio file.
  startMusic() {
    if (!this.context || this.musicTimer) return;
    const chords = [
      [261.6, 329.6, 392.0],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
    ];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.context) return;
      const chord = chords[this.musicStep % chords.length];
      this.musicStep += 1;
      const t = this.context.currentTime;
      chord.forEach((freq) => {
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.045, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(t);
        osc.stop(t + 1.7);
      });
    }, 450);
  }
}
