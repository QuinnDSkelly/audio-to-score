import { Play, Pause, Square, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";

interface ControlPanelProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onExport: () => void;
  canExport: boolean;
}

export const ControlPanel = ({
  isPlaying,
  onPlayPause,
  currentTime,
  duration,
  onSeek,
  onExport,
  canExport
}: ControlPanelProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number[]) => {
    onSeek(value[0]);
  };

  const handleReset = () => {
    onSeek(0);
  };

  return (
    <Card className="p-4 bg-gradient-subtle w-full">
      <div className="flex items-center justify-between gap-6">
        {/* Transport Controls */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <Button
            onClick={onPlayPause}
            size="lg"
            variant="gradient"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
          
          <Button
            onClick={handleReset}
            variant="outline"
            size="lg"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        {/* Time Display and Seek - Expanded */}
        <div className="flex-1 mx-6 min-w-80 max-w-2xl">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-sm font-mono text-muted-foreground font-semibold">
              {formatTime(currentTime)}
            </span>
            <span className="text-sm font-mono text-muted-foreground font-semibold">
              {formatTime(duration)}
            </span>
          </div>
          
          <div className="relative w-full px-2">
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="w-full"
            />
          </div>
        </div>

        {/* Export Controls */}
        <div className="flex items-center space-x-4 flex-shrink-0">
          <Button
            onClick={onExport}
            disabled={!canExport}
            variant="outline"
            size="lg"
            className="hover:bg-gradient-accent transition-all duration-300 disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export MIDI
          </Button>
        </div>
      </div>
    </Card>
  );
};