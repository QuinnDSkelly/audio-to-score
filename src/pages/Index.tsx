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

  const detectPitchFromBuffer = (audioBuffer: AudioBuffer): { notes: MidiNote[], tempo: number } => {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const notes: MidiNote[] = [];
    
    const windowSize = 4096;
    const hopSize = 2048; // Larger hop to reduce overlapping analysis
    const minFreq = 80; // Higher minimum frequency
    const maxFreq = 2000;
    
    console.log(`Processing audio: ${channelData.length} samples, ${sampleRate} Hz`);
    
    // Enhanced tempo detection with beat tracking
    const detectTempo = (data: Float32Array) => {
      const spectralFlux = [];
      const windowSize = 2048;
      const hopSize = 512;
      
      // Calculate spectral flux for onset detection
      for (let i = 0; i < data.length - windowSize * 2; i += hopSize) {
        const window1 = data.slice(i, i + windowSize);
        const window2 = data.slice(i + windowSize, i + windowSize * 2);
        
        const energy1 = getRMS(window1);
        const energy2 = getRMS(window2);
        
        const flux = Math.max(0, energy2 - energy1);
        spectralFlux.push({ time: i / sampleRate, flux });
      }
      
      // Find peaks in spectral flux
      const onsets = [];
      const threshold = Math.max(...spectralFlux.map(f => f.flux)) * 0.3;
      
      for (let i = 1; i < spectralFlux.length - 1; i++) {
        if (spectralFlux[i].flux > threshold &&
            spectralFlux[i].flux > spectralFlux[i - 1].flux &&
            spectralFlux[i].flux > spectralFlux[i + 1].flux) {
          onsets.push(spectralFlux[i].time);
        }
      }
      
      if (onsets.length < 3) return 120;
      
      // Calculate inter-onset intervals
      const intervals = [];
      for (let i = 1; i < onsets.length; i++) {
        intervals.push(onsets[i] - onsets[i - 1]);
      }
      
      // Find most common interval (tempo)
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];
      const bpm = Math.round(60 / medianInterval);
      
      return Math.max(60, Math.min(180, bpm));
    };
    
    const tempo = detectTempo(channelData);
    const beatDuration = 60 / tempo;
    const quantizeUnit = beatDuration / 4; // Quarter note quantization
    
    console.log(`Detected tempo: ${tempo} BPM, beat duration: ${beatDuration}s, quantize: ${quantizeUnit}s`);
    
    const detectedNotes = new Map<string, MidiNote>();
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      const window = channelData.slice(i, i + windowSize);
      const time = i / sampleRate;
      
      // Apply Hamming window
      for (let j = 0; j < windowSize; j++) {
        window[j] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * j / (windowSize - 1));
      }
      
      const pitch = detectPitchFromWindow(window, sampleRate, minFreq, maxFreq);
      const amplitude = getRMS(window);
      
      // Only process significant pitches
      if (pitch > minFreq && pitch < maxFreq && amplitude > 0.01) {
        const midiNote = frequencyToMidi(pitch);
        
        // Only accept valid MIDI range
        if (midiNote >= 36 && midiNote <= 96) {
          const quantizedTime = Math.round(time / quantizeUnit) * quantizeUnit;
          const noteKey = `${midiNote}-${quantizedTime}`;
          
          // Use map to prevent exact duplicates
          if (!detectedNotes.has(noteKey)) {
            const velocity = Math.min(127, Math.max(40, Math.floor(amplitude * 150 + 50)));
            detectedNotes.set(noteKey, {
              time: quantizedTime,
              pitch: midiNote,
              duration: quantizeUnit,
              velocity
            });
          }
        }
      }
    }
    
    // Convert map to array and sort by time
    const sortedNotes = Array.from(detectedNotes.values()).sort((a, b) => a.time - b.time);
    
    // Merge consecutive notes of same pitch
    const finalNotes: MidiNote[] = [];
    let currentNote: MidiNote | null = null;
    
    for (const note of sortedNotes) {
      if (currentNote && 
          currentNote.pitch === note.pitch && 
          Math.abs(note.time - (currentNote.time + currentNote.duration)) <= quantizeUnit / 2) {
        // Extend current note
        currentNote.duration = note.time + note.duration - currentNote.time;
        currentNote.velocity = Math.max(currentNote.velocity, note.velocity);
      } else {
        // Start new note
        if (currentNote) finalNotes.push(currentNote);
        currentNote = { ...note };
      }
    }
    
    if (currentNote) finalNotes.push(currentNote);
    
    console.log(`Detected ${finalNotes.length} unique notes with tempo ${tempo} BPM`);
    return { notes: finalNotes, tempo };
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
      const result = detectPitchFromBuffer(buffer);
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