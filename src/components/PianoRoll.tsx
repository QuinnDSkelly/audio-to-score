import { useEffect, useRef } from "react";
import type { MidiNote } from "@/pages/Index";

interface PianoRollProps {
  midiData: MidiNote[];
  currentTime: number;
  duration: number;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // C#, D#, F#, G#, A#

export const PianoRoll = ({ midiData, currentTime, duration }: PianoRollProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getNoteInfo = (pitch: number) => {
    const octave = Math.floor(pitch / 12) - 1;
    const noteIndex = pitch % 12;
    const noteName = NOTES[noteIndex];
    const isBlackKey = BLACK_KEYS.includes(noteIndex);
    return { octave, noteIndex, noteName, isBlackKey };
  };

  useEffect(() => {
    if (!canvasRef.current || !duration) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Piano roll dimensions
    const pianoWidth = 60;
    const rollWidth = width - pianoWidth;
    const noteHeight = 20;
    const minPitch = 36; // C2
    const maxPitch = 96; // C7
    const pitchRange = maxPitch - minPitch;
    const rollHeight = pitchRange * noteHeight;

    // Clear canvas
    ctx.fillStyle = 'hsl(var(--background))';
    ctx.fillRect(0, 0, width, height);

    // Draw piano keys
    for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
      const { noteIndex, noteName, octave, isBlackKey } = getNoteInfo(pitch);
      const y = height - ((pitch - minPitch) * noteHeight) - noteHeight;
      
      // Key background
      ctx.fillStyle = isBlackKey ? 'hsl(var(--piano-black))' : 'hsl(var(--piano-white))';
      ctx.fillRect(0, y, pianoWidth, noteHeight);
      
      // Key border
      ctx.strokeStyle = 'hsl(var(--border))';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, y, pianoWidth, noteHeight);
      
      // Note label (only for C notes to avoid clutter)
      if (noteIndex === 0) {
        ctx.fillStyle = isBlackKey ? 'hsl(var(--piano-white))' : 'hsl(var(--piano-black))';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${noteName}${octave}`, pianoWidth / 2, y + noteHeight / 2 + 3);
      }
    }

    // Draw roll background
    ctx.fillStyle = 'hsl(var(--card))';
    ctx.fillRect(pianoWidth, 0, rollWidth, height);

    // Draw grid lines
    ctx.strokeStyle = 'hsl(var(--border) / 0.3)';
    ctx.lineWidth = 1;
    
    // Horizontal lines (pitches)
    for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
      const y = height - ((pitch - minPitch) * noteHeight);
      ctx.beginPath();
      ctx.moveTo(pianoWidth, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Vertical lines (time)
    const timeStep = 1; // 1 second
    for (let time = 0; time <= duration; time += timeStep) {
      const x = pianoWidth + (time / duration) * rollWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Draw MIDI notes
    midiData.forEach(note => {
      const x = pianoWidth + (note.time / duration) * rollWidth;
      const noteWidth = (note.duration / duration) * rollWidth;
      const y = height - ((note.pitch - minPitch) * noteHeight) - noteHeight;
      
      // Note rectangle
      const isActive = currentTime >= note.time && currentTime <= note.time + note.duration;
      const alpha = note.velocity / 127;
      
      if (isActive) {
        ctx.fillStyle = `hsl(var(--note-active) / ${alpha})`;
        ctx.shadowColor = 'hsl(var(--note-active))';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = `hsl(var(--primary) / ${alpha * 0.7})`;
        ctx.shadowBlur = 0;
      }
      
      ctx.fillRect(x, y, Math.max(noteWidth, 2), noteHeight - 2);
      ctx.shadowBlur = 0;
      
      // Note border
      ctx.strokeStyle = isActive ? 'hsl(var(--note-active))' : 'hsl(var(--primary))';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, Math.max(noteWidth, 2), noteHeight - 2);
    });

    // Draw playhead
    if (duration > 0) {
      const playheadX = pianoWidth + (currentTime / duration) * rollWidth;
      ctx.strokeStyle = 'hsl(var(--accent))';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

  }, [midiData, currentTime, duration]);

  return (
    <div className="relative w-full h-96 bg-card rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
      />
      <div className="absolute top-2 right-2 text-xs text-muted-foreground">
        {midiData.length} notes detected
      </div>
    </div>
  );
};