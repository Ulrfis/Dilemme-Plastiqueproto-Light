import { Button } from "@/components/ui/button";
import { ChevronRight, Volume2, VolumeX, Play } from "lucide-react";
import { useRef, useEffect, useState } from "react";
import { useMedia } from "@/contexts/MediaContext";

interface VideoIntroProps {
  onComplete: () => void;
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  const { audioUnlocked } = useMedia();
  const videoId = "6916ff7ddf9720847e0868f0";

  console.log('[VideoIntro] Component mounted - audioUnlocked:', audioUnlocked);

  // CHANGEMENT: Pas d'autoplay - l'utilisateur doit cliquer sur play
  // La vidéo démarre toujours avec le son activé (comme YouTube)
  const embedUrl = `https://play.gumlet.io/embed/${videoId}?autoplay=false&preload=true&muted=false&loop=false`;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Son activé par défaut
  const [isPlaying, setIsPlaying] = useState(false); // État de lecture
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false); // État plein écran

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

  // Tracker le changement d'état plein écran
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      console.log('[VideoIntro] Fullscreen state changed:', isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Vérifier l'état initial
    setIsFullscreen(!!document.fullscreenElement);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Fonction pour démarrer la lecture de la vidéo (appelée par le bouton Play)
  const playVideo = () => {
    if (iframeRef.current?.contentWindow) {
      console.log('[VideoIntro] User clicked Play - starting video with sound');

      // Envoyer plusieurs formats de commande play
      iframeRef.current.contentWindow.postMessage({ method: 'play' }, '*');
      iframeRef.current.contentWindow.postMessage({ event: 'command', func: 'play' }, '*');
      iframeRef.current.contentWindow.postMessage('play', '*');

      // S'assurer que le son est activé
      setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ method: 'unmute' }, '*');
          iframeRef.current.contentWindow.postMessage({ event: 'command', func: 'unmute' }, '*');
        }
      }, 100);

      setIsPlaying(true);
      setIsMuted(false);
      console.log('[VideoIntro] Play and unmute commands sent');
    }
  };

  // Fonction pour activer/désactiver le son avec retry pour fiabilité
  const toggleMute = () => {
    if (iframeRef.current) {
      const newMutedState = !isMuted;
      const command = isMuted ? 'unmute' : 'mute';

      console.log(`[VideoIntro] Toggling sound: ${command}`);

      // Envoyer plusieurs formats de commandes pour maximiser la compatibilité
      const sendCommand = () => {
        if (iframeRef.current?.contentWindow) {
          // Format 1: { method: 'unmute' }
          iframeRef.current.contentWindow.postMessage({ method: command }, '*');
          // Format 2: { event: 'command', func: 'unmute' }
          iframeRef.current.contentWindow.postMessage({ event: 'command', func: command }, '*');
          // Format 3: Direct command
          iframeRef.current.contentWindow.postMessage(command, '*');
        }
      };

      // Envoyer immédiatement
      sendCommand();

      // Retry après 100ms et 300ms pour s'assurer que ça passe
      setTimeout(sendCommand, 100);
      setTimeout(sendCommand, 300);

      setIsMuted(newMutedState);

      console.log(`[VideoIntro] Sound ${command} command sent, new state: muted=${newMutedState}`);
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

      // Détecter quand la vidéo commence à jouer
      if (event.data && (event.data.event === 'play' || event.data.event === 'playing' ||
                        event.data.type === 'play' || event.data.type === 'playing')) {
        console.log('[VideoIntro] Video started playing');
        setIsPlaying(true);
      }

      // Détecter quand la vidéo est en pause
      if (event.data && (event.data.event === 'pause' || event.data.type === 'pause')) {
        console.log('[VideoIntro] Video paused');
        setIsPlaying(false);
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

    // Timer automatique de sécurité - passe à l'écran suivant après 90 secondes
    // (durée augmentée pour laisser la vidéo se terminer naturellement)
    const videoDuration = 90000;
    const autoSkipTimer = setTimeout(() => {
      console.log('[VideoIntro] Auto-skip triggered by timer after 90s - video should have ended');
      if (!videoEnded) {
        console.log('[VideoIntro] Forcing video completion and advancing to next screen');
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

      {/* Indication pour pivoter en mode paysage - EN BAS de l'écran - Masquée en plein écran */}
      {!isFullscreen && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/80 backdrop-blur-sm px-6 py-3 rounded-full text-white text-sm sm:text-base font-semibold shadow-lg border-2 border-white/20">
          📱 Mode paysage fortement recommandé
        </div>
      )}

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
