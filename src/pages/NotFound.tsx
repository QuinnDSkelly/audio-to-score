import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, Music } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
      <div className="text-center space-y-8 p-8">
        {/* 404 Icon */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-primary rounded-full animate-ping opacity-20" />
          <div className="relative bg-gradient-primary p-6 rounded-full mx-auto w-24 h-24 flex items-center justify-center">
            <Music className="w-12 h-12 text-primary-foreground" />
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            404
          </h1>
          <h2 className="text-2xl font-semibold">
            Page Not Found
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            The audio file you're looking for seems to have gone off-key. Let's get you back to the main stage.
          </p>
        </div>

        {/* Action Button */}
        <Button 
          variant="gradient" 
          size="lg"
          onClick={() => window.location.href = '/'}
          className="mx-auto"
        >
          <Home className="w-4 h-4 mr-2" />
          Back to Converter
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
