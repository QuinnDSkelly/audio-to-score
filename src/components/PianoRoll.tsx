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

    // Clear canvas and get colors
    const computedStyle = getComputedStyle(document.documentElement);
    const backgroundColor = computedStyle.getPropertyValue('--background').trim() || '0 0% 100%';
    const pianoWhite = computedStyle.getPropertyValue('--card').trim() || '0 0% 100%';
    const pianoBlack = computedStyle.getPropertyValue('--muted').trim() || '0 0% 10%';
    const borderColor = computedStyle.getPropertyValue('--border').trim() || '0 0% 89%';
    const cardColor = computedStyle.getPropertyValue('--card').trim() || '0 0% 100%';
    const primaryColor = computedStyle.getPropertyValue('--primary').trim() || '262 83% 58%';
    const accentColor = computedStyle.getPropertyValue('--accent').trim() || '262 83% 58%';
    
    ctx.fillStyle = `hsl(${backgroundColor})`;
    ctx.fillRect(0, 0, width, height);

    // Draw piano keys
    for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
      const { noteIndex, noteName, octave, isBlackKey } = getNoteInfo(pitch);
      const y = height - ((pitch - minPitch) * noteHeight) - noteHeight;
      
      // Key background
      ctx.fillStyle = isBlackKey ? `hsl(${pianoBlack})` : `hsl(${pianoWhite})`;
      ctx.fillRect(0, y, pianoWidth, noteHeight);
      
      // Key border
      ctx.strokeStyle = `hsl(${borderColor})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(0, y, pianoWidth, noteHeight);
      
      // Note label (only for C notes to avoid clutter)
      if (noteIndex === 0) {
        ctx.fillStyle = isBlackKey ? `hsl(${pianoWhite})` : `hsl(${pianoBlack})`;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${noteName}${octave}`, pianoWidth / 2, y + noteHeight / 2 + 3);
      }
    }

    // Draw roll background
    ctx.fillStyle = `hsl(${cardColor})`;
    ctx.fillRect(pianoWidth, 0, rollWidth, height);

    // Draw grid lines
    const borderHSL = borderColor.split(' ').map(v => v.replace('%', ''));
    ctx.strokeStyle = `hsla(${borderHSL[0]}, ${borderHSL[1]}%, ${borderHSL[2]}%, 0.3)`;
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
    console.log(`Drawing ${midiData.length} notes`);
    midiData.forEach((note, index) => {
      if (note.pitch < minPitch || note.pitch > maxPitch) return;
      
      const x = pianoWidth + (note.time / duration) * rollWidth;
      const noteWidth = Math.max((note.duration / duration) * rollWidth, 3);
      const y = height - ((note.pitch - minPitch + 1) * noteHeight);
      
      console.log(`Note ${index}: pitch=${note.pitch}, time=${note.time}, duration=${note.duration}, x=${x}, y=${y}, width=${noteWidth}`);
      
      // Note rectangle
      const isActive = currentTime >= note.time && currentTime <= note.time + note.duration;
      const alpha = Math.max(0.3, Math.min(1.0, note.velocity / 127));
      
      // Parse HSL values correctly
      const parseHSL = (hslString: string) => {
        const values = hslString.split(' ');
        return {
          h: parseFloat(values[0]) || 262,
          s: parseFloat(values[1]?.replace('%', '')) || 83,
          l: parseFloat(values[2]?.replace('%', '')) || 58
        };
      };
      
      const primary = parseHSL(primaryColor);
      const accent = parseHSL(accentColor);
      
      if (isActive) {
        ctx.fillStyle = `hsla(${accent.h}, ${accent.s}%, ${accent.l}%, ${alpha})`;
        ctx.shadowColor = `hsl(${accent.h}, ${accent.s}%, ${accent.l}%)`;
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = `hsla(${primary.h}, ${primary.s}%, ${primary.l}%, ${alpha})`;
        ctx.shadowBlur = 0;
      }
      
      // Draw note rectangle
      ctx.fillRect(x, y, noteWidth, noteHeight - 1);
      ctx.shadowBlur = 0;
      
      // Note border
      ctx.strokeStyle = isActive ? `hsl(${accent.h}, ${accent.s}%, ${accent.l}%)` : `hsl(${primary.h}, ${primary.s}%, ${primary.l}%)`;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, noteWidth, noteHeight - 1);
    });

    // Draw playhead
    if (duration > 0) {
      const playheadX = pianoWidth + (currentTime / duration) * rollWidth;
      ctx.strokeStyle = `hsl(${accentColor})`;
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