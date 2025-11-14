import { Button } from "@/components/ui/button";
import { SkipForward } from "lucide-react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  // URL de la vidéo Gumlet
  const videoId = "65562242f2825d5b7aca4366";
  const embedUrl = `https://play.gumlet.io/embed/${videoId}`;

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
      {/* Player Gumlet avec iframe */}
      <div className="w-full h-full">
        <iframe
          src={embedUrl}
          title="Vidéo d'introduction"
          className="w-full h-full"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          data-testid="video-intro"
        />
      </div>

      {/* Bouton skip en haut à droite */}
      <Button
        onClick={onComplete}
        variant="outline"
        className="fixed top-4 right-4 bg-black/50 backdrop-blur-sm border-white/20 text-white hover:bg-black/70 z-10"
        data-testid="button-skip"
      >
        <SkipForward className="w-4 h-4 mr-2" />
        Passer
      </Button>
    </div>
  );
}
