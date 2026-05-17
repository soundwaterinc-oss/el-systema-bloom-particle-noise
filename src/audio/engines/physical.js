const DEFAULT_PARAMS = {
  rate: 4.5,
  size: 0.1,
  density: 0.62,
  brightness: 0.52,
  scatter: 0.4,
  randomness: 0.55,
  level: 0.7,
  bandwidth: 0.42,
  delay: 0.28,
  reverb: 0.2,
  masterGain: 0.72,
};

export function createPhysicalEngine({ context, output }) {
  const state = {
    running: false,
    ticker: null,
    carry: 0,
    lastTick: performance.now(),
    params: { ...DEFAULT_PARAMS },
    voices: new Set(),
    particles: [],
  };

  function setParams(nextParams) {
    state.params = { ...state.params, ...nextParams };
    output?.setGain?.(state.params.masterGain);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.lastTick = performance.now();
    state.ticker = window.setInterval(() => {
      try {
        tick();
      } catch (error) {
        console.error(error);
      }
    }, 28);
  }

  function stop() {
    state.running = false;
    if (state.ticker) {
      window.clearInterval(state.ticker);
      state.ticker = null;
    }
    stopVoices();
  }

  function stopAll() {
    stop();
    state.particles.length = 0;
    state.carry = 0;
  }

  function stopVoices() {
    for (const voice of state.voices) {
      try {
        voice.stop(context.currentTime + 0.02);
      } catch (error) {
        // ignore
      }
      try {
        voice.disconnect();
      } catch (error) {
        // ignore
      }
    }
    state.voices.clear();
  }

  function tick() {
    const now = performance.now();
    const delta = Math.min(0.2, (now - state.lastTick) / 1000);
    state.lastTick = now;

    const spawnRate = Math.max(0, state.params.rate) * (0.28 + state.params.density * 1.92);
    state.carry += spawnRate * delta;

    while (state.carry >= 1) {
      state.carry -= 1;
      spawnPhysicalParticle();
    }

    stepParticles(delta);
  }

  function spawnPhysicalParticle() {
    const params = state.params;
    const now = context.currentTime;
    const random = signedNoise(params.randomness);
    const bandwidthAmount = clamp(params.bandwidth, 0.05, 1.5);
    const centerFrequency = lerpLog(110, 12000, clamp(0.18 + params.brightness * 0.58 + random * 0.08, 0, 1));
    const duration = clamp(0.06 + params.size * 0.38, 0.06, 0.68);
    const noise = createNoiseBufferSource(context, duration + 0.08);
    const bodyFilter = context.createBiquadFilter();
    const presenceFilter = context.createBiquadFilter();
    const airFilter = context.createBiquadFilter();
    const gritFilter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const tone = context.createOscillator();
    const tone2 = context.createOscillator();
    const drone = context.createOscillator();
    const toneGain = context.createGain();
    const bodyGain = context.createGain();
    const drive = context.createWaveShaper();
    const dust = context.createGain();
    const grit = context.createGain();
    const delay = context.createDelay(0.12);
    const delayFeedback = context.createGain();
    const delayFilter = context.createBiquadFilter();
    const reverbA = context.createDelay(0.16);
    const reverbB = context.createDelay(0.23);
    const reverbFeedback = context.createGain();
    const reverbFilter = context.createBiquadFilter();

    bodyFilter.type = "bandpass";
    bodyFilter.frequency.setValueAtTime(clamp(centerFrequency * (0.76 + Math.random() * 0.18), 120, 12000), now);
    bodyFilter.Q.setValueAtTime(clamp(18 - bandwidthAmount * 6 + params.size * 6, 2, 24), now);

    presenceFilter.type = "bandpass";
    presenceFilter.frequency.setValueAtTime(clamp(centerFrequency * (1.32 + random * 0.16), 220, 16000), now);
    presenceFilter.Q.setValueAtTime(clamp(22 - bandwidthAmount * 8 + params.brightness * 6, 3, 30), now);

    airFilter.type = "highpass";
    airFilter.frequency.setValueAtTime(clamp(centerFrequency * 0.54, 320, 16000), now);
    airFilter.Q.setValueAtTime(clamp(1.1 + params.scatter * 4.4, 0.8, 10), now);

    gritFilter.type = "bandpass";
    gritFilter.frequency.setValueAtTime(clamp(centerFrequency * 2.3, 500, 16000), now);
    gritFilter.Q.setValueAtTime(clamp(16 - bandwidthAmount * 5 + params.brightness * 6, 5, 24), now);

    tone.type = "sawtooth";
    tone2.type = "triangle";
    drone.type = "sine";
    tone.frequency.setValueAtTime(clamp(centerFrequency * (0.48 + Math.random() * 0.4), 90, 9000), now);
    tone2.frequency.setValueAtTime(clamp(centerFrequency * (0.94 + Math.random() * 0.62), 120, 16000), now);
    drone.frequency.setValueAtTime(clamp(centerFrequency * 0.32, 40, 1200), now);
    drone.detune.setValueAtTime((Math.random() * 2 - 1) * 12, now);

    drive.curve = makeDriveCurve(2.8 + params.brightness * 5.8);
    drive.oversample = "4x";

    delay.delayTime.setValueAtTime(clamp(0.01 + params.delay * 0.06, 0.01, 0.08), now);
    delayFeedback.gain.setValueAtTime(clamp(0.08 + params.delay * 0.22, 0.04, 0.34), now);
    delayFilter.type = "lowpass";
    delayFilter.frequency.setValueAtTime(clamp(9200 - params.delay * 3600, 1400, 12000), now);
    delayFilter.Q.setValueAtTime(0.8, now);

    reverbA.delayTime.setValueAtTime(clamp(0.018 + params.reverb * 0.03, 0.012, 0.06), now);
    reverbB.delayTime.setValueAtTime(clamp(0.032 + params.reverb * 0.05, 0.02, 0.09), now);
    reverbFeedback.gain.setValueAtTime(clamp(0.12 + params.reverb * 0.24, 0.08, 0.34), now);
    reverbFilter.type = "highpass";
    reverbFilter.frequency.setValueAtTime(clamp(780 + params.reverb * 2000, 700, 3200), now);
    reverbFilter.Q.setValueAtTime(0.8, now);

    const attack = clamp(0.0008 + params.size * 0.008, 0.0008, 0.012);
    const release = Math.max(0.03, duration - attack);
    const gainAmount = params.level * (0.38 + params.density * 0.82) * (0.76 + Math.random() * 0.24);
    const pan = clamp((Math.random() * 2 - 1) * params.scatter + random * 0.55, -1, 1);

    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(gainAmount * 0.92, now + attack * 1.3);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainAmount, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(gainAmount * 0.22, now + attack * 0.9);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, attack + 0.028));

    dust.gain.setValueAtTime(0.0001, now);
    dust.gain.exponentialRampToValueAtTime(gainAmount * 0.28, now + attack * 0.7);
    dust.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    grit.gain.setValueAtTime(0.0001, now);
    grit.gain.exponentialRampToValueAtTime(gainAmount * 0.26, now + attack * 1.2);
    grit.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    panner.pan.setValueAtTime(pan, now);

    noise.connect(bodyFilter);
    bodyFilter.connect(presenceFilter);
    presenceFilter.connect(gritFilter);
    gritFilter.connect(airFilter);
    airFilter.connect(drive);
    drive.connect(bodyGain);
    bodyGain.connect(gain);
    tone.connect(toneGain);
    tone2.connect(toneGain);
    drone.connect(dust);
    toneGain.connect(gain);
    dust.connect(gain);
    gritFilter.connect(grit);
    grit.connect(gain);
    gain.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delay);
    delayFilter.connect(panner);
    gain.connect(reverbA);
    reverbA.connect(reverbB);
    reverbB.connect(reverbFilter);
    reverbFilter.connect(reverbFeedback);
    reverbFeedback.connect(reverbA);
    reverbFilter.connect(panner);
    gain.connect(panner);
    panner.connect(output.input);

    const cleanupTime = now + duration + 0.12;
    trackVoice(state, noise);
    trackVoice(state, tone);
    trackVoice(state, tone2);
    trackVoice(state, drone);

    noise.start(now);
    tone.start(now);
    tone2.start(now);
    drone.start(now);
    noise.stop(cleanupTime);
    tone.stop(cleanupTime);
    tone2.stop(cleanupTime);
    drone.stop(cleanupTime);

    state.particles.push({
      x: 0.5 + pan * 0.38,
      y: 0.5 + random * 0.16,
      vx: random * 0.09 + params.scatter * (Math.random() - 0.5) * 0.16,
      vy: 0.018 + Math.random() * 0.05,
      size: 1.1 + params.size * 13,
      life: duration,
      maxLife: duration,
      brightness: Math.min(1, params.brightness * 0.88 + 0.08),
      scatter: params.scatter,
      hue: 196 + params.brightness * 28,
      alpha: 0.18 + params.level * 0.42,
    });
  }

  function stepParticles(delta) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += (0.02 + particle.brightness * 0.05) * delta;
      particle.vx += (Math.random() - 0.5) * particle.scatter * 0.03 * delta;
      if (particle.life <= 0 || particle.x < -0.1 || particle.x > 1.1 || particle.y > 1.25) {
        state.particles.splice(i, 1);
      }
    }
  }

  return {
    start,
    stop,
    stopAll,
    setParams,
    getState() {
      return {
        params: { ...state.params },
        running: state.running,
        particles: state.particles,
      };
    },
  };
}

function createNoiseBufferSource(context, duration) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerpLog(min, max, t) {
  return min * (max / min) ** t;
}

function signedNoise(amount) {
  return (Math.random() * 2 - 1) * (0.5 + amount * 0.5);
}

function makeDriveCurve(amount) {
  const curve = new Float32Array(1024);
  const k = Math.max(1, amount * 12);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function trackVoice(state, voice) {
  state.voices.add(voice);
  if ("onended" in voice) {
    voice.onended = () => {
      state.voices.delete(voice);
    };
  }
}
