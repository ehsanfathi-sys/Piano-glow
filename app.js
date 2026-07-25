(function () {
  'use strict';

  // Spotify Basic Pitch model (Apache-2.0). The app consumes its raw
  // 88-key onset and frame outputs instead of converting a dominant frequency.
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json';
  const MODEL_SAMPLE_RATE = 22050;
  const FFT_HOP = 256;
  const MODEL_FPS = Math.floor(MODEL_SAMPLE_RATE / FFT_HOP); // 86 fps
  const WINDOW_SAMPLES = MODEL_SAMPLE_RATE * 2 - FFT_HOP; // 43,844
  const MODEL_KEYS = 88;
  const MIDI_OFFSET = 21;
  const SAFE_TAIL_SECONDS = 0.24;
  const SAFE_HEAD_SECONDS = 0.12;
  const RELEASE_FRAMES = 5;
  const LONG_NOTE_SECONDS = 0.70;
  const MIN_RETRIGGER_SECONDS = 0.16;
  const SETTINGS_KEY = 'pianoGlowAiSettingsV1';

  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const whiteNames = new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  const colours = ['#60a5fa', '#22d3ee', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6', '#c084fc', '#818cf8', '#ffffff', '#94a3b8', '#14b8a6', '#84cc16', '#eab308'];

  const keyboard = document.getElementById('keyboard');
  const keyboardWrap = document.getElementById('keyboardWrap');
  const visual = document.getElementById('visual');
  const listenButton = document.getElementById('listen');
  const status = document.getElementById('status');
  const readout = document.getElementById('readout');
  const latency = document.getElementById('latency');
  const palette = document.getElementById('palette');
  const colourButton = document.getElementById('colour');
  const settingsButton = document.getElementById('settingsButton');
  const settingsPanel = document.getElementById('settings');
  const startupNotice = document.getElementById('startupNotice');
  const confidenceInput = document.getElementById('confidence');
  const frameConfidenceInput = document.getElementById('frameConfidence');
  const keySizeInput = document.getElementById('keySize');
  const confidenceValue = document.getElementById('confidenceValue');
  const frameConfidenceValue = document.getElementById('frameConfidenceValue');
  const keySizeValue = document.getElementById('keySizeValue');

  const keys = new Map();
  const activeNotes = new Map();
  const recentOnsets = new Map();

  let modelPromise = null;
  let model = null;
  let backendName = 'unknown';
  let stream = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let silentGain = null;
  let listening = false;
  let inferenceBusy = false;
  let audioRing = null;
  let samplesSinceInference = 0;
  let inferenceTimer = null;
  let currentInferenceEndSample = 0;
  let lastProcessedFrameSample = -Infinity;
  let currentLevel = 0;
  let inferenceCount = 0;
  let averageInferenceMs = 0;

  class RingBuffer {
    constructor(capacity) {
      this.data = new Float32Array(capacity);
      this.capacity = capacity;
      this.writeIndex = 0;
      this.count = 0;
      this.totalWritten = 0;
    }

    push(chunk) {
      for (let i = 0; i < chunk.length; i += 1) {
        this.data[this.writeIndex] = chunk[i];
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
      }
      this.count = Math.min(this.capacity, this.count + chunk.length);
      this.totalWritten += chunk.length;
    }

    latest(length) {
      const size = Math.min(length, this.count);
      const out = new Float32Array(length);
      const pad = length - size;
      let start = (this.writeIndex - size + this.capacity) % this.capacity;
      for (let i = 0; i < size; i += 1) {
        out[pad + i] = this.data[(start + i) % this.capacity];
      }
      return out;
    }
  }

  function noteInfo(midi) {
    return { name: names[midi % 12], octave: Math.floor(midi / 12) - 1 };
  }

  function buildKeyboard() {
    const whiteMidis = [];
    for (let midi = 21; midi <= 108; midi += 1) {
      if (whiteNames.has(noteInfo(midi).name)) whiteMidis.push(midi);
    }

    whiteMidis.forEach((midi) => {
      const note = noteInfo(midi);
      const key = document.createElement('div');
      key.className = 'white';
      key.dataset.midi = String(midi);
      key.textContent = note.name === 'C' ? note.name + note.octave : note.name;
      keyboard.appendChild(key);
      keys.set(midi, key);
    });

    for (let midi = 21; midi <= 108; midi += 1) {
      const note = noteInfo(midi);
      if (!whiteNames.has(note.name)) {
        const precedingWhiteKeys = whiteMidis.filter((value) => value < midi).length;
        const key = document.createElement('div');
        key.className = 'black';
        key.dataset.midi = String(midi);
        key.textContent = note.name;
        key.style.left = (precedingWhiteKeys / whiteMidis.length * 100) + '%';
        keyboard.appendChild(key);
        keys.set(midi, key);
      }
    }
  }

  function centreMiddleC() {
    const key = keys.get(60);
    if (!key) return;
    keyboardWrap.scrollLeft = Math.max(0, key.offsetLeft - keyboardWrap.clientWidth / 2);
  }

  function syncBar(bar) {
    const midi = Number(bar.dataset.midi);
    const key = keys.get(midi);
    if (!key) return;
    const keyRect = key.getBoundingClientRect();
    const visualRect = visual.getBoundingClientRect();
    bar.style.width = Math.max(1, keyRect.width) + 'px';
    bar.style.left = (keyRect.left - visualRect.left) + 'px';
  }

  function syncBars() {
    visual.querySelectorAll('.bar').forEach(syncBar);
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (Number.isFinite(saved.confidence)) confidenceInput.value = String(saved.confidence);
      if (Number.isFinite(saved.frameConfidence)) frameConfidenceInput.value = String(saved.frameConfidence);
      if (Number.isFinite(saved.keySize)) keySizeInput.value = String(saved.keySize);
      if (typeof saved.glow === 'string' && /^#[0-9a-f]{6}$/i.test(saved.glow)) {
        document.documentElement.style.setProperty('--glow', saved.glow);
      }
    } catch (error) {
      // Ignore damaged local settings.
    }
  }

  function saveSettings() {
    try {
      const glow = getComputedStyle(document.documentElement).getPropertyValue('--glow').trim();
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        confidence: Number(confidenceInput.value),
        frameConfidence: Number(frameConfidenceInput.value),
        keySize: Number(keySizeInput.value),
        glow,
      }));
    } catch (error) {
      // Settings are optional.
    }
  }

  function updateSettingsDisplay() {
    confidenceValue.value = confidenceInput.value + '%';
    frameConfidenceValue.value = frameConfidenceInput.value + '%';
    keySizeValue.value = keySizeInput.value + ' px';
    document.documentElement.style.setProperty('--keyboard-width', keySizeInput.value + 'px');
    syncBars();
    saveSettings();
  }

  function buildPalette() {
    colours.forEach((colour) => {
      const swatch = document.createElement('button');
      swatch.className = 'swatch';
      swatch.style.background = colour;
      swatch.setAttribute('aria-label', 'Use ' + colour);
      swatch.addEventListener('click', () => {
        document.documentElement.style.setProperty('--glow', colour);
        palette.classList.remove('open');
        saveSettings();
      });
      palette.appendChild(swatch);
    });
  }

  async function chooseBackend() {
    if (!window.tf) throw new Error('TensorFlow failed to load');
    const candidates = ['webgl', 'cpu'];
    let lastError = null;
    for (const candidate of candidates) {
      try {
        const ok = await tf.setBackend(candidate);
        if (!ok) continue;
        await tf.ready();
        backendName = tf.getBackend();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('No compatible AI backend');
  }

  async function loadModel() {
    if (model) return model;
    if (modelPromise) return modelPromise;

    modelPromise = (async () => {
      listenButton.disabled = true;
      status.textContent = 'Loading neural piano model…';
      latency.textContent = 'Downloading AI model';

      await chooseBackend();
      const loaded = await tf.loadGraphModel(MODEL_URL, { fromTFHub: false });

      status.textContent = 'Warming neural model…';
      latency.textContent = 'AI warm-up';
      const warmInput = tf.zeros([1, WINDOW_SAMPLES, 1]);
      let warmOutputs;
      try {
        warmOutputs = loaded.execute(warmInput, ['Identity_1', 'Identity_2', 'Identity']);
        if (Array.isArray(warmOutputs)) warmOutputs.forEach((tensor) => tensor.dispose());
        else if (warmOutputs && typeof warmOutputs.dispose === 'function') warmOutputs.dispose();
      } finally {
        warmInput.dispose();
      }

      model = loaded;
      listenButton.disabled = false;
      latency.textContent = 'AI ready • ' + backendName;
      return model;
    })().catch((error) => {
      modelPromise = null;
      listenButton.disabled = false;
      throw error;
    });

    return modelPromise;
  }

  function createBar(midi, confidence) {
    const bar = document.createElement('div');
    const label = document.createElement('span');
    bar.className = 'bar';
    bar.dataset.midi = String(midi);
    bar.dataset.sustained = 'false';
    bar.style.height = (54 + Math.min(72, confidence * 80)) + 'px';
    label.className = 'label';
    label.textContent = noteInfo(midi).name;
    bar.appendChild(label);
    visual.appendChild(bar);
    syncBar(bar);
    bar.addEventListener('animationend', () => bar.remove());
    return bar;
  }

  function activateNote(midi, confidence, frameSample) {
    const existing = activeNotes.get(midi);
    if (existing) {
      existing.releaseCount = 0;
      existing.lastSeenSample = frameSample;
      return;
    }

    const nowSeconds = frameSample / MODEL_SAMPLE_RATE;
    const lastOnset = recentOnsets.get(midi) || -Infinity;
    if (nowSeconds - lastOnset < MIN_RETRIGGER_SECONDS) return;
    recentOnsets.set(midi, nowSeconds);

    const key = keys.get(midi);
    if (key) key.classList.add('active');
    const bar = createBar(midi, confidence);
    const note = noteInfo(midi);
    readout.textContent = 'Note: ' + note.name + note.octave;

    activeNotes.set(midi, {
      midi,
      key,
      bar,
      startSample: frameSample,
      lastSeenSample: frameSample,
      releaseCount: 0,
      sustained: false,
    });
  }

  function sustainNote(state, frameSample) {
    state.releaseCount = 0;
    state.lastSeenSample = frameSample;
    const duration = (frameSample - state.startSample) / MODEL_SAMPLE_RATE;
    if (duration >= LONG_NOTE_SECONDS) {
      state.sustained = true;
      state.bar.dataset.sustained = 'true';
    }
    if (state.sustained && state.bar.isConnected) {
      const height = 54 + Math.min(260, duration * 105);
      state.bar.style.height = height + 'px';
    }
  }

  function releaseNote(midi) {
    const state = activeNotes.get(midi);
    if (!state) return;
    if (state.key) state.key.classList.remove('active');
    activeNotes.delete(midi);
  }

  function releaseAllNotes() {
    Array.from(activeNotes.keys()).forEach(releaseNote);
  }

  function processModelFrames(frames, onsets, windowStartSample) {
    const onsetThreshold = Number(confidenceInput.value) / 100;
    const frameThreshold = Number(frameConfidenceInput.value) / 100;
    const safeHeadFrames = Math.floor(SAFE_HEAD_SECONDS * MODEL_FPS);
    const safeTailFrames = Math.floor(SAFE_TAIL_SECONDS * MODEL_FPS);
    const lastSafeFrame = Math.max(safeHeadFrames, frames.length - safeTailFrames);

    for (let frameIndex = safeHeadFrames; frameIndex < lastSafeFrame; frameIndex += 1) {
      const frameSample = windowStartSample + frameIndex * FFT_HOP;
      if (frameSample <= lastProcessedFrameSample) continue;
      lastProcessedFrameSample = frameSample;

      const frameRow = frames[frameIndex];
      const onsetRow = onsets[frameIndex];
      if (!frameRow || !onsetRow) continue;

      for (let keyIndex = 0; keyIndex < MODEL_KEYS; keyIndex += 1) {
        const midi = keyIndex + MIDI_OFFSET;
        const onsetConfidence = onsetRow[keyIndex] || 0;
        const frameConfidence = frameRow[keyIndex] || 0;
        const active = activeNotes.get(midi);

        if (!active && onsetConfidence >= onsetThreshold && frameConfidence >= frameThreshold) {
          activateNote(midi, onsetConfidence, frameSample);
        }

        const current = activeNotes.get(midi);
        if (!current) continue;
        if (frameConfidence >= frameThreshold) {
          sustainNote(current, frameSample);
        } else {
          current.releaseCount += 1;
          if (current.releaseCount >= RELEASE_FRAMES) releaseNote(midi);
        }
      }
    }
  }

  function resampleLinear(input, inputRate, outputRate, outputLength) {
    if (inputRate === outputRate && input.length === outputLength) return input;
    const output = new Float32Array(outputLength);
    const ratio = inputRate / outputRate;
    for (let i = 0; i < outputLength; i += 1) {
      const sourcePosition = i * ratio;
      const left = Math.floor(sourcePosition);
      const right = Math.min(input.length - 1, left + 1);
      const mix = sourcePosition - left;
      output[i] = input[left] * (1 - mix) + input[right] * mix;
    }
    return output;
  }

  async function runInference() {
    if (!listening || inferenceBusy || !model || !audioRing || audioRing.count < WINDOW_SAMPLES) return;
    inferenceBusy = true;

    const started = performance.now();
    const sourceSampleRate = audioContext.sampleRate;
    const inputLength = Math.max(1, Math.round(WINDOW_SAMPLES * sourceSampleRate / MODEL_SAMPLE_RATE));
    const rawWindow = audioRing.latest(inputLength);
    const modelWindow = resampleLinear(rawWindow, sourceSampleRate, MODEL_SAMPLE_RATE, WINDOW_SAMPLES);
    currentInferenceEndSample = Math.round(audioRing.totalWritten * MODEL_SAMPLE_RATE / sourceSampleRate);
    const windowStartSample = currentInferenceEndSample - WINDOW_SAMPLES;

    const input = tf.tensor3d(modelWindow, [1, WINDOW_SAMPLES, 1]);
    let outputs;
    try {
      outputs = model.execute(input, ['Identity_1', 'Identity_2', 'Identity']);
      if (!Array.isArray(outputs) || outputs.length < 2) throw new Error('Unexpected neural model output');
      const frameTensor = outputs[0];
      const onsetTensor = outputs[1];
      const frames = await frameTensor.array();
      const onsets = await onsetTensor.array();
      const frameMatrix = frames[0] || frames;
      const onsetMatrix = onsets[0] || onsets;
      processModelFrames(frameMatrix, onsetMatrix, windowStartSample);
    } catch (error) {
      status.textContent = 'AI inference error: ' + (error.message || error.name || 'Unknown');
    } finally {
      input.dispose();
      if (Array.isArray(outputs)) outputs.forEach((tensor) => tensor.dispose());
      inferenceBusy = false;
      inferenceCount += 1;
      const elapsed = performance.now() - started;
      averageInferenceMs += (elapsed - averageInferenceMs) / Math.min(inferenceCount, 12);
      latency.textContent = 'AI ' + Math.round(averageInferenceMs) + ' ms • ' + backendName;
    }
  }

  function scheduleInference() {
    if (!listening || inferenceBusy) return;
    const hopSourceSamples = Math.max(2048, Math.round(audioContext.sampleRate * 0.38));
    if (samplesSinceInference < hopSourceSamples) return;
    samplesSinceInference = 0;
    if (inferenceTimer) clearTimeout(inferenceTimer);
    inferenceTimer = setTimeout(() => {
      inferenceTimer = null;
      runInference();
    }, 0);
  }

  function handleAudio(event) {
    if (!listening || !audioRing) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    audioRing.push(copy);
    samplesSinceInference += copy.length;

    let energy = 0;
    for (let i = 0; i < copy.length; i += 1) energy += copy[i] * copy[i];
    currentLevel = Math.sqrt(energy / Math.max(1, copy.length));
    scheduleInference();
  }

  async function startListening() {
    listenButton.disabled = true;
    status.textContent = 'Preparing AI detector…';
    startupNotice.style.display = 'none';

    try {
      await loadModel();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser');
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is not supported');
      audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();

      const inputCapacity = Math.ceil(audioContext.sampleRate * 4.5);
      audioRing = new RingBuffer(inputCapacity);
      samplesSinceInference = 0;
      lastProcessedFrameSample = -Infinity;
      inferenceCount = 0;
      averageInferenceMs = 0;

      sourceNode = audioContext.createMediaStreamSource(stream);
      const bufferSize = 2048;
      processorNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
      silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processorNode.onaudioprocess = handleAudio;
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(audioContext.destination);

      listening = true;
      listenButton.disabled = false;
      listenButton.textContent = 'Stop';
      listenButton.classList.add('on');
      status.textContent = 'Listening • filling AI window';
      latency.textContent = 'AI ready • ' + backendName;

      setTimeout(() => {
        if (listening) status.textContent = 'Listening for confirmed piano onsets';
      }, 2100);
    } catch (error) {
      await stopListening();
      listenButton.disabled = false;
      listenButton.textContent = 'Try again';
      status.textContent = 'Piano Glow could not start: ' + (error.message || error.name || 'Unknown error');
      latency.textContent = 'AI unavailable';
    }
  }

  async function stopListening() {
    listening = false;
    if (inferenceTimer) clearTimeout(inferenceTimer);
    inferenceTimer = null;
    releaseAllNotes();

    if (processorNode) {
      processorNode.onaudioprocess = null;
      try { processorNode.disconnect(); } catch (error) { /* already disconnected */ }
    }
    if (sourceNode) {
      try { sourceNode.disconnect(); } catch (error) { /* already disconnected */ }
    }
    if (silentGain) {
      try { silentGain.disconnect(); } catch (error) { /* already disconnected */ }
    }
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (audioContext) {
      try { await audioContext.close(); } catch (error) { /* already closed */ }
    }

    processorNode = null;
    sourceNode = null;
    silentGain = null;
    stream = null;
    audioContext = null;
    audioRing = null;
    inferenceBusy = false;
    listenButton.classList.remove('on');
    listenButton.textContent = 'Start listening';
    listenButton.disabled = false;
    if (status.textContent.indexOf('could not start') === -1) status.textContent = 'Tap Start listening';
    if (latency.textContent.indexOf('unavailable') === -1) {
      latency.textContent = model ? 'AI ready • ' + backendName : 'AI model idle';
    }
  }

  listenButton.addEventListener('click', () => {
    if (listening) stopListening();
    else startListening();
  });

  colourButton.addEventListener('click', () => {
    palette.classList.toggle('open');
    settingsPanel.classList.remove('open');
  });

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('open');
    palette.classList.remove('open');
  });

  [confidenceInput, frameConfidenceInput, keySizeInput].forEach((input) => {
    input.addEventListener('input', updateSettingsDisplay);
    input.addEventListener('change', updateSettingsDisplay);
  });

  keyboardWrap.addEventListener('scroll', syncBars, { passive: true });
  window.addEventListener('resize', syncBars);
  window.addEventListener('pagehide', () => {
    saveSettings();
    if (listening) stopListening();
  });

  buildKeyboard();
  buildPalette();
  loadSettings();
  updateSettingsDisplay();
  setTimeout(() => {
    centreMiddleC();
    syncBars();
  }, 100);
}());
