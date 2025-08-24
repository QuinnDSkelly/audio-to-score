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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>();

  const detectPitchFromBuffer = (audioBuffer: AudioBuffer): MidiNote[] => {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const notes: MidiNote[] = [];
    
    const windowSize = 4096;
    const hopSize = 1024;
    const minFreq = 80; // ~E2
    const maxFreq = 2000; // ~B6
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      const window = channelData.slice(i, i + windowSize);
      const time = i / sampleRate;
      
      // Apply Hamming window
      for (let j = 0; j < windowSize; j++) {
        window[j] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * j / (windowSize - 1));
      }
      
      // Simple autocorrelation for pitch detection
      const pitch = detectPitchFromWindow(window, sampleRate, minFreq, maxFreq);
      
      if (pitch > 0) {
        const midiNote = frequencyToMidi(pitch);
        const amplitude = getRMS(window);
        
        // Only add note if it's loud enough
        if (amplitude > 0.01) {
          // Check if this continues a previous note
          const lastNote = notes[notes.length - 1];
          const pitchTolerance = 1; // semitones
          
          if (lastNote && 
              Math.abs(lastNote.pitch - midiNote) <= pitchTolerance && 
              time - (lastNote.time + lastNote.duration) < 0.1) {
            // Extend the previous note
            lastNote.duration = time - lastNote.time + hopSize / sampleRate;
          } else {
            // Create new note
            notes.push({
              time,
              pitch: midiNote,
              duration: hopSize / sampleRate,
              velocity: Math.min(127, Math.floor(amplitude * 500))
            });
          }
        }
      }
    }
    
    // Filter out notes that are too short
    return notes.filter(note => note.duration >= 0.1);
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
      const extractedNotes = detectPitchFromBuffer(buffer);
      setProcessingProgress(80);
      
      setMidiData(extractedNotes);
      setProcessingProgress(100);
      
      toast.success(`Audio processed successfully! Detected ${extractedNotes.length} notes.`);
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
    } else {
      audioRef.current.play().catch(error => {
        toast.error("Failed to play audio");
        console.error(error);
      });
      updateTime();
    }
    setIsPlaying(!isPlaying);
  };

  const updateTime = () => {
    if (audioRef.current && isPlaying) {
      setCurrentTime(audioRef.current.currentTime);
      animationFrameRef.current = requestAnimationFrame(updateTime);
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

  const createMidiFile = (notes: MidiNote[]): Uint8Array => {
    // Simple MIDI file creation (Type 0, single track)
    const header = new Uint8Array([
      0x4D, 0x54, 0x68, 0x64, // "MThd"
      0x00, 0x00, 0x00, 0x06, // Header length
      0x00, 0x00, // Format type 0
      0x00, 0x01, // Number of tracks
      0x00, 0x60  // Ticks per quarter note (96)
    ]);
    
    // Track header
    const trackHeader = new Uint8Array([
      0x4D, 0x54, 0x72, 0x6B // "MTrk"
    ]);
    
    // Convert notes to MIDI events (simplified)
    const events: number[] = [];
    notes.forEach(note => {
      const deltaTime = Math.floor(note.time * 96); // Convert to ticks
      const duration = Math.floor(note.duration * 96);
      
      // Note on
      events.push(deltaTime & 0x7F); // Delta time (simplified)
      events.push(0x90); // Note on, channel 0
      events.push(note.pitch);
      events.push(note.velocity);
      
      // Note off
      events.push(duration & 0x7F);
      events.push(0x80); // Note off, channel 0
      events.push(note.pitch);
      events.push(0x40); // Release velocity
    });
    
    // End of track
    events.push(0x00, 0xFF, 0x2F, 0x00);
    
    const trackData = new Uint8Array(events);
    const trackLength = new Uint8Array(4);
    const length = trackData.length;
    trackLength[0] = (length >> 24) & 0xFF;
    trackLength[1] = (length >> 16) & 0xFF;
    trackLength[2] = (length >> 8) & 0xFF;
    trackLength[3] = length & 0xFF;
    
    // Combine all parts
    const result = new Uint8Array(header.length + trackHeader.length + trackLength.length + trackData.length);
    result.set(header, 0);
    result.set(trackHeader, header.length);
    result.set(trackLength, header.length + trackHeader.length);
    result.set(trackData, header.length + trackHeader.length + trackLength.length);
    
    return result;
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
            <ControlPanel
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              onExport={handleExportMidi}
              canExport={midiData.length > 0}
            />

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
              <h3 className="text-lg font-semibold mb-4">Piano Roll</h3>
              <PianoRoll
                midiData={midiData}
                currentTime={currentTime}
                duration={duration}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;