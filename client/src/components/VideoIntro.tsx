import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  // URL de la vidéo Gumlet horizontale avec autoplay et son activé
  const videoId = "6916ff7ddf9720847e0868f0";
  const embedUrl = `https://play.gumlet.io/embed/${videoId}?autoplay=true&preload=true&muted=false`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);

  useEffect(() => {
    // Écouter les événements de la vidéo via postMessage
    const handleMessage = (event: MessageEvent) => {
      console.log('[VideoIntro] PostMessage received:', event.data);

      // Gumlet peut envoyer différents formats d'événements
      if (event.data) {
        // Format 1: { event: 'ended' }
        if (event.data.event === 'ended' || event.data.event === 'end') {
          console.log('[VideoIntro] Video ended via postMessage');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }

        // Format 2: { type: 'ended' }
        if (event.data.type === 'ended' || event.data.type === 'end') {
          console.log('[VideoIntro] Video ended via postMessage (type)');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // IMPORTANT: Fallback avec timer automatique
    // La durée approximative de la vidéo (à ajuster selon votre vidéo)
    // Si Gumlet ne supporte pas postMessage, on passe automatiquement après X secondes
    const videoDuration = 65000; // 65 secondes (ajustez selon la vraie durée)
    const autoSkipTimer = setTimeout(() => {
      console.log('[VideoIntro] Auto-skip triggered by timer');
      if (!videoEnded) {
        setVideoEnded(true);
        onComplete();
      }
    }, videoDuration);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(autoSkipTimer);
    };
  }, [onComplete, videoEnded]);

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Meta tags pour forcer l'orientation horizontale sur mobile */}
      <style>{`
        @media screen and (max-width: 768px) {
          body {
            transform: rotate(0deg);
          }
        }
      `}</style>

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

      {/* Bouton skip sur le CÔTÉ DROIT de l'écran - Position fixe à droite */}
      <Button
        onClick={() => {
          console.log('[VideoIntro] Skip button clicked');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }}
        size="lg"
        className="fixed top-1/2 right-4 sm:right-8 -translate-y-1/2 h-16 w-16 sm:w-auto sm:px-6 rounded-2xl bg-primary/90 backdrop-blur-md border-2 border-white/10 text-white hover:bg-primary hover:scale-105 transition-all duration-200 shadow-2xl z-10 flex items-center justify-center"
        data-testid="button-skip"
      >
        <span className="hidden sm:inline text-lg font-medium mr-2">Continuer</span>
        <ChevronRight className="w-6 h-6" />
      </Button>
    </div>
  );
}
