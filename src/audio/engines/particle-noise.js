const DEFAULT_PARAMS = {
  rate: 7,
  size: 0.08,
  density: 0.55,
  brightness: 0.65,
  scatter: 0.35,
  randomness: 0.45,
  level: 0.72,
  bandwidth: 0.42,
  delay: 0.28,
  reverb: 0.2,
  masterGain: 0.72,
};

export function createParticleNoiseEngine({ context, output }) {
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
    if (output?.masterGain) {
      output.setGain(state.params.masterGain);
    }
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
    }, 25);
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
        // Ignore already-stopped voices.
      }
      try {
        voice.disconnect();
      } catch (error) {
        // Ignore disconnect errors on dead nodes.
      }
    }
    state.voices.clear();
  }

  function tick() {
    const now = performance.now();
    const delta = Math.min(0.2, (now - state.lastTick) / 1000);
    state.lastTick = now;

    const densityMultiplier = 0.35 + state.params.density * 1.65;
    const spawnRate = Math.max(0, state.params.rate) * densityMultiplier;
    state.carry += spawnRate * delta;

    while (state.carry >= 1) {
      state.carry -= 1;
      spawnParticle();
    }

    stepParticles(delta);
  }

  function spawnParticle() {
    const params = state.params;
    const now = context.currentTime;
    const rand = signedNoise(params.randomness);
    const shardCount = 2 + Math.floor(params.density * 3);
    const baseFrequency = lerpLog(480, 15000, clamp(Math.pow(params.brightness, 1.25) + rand * 0.08, 0, 1));
    const bandwidthAmount = clamp(params.bandwidth, 0.05, 1.5);
    const pannerValue = clamp((Math.random() * 2 - 1) * params.scatter + rand * 0.26, -1, 1);
    const gainAmount = params.level * (0.42 + params.density * 0.62) * (0.78 + Math.random() * 0.2);

    for (let i = 0; i < shardCount; i += 1) {
      spawnShard({
        now: now + i * (0.009 + Math.random() * 0.016),
        params,
        centerFrequency: baseFrequency * (0.84 + Math.random() * 0.56),
        pannerValue: clamp(pannerValue + (Math.random() * 2 - 1) * params.scatter * 0.18, -1, 1),
        gainAmount: gainAmount * (0.52 + Math.random() * 0.5),
      });
    }

    state.particles.push({
      x: 0.5 + pannerValue * 0.42,
      y: 0.42 + rand * 0.16 + (1 - params.brightness) * 0.08,
      vx: rand * 0.12 + params.scatter * (Math.random() - 0.5) * 0.18,
      vy: 0.01 + Math.random() * 0.045,
      size: 1.4 + params.size * 15,
      life: 0.14 + params.size * 0.42,
      maxLife: 0.14 + params.size * 0.42,
      brightness: Math.min(1, params.brightness * 0.92 + 0.06),
      scatter: params.scatter,
      hue: 160 + params.brightness * 52,
      alpha: 0.22 + params.level * 0.48,
    });
  }

  function spawnShard({ now, params, centerFrequency, pannerValue, gainAmount }) {
    const duration = clamp(0.05 + params.size * 0.38 + Math.random() * 0.08, 0.04, 0.52);
    const attack = clamp(0.001 + params.size * 0.006, 0.001, 0.012);
    const release = Math.max(0.01, duration - attack);

    const noise = createNoiseBufferSource(context, duration + 0.06);
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const notch = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const mix = context.createGain();
    const delaySend = context.createGain();
    const delayLine = context.createDelay(0.35);
    const delayFeedback = context.createGain();
    const delayFilter = context.createBiquadFilter();
    const reverbSend = context.createGain();
    const reverbA = context.createDelay(0.12);
    const reverbB = context.createDelay(0.17);
    const reverbFeedback = context.createGain();
    const reverbFilter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const direct = context.createGain();
    const ring = context.createGain();
    const toneA = context.createOscillator();
    const toneB = context.createOscillator();
    const toneAGain = context.createGain();
    const toneBGain = context.createGain();

    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(clamp(centerFrequency * 0.44, 420, 16000), now);
    highpass.Q.setValueAtTime(1 + params.brightness * 2.4, now);

    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(centerFrequency, now);
    bandpass.Q.setValueAtTime(clamp(32 - bandwidthAmount * 15 + params.brightness * 4, 8, 42), now);

    notch.type = "notch";
    notch.frequency.setValueAtTime(clamp(centerFrequency * 1.48, 700, 16000), now);
    notch.Q.setValueAtTime(clamp(14 + params.randomness * 12, 8, 30), now);

    shaper.curve = makeDriveCurve(2.6 + params.brightness * 3.6);
    shaper.oversample = "4x";

    delaySend.gain.setValueAtTime(0.0001, now);
    delaySend.gain.exponentialRampToValueAtTime(gainAmount * (0.06 + params.delay * 0.34), now + attack * 0.9);
    delaySend.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    delayLine.delayTime.setValueAtTime(clamp(0.012 + params.delay * 0.18, 0.01, 0.22), now);
    delayFeedback.gain.setValueAtTime(clamp(0.06 + params.delay * 0.24, 0.04, 0.38), now);
    delayFilter.type = "lowpass";
    delayFilter.frequency.setValueAtTime(clamp(12000 - params.delay * 5200, 1800, 14000), now);
    delayFilter.Q.setValueAtTime(0.8, now);

    reverbSend.gain.setValueAtTime(0.0001, now);
    reverbSend.gain.exponentialRampToValueAtTime(gainAmount * (0.04 + params.reverb * 0.28), now + attack * 1.1);
    reverbSend.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    reverbA.delayTime.setValueAtTime(clamp(0.018 + params.reverb * 0.03, 0.012, 0.06), now);
    reverbB.delayTime.setValueAtTime(clamp(0.029 + params.reverb * 0.05, 0.018, 0.09), now);
    reverbFeedback.gain.setValueAtTime(clamp(0.1 + params.reverb * 0.22, 0.08, 0.34), now);
    reverbFilter.type = "highpass";
    reverbFilter.frequency.setValueAtTime(clamp(900 + params.reverb * 2200, 900, 3600), now);
    reverbFilter.Q.setValueAtTime(0.8, now);

    direct.gain.setValueAtTime(0.0001, now);
    direct.gain.exponentialRampToValueAtTime(gainAmount * 0.8, now + attack);
    direct.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    ring.gain.setValueAtTime(0.0001, now);
    ring.gain.exponentialRampToValueAtTime(gainAmount * 0.54, now + attack * 1.2);
    ring.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    toneA.type = "triangle";
    toneB.type = "sine";
    toneA.frequency.setValueAtTime(clamp(centerFrequency * (0.96 + Math.random() * 0.14), 180, 16000), now);
    toneB.frequency.setValueAtTime(clamp(centerFrequency * (1.82 + Math.random() * 0.26), 240, 16000), now);
    toneAGain.gain.setValueAtTime(0.0001, now);
    toneAGain.gain.exponentialRampToValueAtTime(gainAmount * 0.28, now + attack * 0.9);
    toneAGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    toneBGain.gain.setValueAtTime(0.0001, now);
    toneBGain.gain.exponentialRampToValueAtTime(gainAmount * 0.18, now + attack * 1.1);
    toneBGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    panner.pan.setValueAtTime(pannerValue, now);

    noise.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(notch);
    notch.connect(shaper);
    shaper.connect(direct);
    shaper.connect(ring);
    direct.connect(mix);
    ring.connect(mix);
    toneA.connect(toneAGain);
    toneB.connect(toneBGain);
    toneAGain.connect(mix);
    toneBGain.connect(mix);
    shaper.connect(delaySend);
    shaper.connect(reverbSend);
    delaySend.connect(delayLine);
    delayLine.connect(delayFilter);
    delayFilter.connect(delayFeedback);
    delayFeedback.connect(delayLine);
    delayFilter.connect(panner);
    reverbSend.connect(reverbA);
    reverbA.connect(reverbB);
    reverbB.connect(reverbFilter);
    reverbFilter.connect(reverbFeedback);
    reverbFeedback.connect(reverbA);
    reverbFilter.connect(panner);
    mix.connect(panner);
    panner.connect(output.input);

    const cleanupTime = now + duration + 0.08;
    trackVoice(state, noise);
    trackVoice(state, toneA);
    trackVoice(state, toneB);

    noise.start(now);
    noise.stop(cleanupTime);
    toneA.start(now);
    toneB.start(now);
    toneA.stop(cleanupTime);
    toneB.stop(cleanupTime);
  }

  function stepParticles(delta) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx += (Math.random() - 0.5) * particle.scatter * 0.04 * delta;
      particle.vy += (0.02 + particle.brightness * 0.08) * delta;
      if (particle.life <= 0 || particle.x < -0.1 || particle.x > 1.1 || particle.y > 1.2) {
        state.particles.splice(i, 1);
      }
    }
  }

  function getState() {
    return {
      params: { ...state.params },
      running: state.running,
      particles: state.particles,
    };
  }

  return {
    start,
    stop,
    stopAll,
    setParams,
    getState,
  };
}

function trackVoice(state, voice) {
  state.voices.add(voice);
  if ("onended" in voice) {
    voice.onended = () => {
      state.voices.delete(voice);
    };
  }
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
