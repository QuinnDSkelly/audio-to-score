import { useEffect, useRef } from "react";

interface WaveformVisualizationProps {
  audioBuffer: AudioBuffer | null;
  currentTime: number;
  isPlaying: boolean;
}

export const WaveformVisualization = ({ 
  audioBuffer, 
  currentTime, 
  isPlaying 
}: WaveformVisualizationProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

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

    // Clear canvas
    ctx.fillStyle = 'hsl(var(--waveform-bg))';
    ctx.fillRect(0, 0, width, height);

    // Get audio data
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    // Draw waveform
    ctx.beginPath();
    ctx.moveTo(0, amp);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      
      const x = i;
      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;
      
      ctx.lineTo(x, yMin);
      ctx.lineTo(x, yMax);
    }
    
    ctx.strokeStyle = 'hsl(var(--waveform))';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw progress indicator
    const progressX = (currentTime / audioBuffer.duration) * width;
    ctx.fillStyle = 'hsl(var(--primary))';
    ctx.fillRect(progressX - 1, 0, 2, height);

    // Draw played section overlay
    if (currentTime > 0) {
      const gradient = ctx.createLinearGradient(0, 0, progressX, 0);
      gradient.addColorStop(0, 'hsl(var(--primary) / 0.3)');
      gradient.addColorStop(1, 'hsl(var(--primary) / 0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, progressX, height);
    }

  }, [audioBuffer, currentTime]);

  return (
    <div className="relative w-full h-32 bg-waveform-bg rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      />
      {isPlaying && (
        <div className="absolute top-2 right-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-note-active rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground">Playing</span>
          </div>
        </div>
      )}
    </div>
  );
};