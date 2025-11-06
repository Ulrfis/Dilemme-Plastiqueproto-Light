import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, SkipForward } from "lucide-react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  const [videoEnded, setVideoEnded] = useState(false);
  const [showReplay, setShowReplay] = useState(false);

  const handleVideoEnd = () => {
    setVideoEnded(true);
    setShowReplay(true);
  };

  const handleReplay = () => {
    const video = document.getElementById('intro-video') as HTMLVideoElement;
    if (video) {
      video.currentTime = 0;
      video.play();
      setVideoEnded(false);
      setShowReplay(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      <video
        id="intro-video"
        className="w-full h-full object-contain"
        onEnded={handleVideoEnd}
        autoPlay
        playsInline
        data-testid="video-intro"
      >
        <source src="/intro-peter.mp4" type="video/mp4" />
        Votre navigateur ne supporte pas la vidéo.
      </video>

      <Button
        onClick={onComplete}
        variant="outline"
        className="fixed top-4 right-4 bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70"
        data-testid="button-skip"
      >
        <SkipForward className="w-4 h-4 mr-2" />
        Passer
      </Button>

      {showReplay && (
        <div className="fixed bottom-8 left-0 right-0 flex justify-center gap-4 animate-slide-up">
          <Button
            onClick={handleReplay}
            variant="outline"
            className="bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70"
            data-testid="button-replay"
          >
            <Play className="w-4 h-4 mr-2" />
            Rejouer
          </Button>
          <Button
            onClick={onComplete}
            className="bg-primary text-primary-foreground"
            data-testid="button-continue"
          >
            Continuer
          </Button>
        </div>
      )}
    </div>
  );
}
