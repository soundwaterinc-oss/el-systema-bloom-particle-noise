import { ensureAudioContext, resumeAudioContext, suspendAudioContext, getAudioContext } from "./audio/context.js";
import { createMasterGraph } from "./audio/master.js";
import { createParticleNoiseEngine } from "./audio/engines/particle-noise.js";
import { createMetallicEngine } from "./audio/engines/metallic.js";
import { createPhysicalEngine } from "./audio/engines/physical.js";
import { bindUI } from "./ui/bindings.js";
import { createParticleField } from "./visual/particle-field.js";

const elements = {
  startAudioButton: document.querySelector("#startAudioButton"),
  startAllButton: document.querySelector("#startAllButton"),
  stopButton: document.querySelector("#stopButton"),
  stopAllButton: document.querySelector("#stopAllButton"),
  engineTabs: document.querySelector("#engineTabs"),
  activeEngineLabel: document.querySelector("#activeEngineLabel"),
  rate: document.querySelector("#rate"),
  rateValue: document.querySelector("#rateValue"),
  size: document.querySelector("#size"),
  sizeValue: document.querySelector("#sizeValue"),
  density: document.querySelector("#density"),
  densityValue: document.querySelector("#densityValue"),
  brightness: document.querySelector("#brightness"),
  brightnessValue: document.querySelector("#brightnessValue"),
  scatter: document.querySelector("#scatter"),
  scatterValue: document.querySelector("#scatterValue"),
  randomness: document.querySelector("#randomness"),
  randomnessValue: document.querySelector("#randomnessValue"),
  level: document.querySelector("#level"),
  levelValue: document.querySelector("#levelValue"),
  bandwidth: document.querySelector("#bandwidth"),
  bandwidthValue: document.querySelector("#bandwidthValue"),
  delay: document.querySelector("#delay"),
  delayValue: document.querySelector("#delayValue"),
  reverb: document.querySelector("#reverb"),
  reverbValue: document.querySelector("#reverbValue"),
  particleVolume: document.querySelector("#particleVolume"),
  particleVolumeValue: document.querySelector("#particleVolumeValue"),
  metallicVolume: document.querySelector("#metallicVolume"),
  metallicVolumeValue: document.querySelector("#metallicVolumeValue"),
  physicalVolume: document.querySelector("#physicalVolume"),
  physicalVolumeValue: document.querySelector("#physicalVolumeValue"),
  masterGain: document.querySelector("#masterGain"),
  masterGainValue: document.querySelector("#masterGainValue"),
  statusValue: document.querySelector("#statusValue"),
  particleCountValue: document.querySelector("#particleCountValue"),
  particleCanvas: document.querySelector("#particleCanvas"),
};

const appState = {
  audioContext: null,
  masterGraph: null,
  engines: {},
  activeEngineName: null,
};

createParticleField(elements.particleCanvas, () => {
  const engineStates = getEngineStates();
  const particles = engineStates.flatMap((entry) => entry.state.particles.map((particle) => ({
    ...particle,
    hue: entry.name === "Particle" ? particle.hue : entry.name === "Metallic" ? particle.hue + 16 : particle.hue - 18,
  })));
  elements.particleCountValue.textContent = String(particles.length);
  return {
    running: engineStates.some((entry) => entry.state.running),
    particles,
  };
});

function setStatus(text) {
  elements.statusValue.textContent = text;
}

function renderEngineTabs() {
  const engines = ["Particle", "Metallic", "Physical"];
  elements.engineTabs.innerHTML = "";
  for (const engine of engines) {
    const button = document.createElement("button");
    button.type = "button";
    const engineState = appState.engines[engine]?.getState?.();
    const isRunning = !!engineState?.running;
    const isActive = appState.activeEngineName === engine;
    button.className = `engine-tab${isActive ? " is-active" : ""}${isRunning ? " is-running" : ""}`;
    button.textContent = `${engine}${isRunning ? " ON" : ""}`;
    button.addEventListener("click", () => toggleEngine(engine));
    elements.engineTabs.appendChild(button);
  }
  const running = getRunningEngineNames();
  elements.activeEngineLabel.textContent = running.length ? `Running: ${running.join(", ")}` : "No engine running";
  elements.startAllButton.textContent = "Start All";
}

