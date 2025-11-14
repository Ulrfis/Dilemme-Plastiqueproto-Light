import { Button } from "@/components/ui/button";
import { ChevronRight, Play, Volume2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  // URL de la vidéo Gumlet horizontale
  const videoId = "6916ff7ddf9720847e0868f0";
  // IMPORTANT: On commence SANS autoplay pour forcer l'interaction utilisateur
  const [embedUrl, setEmbedUrl] = useState(
    `https://play.gumlet.io/embed/${videoId}?autoplay=false&preload=true&muted=false`
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [videoStarted, setVideoStarted] = useState(false);

  // Fonction pour démarrer la vidéo avec son
  const startVideoWithSound = () => {
    console.log('[VideoIntro] Starting video with sound after user interaction');

    // Cacher l'overlay
    setShowPlayOverlay(false);
    setVideoStarted(true);

    // Changer l'URL pour activer l'autoplay
    // CRUCIAL: Cette action se fait APRÈS une interaction utilisateur, donc le son sera autorisé
    setEmbedUrl(`https://play.gumlet.io/embed/${videoId}?autoplay=true&preload=true&muted=false&loop=false`);

    // Envoyer un message à l'iframe Gumlet pour démarrer la lecture
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage({ action: 'play' }, '*');
      } catch (error) {
        console.log('[VideoIntro] Could not send play message to iframe:', error);
      }
    }
  };

  useEffect(() => {
    // Écouter les événements de la vidéo via postMessage
    const handleMessage = (event: MessageEvent) => {
      console.log('[VideoIntro] PostMessage received:', event.data);

      // Gumlet peut envoyer différents formats d'événements
      if (event.data) {
        // Détecter le démarrage de la vidéo
        if (event.data.event === 'play' || event.data.event === 'playing') {
          console.log('[VideoIntro] Video started playing');
          setVideoStarted(true);
          setShowPlayOverlay(false);
        }

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
    // MAIS seulement si la vidéo a démarré
    let autoSkipTimer: NodeJS.Timeout | null = null;

    if (videoStarted) {
      const videoDuration = 65000; // 65 secondes (ajustez selon la vraie durée)
      autoSkipTimer = setTimeout(() => {
        console.log('[VideoIntro] Auto-skip triggered by timer');
        if (!videoEnded) {
          setVideoEnded(true);
          onComplete();
        }
      }, videoDuration);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      if (autoSkipTimer) clearTimeout(autoSkipTimer);
    };
  }, [onComplete, videoEnded, videoStarted]);

  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
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

      {/* Player Gumlet en plein écran - avec styles inline pour mobile */}
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

      {/* OVERLAY DE DÉMARRAGE - Apparaît au début pour demander l'interaction utilisateur */}
      {showPlayOverlay && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm z-20 flex items-center justify-center p-4 overflow-hidden">
          <div className="text-center space-y-4 sm:space-y-6 max-w-md w-full">
            <div className="text-white space-y-2 sm:space-y-3">
              <Volume2 className="w-12 h-12 sm:w-16 sm:h-16 mx-auto animate-pulse text-primary" />
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold px-4">Vidéo d'introduction</h2>
              <p className="text-sm sm:text-base md:text-lg text-white/80 px-4">
                Appuyez pour lancer la vidéo avec le son
              </p>
            </div>

            <Button
              onClick={startVideoWithSound}
              size="lg"
              className="h-16 sm:h-20 px-6 sm:px-8 rounded-2xl bg-primary hover:bg-primary/90 text-white text-lg sm:text-xl font-bold hover:scale-105 transition-all duration-200 shadow-2xl touch-manipulation w-full sm:w-auto"
              data-testid="button-start-video"
            >
              <Play className="w-6 h-6 sm:w-8 sm:h-8 mr-2 sm:mr-3 fill-current" />
              Lancer la vidéo
            </Button>

            <p className="text-xs sm:text-sm text-white/60 px-4">
              📱 Sur smartphone, mettez votre appareil en mode paysage
            </p>
          </div>
        </div>
      )}

      {/* Bouton skip sur le CÔTÉ DROIT - Visible seulement une fois la vidéo lancée */}
      {videoStarted && !showPlayOverlay && (
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
      )}
    </div>
  );
}
