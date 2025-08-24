import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Music, FileAudio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface AudioUploadProps {
  onFileUpload: (file: File) => void;
}

export const AudioUpload = ({ onFileUpload }: AudioUploadProps) => {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileUpload(acceptedFiles[0]);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.flac', '.m4a']
    },
    multiple: false,
    onDragEnter: () => setDragActive(true),
    onDragLeave: () => setDragActive(false),
  });

  return (
    <Card className="relative overflow-hidden">
      <div
        {...getRootProps()}
        className={`
          relative p-12 text-center cursor-pointer transition-all duration-300
          ${isDragActive || dragActive 
            ? 'bg-gradient-accent border-primary shadow-glow' 
            : 'bg-muted/30 hover:bg-muted/50'
          }
          border-2 border-dashed border-border hover:border-primary/50
        `}
      >
        <input {...getInputProps()} />
        
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-subtle opacity-50" />
        
        <div className="relative z-10 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className={`
              p-6 rounded-full transition-all duration-300
              ${isDragActive || dragActive 
                ? 'bg-primary/20 shadow-glow' 
                : 'bg-primary/10'
              }
            `}>
              {isDragActive || dragActive ? (
                <Upload className="w-12 h-12 text-primary animate-bounce" />
              ) : (
                <FileAudio className="w-12 h-12 text-primary" />
              )}
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">
              {isDragActive ? "Drop your audio file here" : "Upload Audio File"}
            </h3>
            <p className="text-muted-foreground">
              Drag & drop your MP3, WAV, or FLAC file, or click to browse
            </p>
            <p className="text-sm text-muted-foreground">
              Supported formats: MP3, WAV, FLAC, M4A (Max 50MB)
            </p>
          </div>

          {/* Browse Button */}
          {!isDragActive && !dragActive && (
            <Button 
              variant="gradient" 
              size="lg"
              className="mt-4"
            >
              <Music className="w-4 h-4 mr-2" />
              Browse Files
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};