async function startAudio() {
  if (!appState.audioContext) {
    appState.audioContext = ensureAudioContext();
    appState.masterGraph = createMasterGraph(appState.audioContext);
    appState.engines.Particle = createParticleNoiseEngine({
      context: appState.audioContext,
      output: appState.masterGraph,
    });
    appState.engines.Metallic = createMetallicEngine({
      context: appState.audioContext,
      output: appState.masterGraph,
    });
    appState.engines.Physical = createPhysicalEngine({
      context: appState.audioContext,
      output: appState.masterGraph,
    });
    renderEngineTabs();
  }

  await resumeAudioContext();
  setStatus("Audio Ready");
  syncMasterGain();
}

async function startParticle() {
  await startAudio();
  startAllEngines();
  setStatus("All Engines Running");
}

function stopParticle() {
  stopAllEngines();
  setStatus("Engines Stopped");
}

async function stopAll() {
  for (const engine of Object.values(appState.engines)) {
    engine?.stopAll?.();
  }
  await suspendAudioContext();
  setStatus("Stopped");
  elements.particleCountValue.textContent = "0";
}

function getEngineStates() {
  return Object.entries(appState.engines).map(([name, engine]) => ({
    name,
    state: engine?.getState?.() ?? { particles: [], running: false },
  }));
}

function getRunningEngineNames() {
  return getEngineStates()
    .filter((entry) => entry.state.running)
    .map((entry) => entry.name);
}

function toggleEngine(engineName) {
  const engine = appState.engines[engineName];
  if (!engine) return;
  appState.activeEngineName = engineName;
  const engineState = engine.getState();
  if (engineState.running) {
    engine.stop();
  } else {
    engine.start();
  }
  renderEngineTabs();
  setStatus(getRunningEngineNames().length ? "Engines Running" : "Engines Stopped");
}

function startAllEngines() {
  appState.activeEngineName = "Particle";
  for (const engine of Object.values(appState.engines)) {
    engine?.start?.();
  }
  renderEngineTabs();
}

function stopAllEngines() {
  for (const engine of Object.values(appState.engines)) {
    engine?.stop?.();
  }
  appState.activeEngineName = null;
  renderEngineTabs();
}

function syncMasterGain() {
  syncEngines();
}

function syncEngines() {
  const baseParams = {
    masterGain: Number(elements.masterGain.value),
    rate: Number(elements.rate.value),
    size: Number(elements.size.value),
    density: Number(elements.density.value),
    brightness: Number(elements.brightness.value),
    scatter: Number(elements.scatter.value),
    randomness: Number(elements.randomness.value),
    level: Number(elements.level.value),
    bandwidth: Number(elements.bandwidth.value),
    delay: Number(elements.delay.value),
    reverb: Number(elements.reverb.value),
  };

  const volumeMap = {
    Particle: Number(elements.particleVolume.value),
    Metallic: Number(elements.metallicVolume.value),
    Physical: Number(elements.physicalVolume.value),
  };

  for (const [name, engine] of Object.entries(appState.engines)) {
    engine?.setParams?.({
      ...baseParams,
      level: baseParams.level * (volumeMap[name] ?? 1),
    });
  }

  if (appState.masterGraph) {
    appState.masterGraph.setGain(baseParams.masterGain);
  }
}

bindUI({
  elements,
  onStartAudio: () => {
    startAudio().catch(reportError);
  },
  onStartAll: () => {
    startParticle().catch(reportError);
  },
  onStop: () => {
    stopParticle();
  },
  onStopAll: () => {
    stopAll().catch(reportError);
  },
  onParamsChange: (params) => {
    syncEngines();
  },
});

renderEngineTabs();
setStatus(getAudioContext() ? "Idle" : "Ready");

function reportError(error) {
  console.error(error);
  setStatus("Error");
}
