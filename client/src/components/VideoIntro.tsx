import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useRef, useEffect } from "react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  // URL de la vidéo Gumlet horizontale avec autoplay et son activé
  const videoId = "6916ff7ddf9720847e0868f0";
  const embedUrl = `https://play.gumlet.io/embed/${videoId}?autoplay=true&preload=true&muted=false`;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Écouter les événements de la vidéo via postMessage
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Gumlet envoie des événements via postMessage
      if (event.data && event.data.event === 'ended') {
        onComplete();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Player Gumlet en plein écran */}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Vidéo d'introduction"
        className="absolute inset-0 w-full h-full border-0"
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        data-testid="video-intro"
      />

      {/* Bouton skip au centre droit de l'écran */}
      <Button
        onClick={onComplete}
        size="lg"
        className="fixed top-1/2 right-8 -translate-y-1/2 h-16 px-6 rounded-2xl bg-primary/90 backdrop-blur-md border-2 border-white/10 text-white hover:bg-primary hover:scale-105 transition-all duration-200 shadow-2xl z-10"
        data-testid="button-skip"
      >
        <span className="text-lg font-medium mr-2">Continuer</span>
        <ChevronRight className="w-6 h-6" />
      </Button>
    </div>
  );
}
