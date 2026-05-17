export function readParticleParams(elements) {
  return {
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
    particleVolume: Number(elements.particleVolume.value),
    metallicVolume: Number(elements.metallicVolume.value),
    physicalVolume: Number(elements.physicalVolume.value),
    masterGain: Number(elements.masterGain.value),
  };
}

export function writeParticleLabels(elements, params) {
  elements.rateValue.textContent = params.rate.toFixed(1);
  elements.sizeValue.textContent = params.size.toFixed(2);
  elements.densityValue.textContent = params.density.toFixed(2);
  elements.brightnessValue.textContent = params.brightness.toFixed(2);
  elements.scatterValue.textContent = params.scatter.toFixed(2);
  elements.randomnessValue.textContent = params.randomness.toFixed(2);
  elements.levelValue.textContent = params.level.toFixed(2);
  elements.bandwidthValue.textContent = params.bandwidth.toFixed(2);
  elements.delayValue.textContent = params.delay.toFixed(2);
  elements.reverbValue.textContent = params.reverb.toFixed(2);
  elements.particleVolumeValue.textContent = params.particleVolume.toFixed(2);
  elements.metallicVolumeValue.textContent = params.metallicVolume.toFixed(2);
  elements.physicalVolumeValue.textContent = params.physicalVolume.toFixed(2);
  elements.masterGainValue.textContent = params.masterGain.toFixed(2);
}

export function bindUI({ elements, onStartAudio, onStartAll, onStop, onStopAll, onParamsChange }) {
  const rangeIds = [
    "rate",
    "size",
    "density",
    "brightness",
    "scatter",
    "randomness",
    "level",
    "bandwidth",
    "delay",
    "reverb",
    "particleVolume",
    "metallicVolume",
    "physicalVolume",
    "masterGain",
  ];

  function sync() {
    const params = readParticleParams(elements);
    writeParticleLabels(elements, params);
    onParamsChange(params);
  }

  elements.startAudioButton.addEventListener("click", onStartAudio);
  elements.startAllButton.addEventListener("click", onStartAll);
  elements.stopButton.addEventListener("click", onStop);
  elements.stopAllButton.addEventListener("click", onStopAll);

  rangeIds.forEach((id) => {
    elements[id].addEventListener("input", sync);
  });

  sync();

  return {
    sync,
  };
}
