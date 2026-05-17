const DEFAULT_PARAMS = {
  rate: 5,
  size: 0.08,
  density: 0.55,
  brightness: 0.72,
  scatter: 0.35,
  randomness: 0.45,
  level: 0.68,
  bandwidth: 0.42,
  delay: 0.28,
  reverb: 0.2,
  masterGain: 0.72,
};

export function createMetallicEngine({ context, output }) {
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
    }, 24);
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

    const spawnRate = Math.max(0, state.params.rate) * (0.3 + state.params.density * 1.8);
    state.carry += spawnRate * delta;

    while (state.carry >= 1) {
      state.carry -= 1;
      spawnMetalHit();
    }

    stepParticles(delta);
  }

  function spawnMetalHit() {
    const params = state.params;
    const now = context.currentTime;
    const bandwidthAmount = clamp(params.bandwidth, 0.05, 1.5);
    const scrapeCount = 5 + Math.floor(params.density * 5);
    const baseFrequency = lerpLog(90, 1800, clamp(0.18 + params.brightness * 0.58 + signedNoise(params.randomness) * 0.08, 0, 1));
    const panBase = clamp((Math.random() * 2 - 1) * params.scatter + signedNoise(params.randomness) * 0.35, -1, 1);
    const gainAmount = params.level * (0.36 + params.density * 0.8) * (0.82 + Math.random() * 0.28);

    for (let i = 0; i < scrapeCount; i += 1) {
      spawnScrapeBurst({
        now: now + i * (0.008 + Math.random() * 0.014),
        params,
        baseFrequency: baseFrequency * (0.7 + Math.random() * 0.72),
        pan: clamp(panBase + (Math.random() * 2 - 1) * params.scatter * 0.45, -1, 1),
        gainAmount: gainAmount * (0.55 + Math.random() * 0.58),
      });
    }

    state.particles.push({
      x: 0.5 + panBase * 0.36,
      y: 0.46 + signedNoise(params.randomness) * 0.08,
      vx: signedNoise(params.randomness) * 0.03 + params.scatter * (Math.random() - 0.5) * 0.06,
      vy: 0.006 + Math.random() * 0.03,
      size: 2.8 + params.size * 13,
      life: 0.56 + params.size * 0.88,
      maxLife: 0.56 + params.size * 0.88,
      brightness: params.brightness,
      scatter: params.scatter,
      hue: 40 + params.brightness * 18,
      alpha: 0.26 + params.level * 0.42,
    });
  }

  function spawnScrapeBurst({ now, params, baseFrequency, pan, gainAmount }) {
    const random = signedNoise(params.randomness);
    const burstDuration = clamp(0.46 + params.size * 1.35, 0.26, 1.9);
    const attack = clamp(0.001 + params.size * 0.01, 0.001, 0.016);
    const sustain = burstDuration * (0.24 + params.density * 0.18);
    const decay = Math.max(0.14, burstDuration - attack - sustain);

    const noise = createNoiseBufferSource(context, burstDuration + 0.16);
    const exciter = context.createBiquadFilter();
    const body = context.createBiquadFilter();
    const ring = context.createBiquadFilter();
    const scratch = context.createBiquadFilter();
    const shimmer = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const mix = context.createGain();
    const panner = context.createStereoPanner();
    const direct = context.createGain();
    const ringBus = context.createGain();
    const burstGain = context.createGain();
    const resonanceGain = context.createGain();
    const delay = context.createDelay(0.08);
    const feedback = context.createGain();
    const delayFilter = context.createBiquadFilter();
    const reverbA = context.createDelay(0.14);
    const reverbB = context.createDelay(0.21);
    const reverbFeedback = context.createGain();
    const reverbFilter = context.createBiquadFilter();
    const oscillators = [];

    exciter.type = "bandpass";
    exciter.frequency.setValueAtTime(clamp(baseFrequency * (0.72 + Math.random() * 0.32), 120, 6000), now);
    exciter.Q.setValueAtTime(clamp(18 - bandwidthAmount * 6 + params.brightness * 8, 6, 28), now);

    body.type = "bandpass";
    body.frequency.setValueAtTime(clamp(baseFrequency * (0.92 + random * 0.12), 100, 9000), now);
    body.Q.setValueAtTime(clamp(38 - bandwidthAmount * 12 + params.size * 10, 10, 52), now);

    ring.type = "bandpass";
    ring.frequency.setValueAtTime(clamp(baseFrequency * 1.96, 160, 12000), now);
    ring.Q.setValueAtTime(clamp(42 - bandwidthAmount * 14 + params.brightness * 6, 12, 56), now);

    scratch.type = "bandpass";
    scratch.frequency.setValueAtTime(clamp(baseFrequency * 0.82, 120, 8000), now);
    scratch.frequency.linearRampToValueAtTime(clamp(baseFrequency * 2.1, 220, 14000), now + burstDuration * 0.55);
    scratch.frequency.linearRampToValueAtTime(clamp(baseFrequency * 1.16, 180, 10000), now + burstDuration);
    scratch.Q.setValueAtTime(clamp(46 - bandwidthAmount * 16 + params.randomness * 4, 14, 60), now);

    shimmer.type = "highpass";
    shimmer.frequency.setValueAtTime(clamp(baseFrequency * 2.8, 400, 16000), now);
    shimmer.Q.setValueAtTime(clamp(1 + params.scatter * 4, 0.8, 8), now);

    shaper.curve = makeDriveCurve(3.2 + params.brightness * 5.4);
    shaper.oversample = "4x";

    delay.delayTime.setValueAtTime(clamp(0.011 + params.size * 0.014 + Math.random() * 0.006, 0.01, 0.036), now);
    feedback.gain.setValueAtTime(0.0001, now);
    feedback.gain.exponentialRampToValueAtTime(0.2 + params.brightness * 0.28, now + attack * 1.2);
    feedback.gain.exponentialRampToValueAtTime(0.0001, now + burstDuration);
    delayFilter.type = "lowpass";
    delayFilter.frequency.setValueAtTime(clamp(10400 - params.delay * 5200, 1500, 12000), now);
    delayFilter.Q.setValueAtTime(0.8, now);

    reverbA.delayTime.setValueAtTime(clamp(0.017 + params.reverb * 0.03, 0.012, 0.06), now);
    reverbB.delayTime.setValueAtTime(clamp(0.029 + params.reverb * 0.05, 0.018, 0.09), now);
    reverbFeedback.gain.setValueAtTime(clamp(0.12 + params.reverb * 0.28, 0.08, 0.36), now);
    reverbFilter.type = "highpass";
    reverbFilter.frequency.setValueAtTime(clamp(1100 + params.reverb * 2400, 900, 4200), now);
    reverbFilter.Q.setValueAtTime(0.8, now);

    direct.gain.setValueAtTime(0.0001, now);
    direct.gain.exponentialRampToValueAtTime(gainAmount * 0.26, now + attack);
    direct.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

    ringBus.gain.setValueAtTime(0.0001, now);
    ringBus.gain.exponentialRampToValueAtTime(gainAmount * 0.94, now + attack * 1.4);
    ringBus.gain.exponentialRampToValueAtTime(gainAmount * 0.52, now + attack + sustain * 0.72);
    ringBus.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + decay);

    burstGain.gain.setValueAtTime(0.0001, now);
    burstGain.gain.exponentialRampToValueAtTime(gainAmount, now + attack * 0.8);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, now + burstDuration);

    resonanceGain.gain.setValueAtTime(0.0001, now);
    resonanceGain.gain.exponentialRampToValueAtTime(gainAmount * 0.82, now + attack * 1.15);
    resonanceGain.gain.exponentialRampToValueAtTime(gainAmount * 0.46, now + attack + sustain * 0.8);
    resonanceGain.gain.exponentialRampToValueAtTime(0.0001, now + burstDuration + 0.06);

    panner.pan.setValueAtTime(pan, now);

    noise.connect(exciter);
    exciter.connect(body);
    body.connect(shaper);
    body.connect(scratch);
    shaper.connect(direct);
    direct.connect(mix);

    const modes = [
      { ratio: 1.01, gain: 0.18, q: 26, type: "square" },
      { ratio: 1.33, gain: 0.16, q: 30, type: "sawtooth" },
      { ratio: 1.79, gain: 0.15, q: 34, type: "square" },
      { ratio: 2.43, gain: 0.12, q: 38, type: "sawtooth" },
      { ratio: 3.67, gain: 0.09, q: 42, type: "triangle" },
      { ratio: 5.21, gain: 0.06, q: 48, type: "sine" },
    ];

    for (const mode of modes) {
      const oscillator = context.createOscillator();
      const modeFilter = context.createBiquadFilter();
      const modeGain = context.createGain();
      const detune = (Math.random() * 2 - 1) * (18 + params.randomness * 28);
      oscillator.type = mode.type;
      oscillator.frequency.setValueAtTime(clamp(baseFrequency * mode.ratio, 90, 16000), now);
      oscillator.detune.setValueAtTime(detune, now);
      modeFilter.type = "bandpass";
      modeFilter.frequency.setValueAtTime(clamp(baseFrequency * mode.ratio, 120, 16000), now);
      modeFilter.Q.setValueAtTime(clamp(mode.q - bandwidthAmount * 4, 10, 56), now);
      modeGain.gain.setValueAtTime(0.0001, now);
      modeGain.gain.exponentialRampToValueAtTime(mode.gain * gainAmount, now + attack * 1.2);
      modeGain.gain.exponentialRampToValueAtTime(mode.gain * gainAmount * 0.5, now + burstDuration * 0.38);
      modeGain.gain.exponentialRampToValueAtTime(0.0001, now + burstDuration);
      oscillator.connect(modeFilter);
      modeFilter.connect(modeGain);
      modeGain.connect(ringBus);
      oscillators.push(oscillator);
    }

    ringBus.connect(ring);
    ring.connect(shimmer);
    shimmer.connect(resonanceGain);
    scratch.connect(ringBus);
    resonanceGain.connect(mix);
    mix.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayFilter);
    delayFilter.connect(mix);
    mix.connect(reverbA);
    reverbA.connect(reverbB);
    reverbB.connect(reverbFilter);
    reverbFilter.connect(reverbFeedback);
    reverbFeedback.connect(reverbA);
    reverbFilter.connect(mix);
    mix.connect(panner);
    panner.connect(output.input);

    const cleanupTime = now + burstDuration + 0.12;
    trackVoice(state, noise);
    for (const oscillator of oscillators) {
      trackVoice(state, oscillator);
    }

    noise.start(now);
    noise.stop(cleanupTime);
    for (const oscillator of oscillators) {
      oscillator.start(now);
      oscillator.stop(cleanupTime);
    }
  }

  function stepParticles(delta) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx += (Math.random() - 0.5) * particle.scatter * 0.03 * delta;
      particle.vy += (0.01 + particle.brightness * 0.06) * delta;
      if (particle.life <= 0 || particle.x < -0.1 || particle.x > 1.1 || particle.y > 1.2) {
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
