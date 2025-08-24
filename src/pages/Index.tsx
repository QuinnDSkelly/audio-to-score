import { useState, useRef, useEffect } from "react";
import { AudioUpload } from "@/components/AudioUpload";
import { WaveformVisualization } from "@/components/WaveformVisualization";
import { PianoRoll } from "@/components/PianoRoll";
import { ControlPanel } from "@/components/ControlPanel";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { toast } from "sonner";
import heroImage from "@/assets/hero-audio-midi.jpg";

export interface MidiNote {
  time: number;
  pitch: number;
  duration: number;
  velocity: number;
}

const Index = () => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [midiData, setMidiData] = useState<MidiNote[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [detectedTempo, setDetectedTempo] = useState(120);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>();

  const detectPitchFromBuffer = async (audioBuffer: AudioBuffer): Promise<{ notes: MidiNote[], tempo: number }> => {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    
    console.log(`Processing audio: ${channelData.length} samples, ${sampleRate} Hz`);
    
    // Enhanced pitch detection with autocorrelation for better accuracy
    const windowSize = 4096; // Larger window for better frequency resolution
    const hopSize = 1024;    // Less overlap for performance
    const minFreq = 80;
    const maxFreq = 2000;
    
    // More robust tempo detection using spectral flux
    const detectTempo = (data: Float32Array): number => {
      const frameSize = 2048;
      const hopSize = 512;
      const spectralFlux: number[] = [];
      let prevSpectrum: number[] = [];
      
      // Calculate spectral flux
      for (let i = 0; i < data.length - frameSize; i += hopSize) {
        const window = data.slice(i, i + frameSize);
        const spectrum = getSpectrum(window);
        
        if (prevSpectrum.length > 0) {
          let flux = 0;
          for (let j = 0; j < Math.min(spectrum.length, prevSpectrum.length); j++) {
            const diff = spectrum[j] - prevSpectrum[j];
            flux += diff > 0 ? diff : 0; // Only positive differences
          }
          spectralFlux.push(flux);
        }
        prevSpectrum = spectrum;
      }
      
      // Find peaks in spectral flux (onsets)
      const onsets: number[] = [];
      const threshold = Math.max(...spectralFlux) * 0.3;
      
      for (let i = 1; i < spectralFlux.length - 1; i++) {
        if (spectralFlux[i] > threshold && 
            spectralFlux[i] > spectralFlux[i - 1] && 
            spectralFlux[i] > spectralFlux[i + 1]) {
          onsets.push((i * hopSize) / sampleRate);
        }
      }
      
      if (onsets.length < 3) return 120; // Fallback
      
      // Calculate inter-onset intervals
      const intervals: number[] = [];
      for (let i = 1; i < onsets.length; i++) {
        const interval = onsets[i] - onsets[i - 1];
        if (interval > 0.2 && interval < 2.0) { // Reasonable tempo range
          intervals.push(interval);
        }
      }
      
      if (intervals.length === 0) return 120;
      
      // Find most common interval using clustering
      intervals.sort((a, b) => a - b);
      const clusters: number[][] = [];
      const tolerance = 0.1;
      
      for (const interval of intervals) {
        let added = false;
        for (const cluster of clusters) {
          if (Math.abs(cluster[0] - interval) < tolerance) {
            cluster.push(interval);
            added = true;
            break;
          }
        }
        if (!added) {
          clusters.push([interval]);
        }
      }
      
      // Find largest cluster
      const largestCluster = clusters.reduce((max, cluster) => 
        cluster.length > max.length ? cluster : max, []);
      
      const avgInterval = largestCluster.reduce((sum, val) => sum + val, 0) / largestCluster.length;
      const bpm = 60 / avgInterval;
      
      return Math.round(Math.max(60, Math.min(180, bpm)));
    };
    
    const detectedTempo = detectTempo(channelData);
    console.log(`Detected tempo: ${detectedTempo} BPM`);
    
    // Enhanced note detection with autocorrelation
    const detectedNotes: MidiNote[] = [];
    const processChunkSize = Math.floor(channelData.length / 20); // Process in chunks
    
    for (let chunk = 0; chunk < 20; chunk++) {
      const start = chunk * processChunkSize;
      const end = Math.min(start + processChunkSize, channelData.length);
      
      for (let i = start; i < end - windowSize; i += hopSize) {
        const window = channelData.slice(i, i + windowSize);
        const time = i / sampleRate;
        
        // Calculate RMS for amplitude
        const amplitude = Math.sqrt(window.reduce((sum, val) => sum + val * val, 0) / window.length);
        if (amplitude < 0.02) continue; // Skip quiet sections
        
        // Autocorrelation-based pitch detection (more accurate than FFT for single pitches)
        const pitch = autocorrelationPitch(window, sampleRate, minFreq, maxFreq);
        
        if (pitch > 0) {
          const midiNote = frequencyToMidi(pitch);
          
          if (midiNote >= 36 && midiNote <= 96) {
            const velocity = Math.min(127, Math.max(30, Math.floor(amplitude * 200)));
            
            detectedNotes.push({
              time,
              pitch: Math.round(midiNote), // Round to nearest semitone
              duration: hopSize / sampleRate,
              velocity
            });
          }
        }
      }
      
      // Yield control to prevent freezing
      if (chunk % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    // Aggressive note consolidation to prevent timbre misinterpretation
    const consolidatedNotes: MidiNote[] = [];
    const noteTolerance = 0.5; // Half semitone tolerance
    const timeTolerance = 0.15; // 150ms tolerance
    
    detectedNotes.sort((a, b) => a.time - b.time);
    
    for (const note of detectedNotes) {
      const existing = consolidatedNotes.find(n => 
        Math.abs(n.pitch - note.pitch) <= noteTolerance &&
        Math.abs(n.time - note.time) <= timeTolerance
      );
      
      if (existing) {
        // Merge with existing note
        existing.duration = Math.max(existing.duration, note.time + note.duration - existing.time);
        existing.velocity = Math.max(existing.velocity, note.velocity);
      } else {
        // Find overlapping notes and merge
        let merged = false;
        for (const existing of consolidatedNotes) {
          if (Math.abs(existing.pitch - note.pitch) <= noteTolerance &&
              note.time < existing.time + existing.duration + 0.05) {
            // Extend existing note
            existing.duration = Math.max(existing.duration, note.time + note.duration - existing.time);
            existing.velocity = Math.max(existing.velocity, note.velocity);
            merged = true;
            break;
          }
        }
        
        if (!merged) {
          consolidatedNotes.push({ ...note });
        }
      }
    }
    
    // Final cleanup - minimum note duration
    const finalNotes = consolidatedNotes
      .filter(note => note.duration >= 0.1) // Minimum 100ms duration
      .map(note => ({
        ...note,
        duration: Math.max(note.duration, 0.1) // Ensure minimum duration
      }));
    
    console.log(`Detected ${finalNotes.length} consolidated notes with tempo ${detectedTempo} BPM`);
    
    return { notes: finalNotes, tempo: detectedTempo };
  };

  // Autocorrelation-based pitch detection (more accurate for monophonic content)
  const autocorrelationPitch = (buffer: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): number => {
    const maxPeriod = Math.floor(sampleRate / minFreq);
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const correlations: number[] = [];
    
    // Calculate autocorrelation
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - period; i++) {
        correlation += buffer[i] * buffer[i + period];
      }
      correlations.push(correlation / (buffer.length - period));
    }
    
    // Find peak correlation
    let maxCorrelation = 0;
    let bestPeriod = 0;
    
    for (let i = 0; i < correlations.length; i++) {
      if (correlations[i] > maxCorrelation) {
        maxCorrelation = correlations[i];
        bestPeriod = minPeriod + i;
      }
    }
    
    // Require significant correlation to avoid noise
    if (maxCorrelation < 0.3) return 0;
    
    return sampleRate / bestPeriod;
  };
  
  // Get spectrum for tempo detection
  const getSpectrum = (data: Float32Array): number[] => {
    const N = data.length;
    const spectrum: number[] = [];
    
    for (let k = 0; k < N / 2; k++) {
      let real = 0, imag = 0;
      
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N;
        real += data[n] * Math.cos(angle);
        imag += data[n] * Math.sin(angle);
      }
      
      spectrum.push(Math.sqrt(real * real + imag * imag));
    }
    
    return spectrum;
  };

  // Find the dominant frequency in the spectrum
  const findDominantFrequency = (frequencies: { freq: number; magnitude: number }[], minFreq: number, maxFreq: number) => {
    let maxMagnitude = 0;
    let dominantFreq = 0;
    
    for (const { freq, magnitude } of frequencies) {
      if (freq >= minFreq && freq <= maxFreq && magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
        dominantFreq = freq;
      }
    }
    
    return dominantFreq;
  };

  const calculateTempoFromNotes = (notes: MidiNote[]): number => {
    if (notes.length < 3) return 120;
    
    // Calculate intervals between note onsets
    const intervals = [];
    for (let i = 1; i < notes.length; i++) {
      const interval = notes[i].time - notes[i - 1].time;
      if (interval > 0.1 && interval < 4) { // Filter reasonable intervals
        intervals.push(interval);
      }
    }
    
    if (intervals.length === 0) return 120;
    
    // Find the most common interval
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];
    
    // Convert to BPM (assuming quarter note intervals)
    const bpm = Math.round(60 / medianInterval);
    return Math.max(60, Math.min(200, bpm));
  };

  const detectPitchFromWindow = (window: Float32Array, sampleRate: number, minFreq: number, maxFreq: number): number => {
    const minPeriod = Math.floor(sampleRate / maxFreq);
    const maxPeriod = Math.floor(sampleRate / minFreq);
    
    let bestPeriod = 0;
    let bestCorrelation = 0;
    
    for (let period = minPeriod; period <= maxPeriod; period++) {
      let correlation = 0;
      for (let i = 0; i < window.length - period; i++) {
        correlation += window[i] * window[i + period];
      }
      
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestPeriod = period;
      }
    }
    
    return bestPeriod > 0 ? sampleRate / bestPeriod : 0;
  };

  const frequencyToMidi = (frequency: number): number => {
    return Math.round(12 * Math.log2(frequency / 440) + 69);
  };

  const getRMS = (buffer: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  };

  const handleFileUpload = async (file: File) => {
    setAudioFile(file);
    setIsProcessing(true);
    setProcessingProgress(0);
    
    try {
      // Create audio element for playback
      const audioUrl = URL.createObjectURL(file);
      audioRef.current = new Audio(audioUrl);
      
      // Decode audio file for analysis
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await audioContext.decodeAudioData(arrayBuffer);
      
      setAudioBuffer(buffer);
      setDuration(buffer.duration);
      setProcessingProgress(30);
      
      // Extract MIDI data from audio
      const result = await detectPitchFromBuffer(buffer);
      setProcessingProgress(80);
      
      setDetectedTempo(result.tempo);
      setMidiData(result.notes);
      setProcessingProgress(100);
      
      toast.success(`Audio processed successfully! Detected ${result.notes.length} notes.`);
    } catch (error) {
      toast.error("Failed to process audio file");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        updateTime();
      }).catch(error => {
        toast.error("Failed to play audio");
        console.error(error);
      });
    }
  };

  const updateTime = () => {
    if (audioRef.current && !audioRef.current.paused && !audioRef.current.ended) {
      setCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else if (audioRef.current?.ended) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  };

  const handleSeek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleExportMidi = () => {
    // Create a basic MIDI file structure
    const midiFileData = createMidiFile(midiData);
    const blob = new Blob([midiFileData], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioFile?.name.replace(/\.[^/.]+$/, "") || "audio"}.mid`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("MIDI file exported!");
  };

  const handleReset = () => {
    // Stop audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    
    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Reset all state
    setAudioFile(null);
    setAudioBuffer(null);
    setMidiData([]);
    setIsProcessing(false);
    setProcessingProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setDetectedTempo(120);
    
    toast.success("Ready for new audio file");
  };

  const createMidiFile = (notes: MidiNote[]): Uint8Array => {
    const ticksPerQuarter = 480; // Higher resolution
    
    // MIDI file header
    const header = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Header length
      0x00, 0x00, // Format type 0
      0x00, 0x01, // Number of tracks
      (ticksPerQuarter >> 8) & 0xFF, ticksPerQuarter & 0xFF // Ticks per quarter note
    ]);
    
    // Create MIDI events with proper timing
    const events: number[] = [];
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    
    let currentTime = 0;
    const noteOffs: Array<{time: number, pitch: number}> = [];
    
    sortedNotes.forEach(note => {
      const noteOnTime = note.time;
      const noteOffTime = note.time + note.duration;
      
      // Add note off events that occur before this note on
      while (noteOffs.length > 0 && noteOffs[0].time <= noteOnTime) {
        const noteOff = noteOffs.shift()!;
        const deltaTime = Math.round((noteOff.time - currentTime) * ticksPerQuarter);
        
        // Write variable length delta time
        writeVarLength(events, deltaTime);
        events.push(0x80, noteOff.pitch, 0x40); // Note off
        currentTime = noteOff.time;
      }
      
      // Add note on event
      const deltaTime = Math.round((noteOnTime - currentTime) * ticksPerQuarter);
      writeVarLength(events, deltaTime);
      events.push(0x90, note.pitch, note.velocity); // Note on
      currentTime = noteOnTime;
      
      // Schedule note off
      noteOffs.push({time: noteOffTime, pitch: note.pitch});
      noteOffs.sort((a, b) => a.time - b.time);
    });
    
    // Add remaining note offs
    while (noteOffs.length > 0) {
      const noteOff = noteOffs.shift()!;
      const deltaTime = Math.round((noteOff.time - currentTime) * ticksPerQuarter);
      
      writeVarLength(events, deltaTime);
      events.push(0x80, noteOff.pitch, 0x40); // Note off
      currentTime = noteOff.time;
    }
    
    // End of track
    events.push(0x00, 0xFF, 0x2F, 0x00);
    
    // Create track with proper header
    const trackData = new Uint8Array(events);
    const trackLength = trackData.length;
    
    const track = new Uint8Array(8 + trackLength);
    track.set([0x4D, 0x54, 0x72, 0x6B], 0); // "MTrk"
    track.set([
      (trackLength >> 24) & 0xFF,
      (trackLength >> 16) & 0xFF,
      (trackLength >> 8) & 0xFF,
      trackLength & 0xFF
    ], 4);
    track.set(trackData, 8);
    
    // Combine header and track
    const result = new Uint8Array(header.length + track.length);
    result.set(header, 0);
    result.set(track, header.length);
    
    return result;
  };
  
  const writeVarLength = (events: number[], value: number) => {
    if (value < 0x80) {
      events.push(value);
    } else if (value < 0x4000) {
      events.push((value >> 7) | 0x80);
      events.push(value & 0x7F);
    } else if (value < 0x200000) {
      events.push((value >> 14) | 0x80);
      events.push(((value >> 7) & 0x7F) | 0x80);
      events.push(value & 0x7F);
    } else {
      events.push((value >> 21) | 0x80);
      events.push(((value >> 14) & 0x7F) | 0x80);
      events.push(((value >> 7) & 0x7F) | 0x80);
      events.push(value & 0x7F);
    }
  };

  // Cleanup audio on component unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Handle audio end
  useEffect(() => {
    if (audioRef.current) {
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };
      
      audioRef.current.addEventListener('ended', handleEnded);
      return () => {
        audioRef.current?.removeEventListener('ended', handleEnded);
      };
    }
  }, [audioRef.current]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="container mx-auto p-6">
        {/* Hero Section */}
        <div className="text-center mb-12 relative">
          <div 
            className="absolute inset-0 rounded-2xl bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="relative z-10 py-16">
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-6">
              Audio to MIDI Converter
            </h1>
            <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
              Transform your audio files into MIDI with AI-powered pitch detection and advanced music transcription
            </p>
          </div>
        </div>

        {/* Upload Section */}
        {!audioFile && (
          <div className="mb-8">
            <AudioUpload onFileUpload={handleFileUpload} />
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="mb-8">
            <ProcessingStatus progress={processingProgress} />
          </div>
        )}

        {/* Main Interface */}
        {audioFile && !isProcessing && (
          <div className="space-y-6">
            {/* Control Panel */}
            <div className="flex items-center justify-between">
              <ControlPanel
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onExport={handleExportMidi}
                canExport={midiData.length > 0}
              />
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Upload Another File
              </button>
            </div>

            {/* Waveform */}
            <div className="bg-card rounded-lg p-6 shadow-card">
              <h3 className="text-lg font-semibold mb-4">Audio Waveform</h3>
              <WaveformVisualization
                audioBuffer={audioBuffer}
                currentTime={currentTime}
                isPlaying={isPlaying}
              />
            </div>

            {/* Piano Roll */}
            <div className="bg-card rounded-lg p-6 shadow-card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Piano Roll</h3>
                <span className="text-sm text-muted-foreground">
                  Tempo: {detectedTempo} BPM
                </span>
              </div>
              <PianoRoll
                midiData={midiData}
                currentTime={currentTime}
                duration={duration}
                tempo={detectedTempo}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;