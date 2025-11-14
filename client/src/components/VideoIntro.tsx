import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  const videoId = "6916ff7ddf9720847e0868f0";
  // Démarrer immédiatement en autoplay avec le son
  const embedUrl = `https://play.gumlet.io/embed/${videoId}?autoplay=true&preload=true&muted=false&loop=false`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);

  // Tenter le plein écran en mode paysage au chargement
  useEffect(() => {
    const attemptFullscreenLandscape = async () => {
      try {
        // Demander le plein écran sur le conteneur
        if (containerRef.current && document.fullscreenEnabled) {
          await containerRef.current.requestFullscreen();
          console.log('[VideoIntro] Fullscreen activated');
          
          // Tenter de verrouiller en mode paysage (si disponible)
          if (screen.orientation && 'lock' in screen.orientation) {
            try {
              await screen.orientation.lock('landscape');
              console.log('[VideoIntro] Screen locked to landscape');
            } catch (err) {
              console.log('[VideoIntro] Could not lock orientation:', err);
            }
          }
        }
      } catch (error) {
        console.log('[VideoIntro] Fullscreen not available or denied:', error);
      }
    };

    // Petit délai pour laisser le composant se monter
    const timer = setTimeout(attemptFullscreenLandscape, 100);
    
    return () => clearTimeout(timer);
  }, []);

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

    // Timer automatique de sécurité - passe à l'écran suivant après 65 secondes
    const videoDuration = 65000;
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
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 overflow-hidden">
      {/* Styles pour mobile - Assurer 100vh réel et pas de scroll */}
      <style>{`
        @media screen and (max-width: 768px) {
          body {
            overflow: hidden;
            position: fixed;
            width: 100%;
            height: 100%;
          }
          html {
            overflow: hidden;
          }
        }
      `}</style>

      {/* Player Gumlet en plein écran avec autoplay */}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        title="Vidéo d'introduction"
        className="absolute inset-0 w-full h-full border-0"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          border: 'none',
          display: 'block',
        }}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        data-testid="video-intro"
      />

      {/* Indication pour pivoter en mode paysage - s'affiche brièvement puis disparaît */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm sm:text-base animate-pulse">
        📱 Pivotez en mode paysage pour une meilleure expérience
      </div>

      {/* Bouton skip sur le CÔTÉ DROIT - Toujours visible */}
      <Button
        onClick={() => {
          console.log('[VideoIntro] Skip button clicked');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }}
        size="lg"
        style={{
          position: 'fixed',
          top: '50%',
          right: '1rem',
          transform: 'translateY(-50%)',
          zIndex: 30,
        }}
        className="h-14 w-14 sm:h-16 sm:w-auto sm:px-6 sm:right-8 rounded-2xl bg-primary/90 backdrop-blur-md border-2 border-white/10 text-white hover:bg-primary hover:scale-105 transition-all duration-200 shadow-2xl flex items-center justify-center"
        data-testid="button-skip"
      >
        <span className="hidden sm:inline text-lg font-medium mr-2">Continuer</span>
        <ChevronRight className="w-6 h-6 sm:w-6 sm:h-6" />
      </Button>
    </div>
  );
}
