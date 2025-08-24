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
    <Card className="p-2 bg-gradient-subtle w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        {/* Transport Controls */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Button
            onClick={onPlayPause}
            size="sm"
            variant="gradient"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          
          <Button
            onClick={handleReset}
            variant="outline"
            size="sm"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        {/* Time Display and Seek */}
        <div className="flex-1 mx-2 min-w-32 max-w-xs">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-xs font-mono text-muted-foreground font-semibold">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs font-mono text-muted-foreground font-semibold">
              {formatTime(duration)}
            </span>
          </div>
          
          <div className="relative w-full px-1">
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
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Button
            onClick={onExport}
            disabled={!canExport}
            variant="outline"
            size="sm"
            className="hover:bg-gradient-accent transition-all duration-300 disabled:opacity-50"
          >
            <Download className="w-3 h-3 mr-1" />
            Export MIDI
          </Button>
        </div>
      </div>
    </Card>
  );
};