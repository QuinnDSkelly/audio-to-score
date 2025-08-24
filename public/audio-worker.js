// Web Worker for audio processing to prevent UI blocking
self.onmessage = function(e) {
  const { audioData, sampleRate } = e.data;
  
  try {
    const result = processAudio(audioData, sampleRate);
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};

function processAudio(audioData, sampleRate) {
  console.log(`Worker: Processing ${audioData.length} samples at ${sampleRate} Hz`);
  
  // Simplified but effective note detection
  const windowSize = 1024;
  const hopSize = 256;
  const minFreq = 80;
  const maxFreq = 2000;
  
  const notes = [];
  const onsets = [];
  
  // Detect onsets for tempo
  for (let i = windowSize; i < audioData.length - windowSize; i += hopSize) {
    const currentWindow = audioData.slice(i, i + windowSize);
    const prevWindow = audioData.slice(i - windowSize, i);
    
    const currentEnergy = getRMS(currentWindow);
    const prevEnergy = getRMS(prevWindow);
    
    const time = i / sampleRate;
    
    // Onset detection
    if (currentEnergy > prevEnergy * 1.3 && currentEnergy > 0.02) {
      onsets.push(time);
    }
    
    // Note detection using zero-crossing rate and spectral centroid
    if (currentEnergy > 0.015) {
      const pitch = detectPitchYIN(currentWindow, sampleRate, minFreq, maxFreq);
      
      if (pitch > 0) {
        const midiNote = frequencyToMidi(pitch);
        if (midiNote >= 36 && midiNote <= 96) {
          notes.push({
            time,
            pitch: Math.round(midiNote),
            duration: hopSize / sampleRate,
            velocity: Math.min(127, Math.max(30, Math.floor(currentEnergy * 150)))
          });
        }
      }
    }
  }
  
  // Calculate tempo from onsets
  const tempo = calculateTempo(onsets);
  
  // Consolidate notes
  const consolidatedNotes = consolidateNotes(notes);
  
  console.log(`Worker: Detected ${consolidatedNotes.length} notes at ${tempo} BPM`);
  
  return { notes: consolidatedNotes, tempo };
}

function getRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

function detectPitchYIN(buffer, sampleRate, minFreq, maxFreq) {
  const threshold = 0.1;
  const maxPeriod = Math.floor(sampleRate / minFreq);
  const minPeriod = Math.floor(sampleRate / maxFreq);
  
  // YIN algorithm simplified
  const yinBuffer = new Float32Array(maxPeriod + 1);
  
  // Step 1: Autocorrelation
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    yinBuffer[tau] = 0;
    for (let i = 0; i < buffer.length - tau; i++) {
      const delta = buffer[i] - buffer[i + tau];
      yinBuffer[tau] += delta * delta;
    }
  }
  
  // Step 2: Cumulative mean normalized difference
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxPeriod; tau++) {
    runningSum += yinBuffer[tau];
    yinBuffer[tau] *= tau / runningSum;
  }
  
  // Step 3: Absolute threshold
  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    if (yinBuffer[tau] < threshold) {
      // Parabolic interpolation
      let betterTau = tau;
      if (tau > 0 && tau < maxPeriod) {
        const s0 = yinBuffer[tau - 1];
        const s1 = yinBuffer[tau];
        const s2 = yinBuffer[tau + 1];
        betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
      }
      return sampleRate / betterTau;
    }
  }
  
  return 0;
}

function calculateTempo(onsets) {
  if (onsets.length < 3) return 120;
  
  const intervals = [];
  for (let i = 1; i < onsets.length; i++) {
    const interval = onsets[i] - onsets[i - 1];
    if (interval > 0.2 && interval < 3.0) {
      intervals.push(interval);
    }
  }
  
  if (intervals.length === 0) return 120;
  
  // Find most common interval
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  const bpm = 60 / medianInterval;
  
  return Math.round(Math.max(60, Math.min(180, bpm)));
}

function consolidateNotes(notes) {
  if (notes.length === 0) return [];
  
  // Sort by time
  notes.sort((a, b) => a.time - b.time);
  
  const consolidated = [];
  let currentNote = { ...notes[0] };
  
  for (let i = 1; i < notes.length; i++) {
    const note = notes[i];
    
    // Check if notes should be merged
    if (Math.abs(currentNote.pitch - note.pitch) <= 1 && // Same or adjacent pitch
        note.time - currentNote.time < 0.2) { // Close in time
      // Extend current note
      currentNote.duration = note.time + note.duration - currentNote.time;
      currentNote.velocity = Math.max(currentNote.velocity, note.velocity);
    } else {
      // Finalize current note and start new one
      if (currentNote.duration >= 0.05) {
        consolidated.push(currentNote);
      }
      currentNote = { ...note };
    }
  }
  
  // Add the last note
  if (currentNote.duration >= 0.05) {
    consolidated.push(currentNote);
  }
  
  return consolidated;
}

function frequencyToMidi(frequency) {
  return 12 * Math.log2(frequency / 440) + 69;
}