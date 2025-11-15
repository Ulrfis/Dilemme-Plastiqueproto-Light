import { Button } from "@/components/ui/button";
import { ChevronRight, Volume2, VolumeX } from "lucide-react";
import { useRef, useEffect, useState } from "react";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  const videoId = "6916ff7ddf9720847e0868f0";
  // Démarrer en autoplay MUTED (obligatoire pour que l'autoplay fonctionne sur navigateurs modernes)
  const embedUrl = `https://play.gumlet.io/embed/${videoId}?autoplay=true&preload=true&muted=true&loop=false`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showUnmutePrompt, setShowUnmutePrompt] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);

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
              await (screen.orientation.lock as any)('landscape');
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

  // Activer automatiquement le son dès que l'iframe est chargé
  useEffect(() => {
    if (iframeLoaded && iframeRef.current && isMuted) {
      console.log('[VideoIntro] Attempting to unmute automatically');
      // Petit délai pour s'assurer que le player Gumlet est prêt
      const unmuteTimer = setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.contentWindow?.postMessage(
            { method: 'unmute' },
            '*'
          );
          setIsMuted(false);
          setShowUnmutePrompt(false);
          console.log('[VideoIntro] Unmute command sent');
        }
      }, 500);

      return () => clearTimeout(unmuteTimer);
    }
  }, [iframeLoaded, isMuted]);

  // Fonction pour activer/désactiver le son
  const toggleMute = () => {
    if (iframeRef.current) {
      // Envoyer un message au player Gumlet pour changer le mute
      iframeRef.current.contentWindow?.postMessage(
        { method: isMuted ? 'unmute' : 'mute' },
        '*'
      );
      setIsMuted(!isMuted);
      setShowUnmutePrompt(false);
    }
  };

  useEffect(() => {
    // Écouter les événements de la vidéo via postMessage
    const handleMessage = (event: MessageEvent) => {
      console.log('[VideoIntro] PostMessage received:', event.data);

      // Détecter quand le player est prêt
      if (event.data && (event.data.event === 'ready' || event.data.type === 'ready')) {
        console.log('[VideoIntro] Player is ready');
        setIframeLoaded(true);
      }

      // Gumlet peut envoyer différents formats d'événements pour la fin
      if (event.data) {
        // Format 1: { event: 'ended' } ou { event: 'end' }
        if (event.data.event === 'ended' || event.data.event === 'end') {
          console.log('[VideoIntro] Video ended via postMessage (event)');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }

        // Format 2: { type: 'ended' } ou { type: 'end' }
        if (event.data.type === 'ended' || event.data.type === 'end') {
          console.log('[VideoIntro] Video ended via postMessage (type)');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }

        // Format 3: Vérifier d'autres variantes possibles
        if (event.data.method === 'ended' || event.data.method === 'end') {
          console.log('[VideoIntro] Video ended via postMessage (method)');
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Timer automatique de sécurité - passe à l'écran suivant après 60 secondes
    const videoDuration = 60000;
    const autoSkipTimer = setTimeout(() => {
      console.log('[VideoIntro] Auto-skip triggered by timer after 60s');
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
        onLoad={() => {
          console.log('[VideoIntro] Iframe loaded');
          // Fallback si le postMessage "ready" n'arrive pas
          setTimeout(() => setIframeLoaded(true), 1000);
        }}
        data-testid="video-intro"
      />

      {/* Bouton UNMUTE prominent au centre - Disparaît après activation */}
      {showUnmutePrompt && isMuted && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-3">
          <Button
            onClick={toggleMute}
            size="lg"
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary hover:bg-primary/90 hover:scale-110 transition-all duration-200 shadow-2xl border-4 border-white/20"
            data-testid="button-unmute"
          >
            <Volume2 className="w-10 h-10 sm:w-12 sm:h-12" />
          </Button>
          <div className="bg-black/80 backdrop-blur-sm px-4 py-2 rounded-full text-white text-sm sm:text-base animate-pulse">
            🔊 Touchez pour activer le son
          </div>
        </div>
      )}

      {/* Indicateur de son en haut à gauche */}
      <div className="absolute top-4 left-4 z-20">
        <Button
          onClick={toggleMute}
          size="icon"
          variant="secondary"
          className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all"
          data-testid="button-toggle-sound"
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          ) : (
            <Volume2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          )}
        </Button>
      </div>

      {/* Indication pour pivoter en mode paysage */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full text-white text-xs sm:text-sm">
        📱 Mode paysage recommandé
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
