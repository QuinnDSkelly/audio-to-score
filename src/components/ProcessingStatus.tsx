import { Loader2, Music } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ProcessingStatusProps {
  progress: number;
}

export const ProcessingStatus = ({ progress }: ProcessingStatusProps) => {
  const getStatusText = () => {
    if (progress < 30) return "Analyzing audio...";
    if (progress < 60) return "Detecting pitch...";
    if (progress < 90) return "Generating MIDI...";
    return "Finalizing...";
  };

  return (
    <Card className="p-8 bg-gradient-subtle border-primary/20">
      <div className="text-center space-y-6">
        {/* Animated Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-primary rounded-full animate-ping opacity-75" />
            <div className="relative bg-gradient-primary p-4 rounded-full">
              {progress < 100 ? (
                <Loader2 className="w-8 h-8 text-primary-foreground animate-spin" />
              ) : (
                <Music className="w-8 h-8 text-primary-foreground" />
              )}
            </div>
          </div>
        </div>

        {/* Status Text */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">
            {progress < 100 ? "Processing Audio" : "Complete!"}
          </h3>
          <p className="text-muted-foreground">
            {getStatusText()}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <Progress value={progress} className="w-full h-3" />
          <p className="text-sm text-muted-foreground">
            {progress}% complete
          </p>
        </div>

        {/* Processing Steps */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          {[
            { step: "Audio Analysis", threshold: 25 },
            { step: "Pitch Detection", threshold: 50 },
            { step: "MIDI Generation", threshold: 75 },
            { step: "Finalization", threshold: 100 }
          ].map(({ step, threshold }) => (
            <div 
              key={step}
              className={`
                p-3 rounded-lg border transition-all duration-300
                ${progress >= threshold 
                  ? 'bg-primary/10 border-primary text-primary' 
                  : 'bg-muted/30 border-border text-muted-foreground'
                }
              `}
            >
              <div className="text-sm font-medium">{step}</div>
              <div className="text-xs mt-1">
                {progress >= threshold ? '✓ Complete' : 'Pending...'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};