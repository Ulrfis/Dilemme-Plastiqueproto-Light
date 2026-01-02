import { Button } from "@/components/ui/button";
import { ChevronRight, Volume2, VolumeX, Play } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { useMedia } from "@/contexts/MediaContext";
import Hls from "hls.js";

interface VideoIntroProps {
  onComplete: () => void;
}

const VIDEO_URLS = {
  intro: "https://video.gumlet.io/653feb38beac1fa13f8fa8e5/69577dbaf3928b38fc32c32b/main.m3u8",
  desktop: "https://video.gumlet.io/653feb38beac1fa13f8fa8e5/69577d67d73a53e69e607fbf/main.m3u8",
  mobile: "https://video.gumlet.io/653feb38beac1fa13f8fa8e5/69577d67f3928b38fc32bb95/main.m3u8",
};

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  return mobileRegex.test(userAgent.toLowerCase()) || (isTouchDevice && isSmallScreen);
}

export default function VideoIntro({ onComplete }: VideoIntroProps) {
  const { audioUnlocked } = useMedia();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile] = useState(() => isMobileDevice());
  const [showPlayButton, setShowPlayButton] = useState(true);

  const playlist = [
    VIDEO_URLS.intro,
    isMobile ? VIDEO_URLS.mobile : VIDEO_URLS.desktop,
  ];

  console.log("[VideoIntro] Component mounted - isMobile:", isMobile, "playlist:", playlist);

  const loadVideo = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;

    console.log("[VideoIntro] Loading video:", url);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("[VideoIntro] HLS manifest parsed, ready to play");
        if (isPlaying) {
          video.play().catch((e) => console.log("[VideoIntro] Auto-play prevented:", e));
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error("[VideoIntro] HLS error:", data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log("[VideoIntro] Network error, trying to recover...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log("[VideoIntro] Media error, trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              console.error("[VideoIntro] Unrecoverable error");
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        console.log("[VideoIntro] Native HLS loaded");
        if (isPlaying) {
          video.play().catch((e) => console.log("[VideoIntro] Auto-play prevented:", e));
        }
      });
    }
  }, [isPlaying]);

  useEffect(() => {
    loadVideo(playlist[currentVideoIndex]);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [currentVideoIndex]);

  const handleVideoEnded = useCallback(() => {
    console.log("[VideoIntro] Video ended, index:", currentVideoIndex);
    
    if (currentVideoIndex < playlist.length - 1) {
      console.log("[VideoIntro] Transitioning to next video");
      setCurrentVideoIndex((prev) => prev + 1);
      
      setTimeout(() => {
        const video = videoRef.current;
        if (video) {
          loadVideo(playlist[currentVideoIndex + 1]);
          video.play().catch((e) => console.log("[VideoIntro] Play error:", e));
        }
      }, 50);
    } else {
      console.log("[VideoIntro] Playlist complete");
      if (!videoEnded) {
        setVideoEnded(true);
        onComplete();
      }
    }
  }, [currentVideoIndex, playlist, videoEnded, onComplete, loadVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener("ended", handleVideoEnded);
    video.addEventListener("play", () => setIsPlaying(true));
    video.addEventListener("pause", () => setIsPlaying(false));

    return () => {
      video.removeEventListener("ended", handleVideoEnded);
      video.removeEventListener("play", () => setIsPlaying(true));
      video.removeEventListener("pause", () => setIsPlaying(false));
    };
  }, [handleVideoEnded]);

  useEffect(() => {
    const attemptFullscreenLandscape = async () => {
      try {
        if (containerRef.current && document.fullscreenEnabled) {
          await containerRef.current.requestFullscreen();
          console.log("[VideoIntro] Fullscreen activated");

          if (screen.orientation && "lock" in screen.orientation) {
            try {
              await (screen.orientation.lock as any)("landscape");
              console.log("[VideoIntro] Screen locked to landscape");
            } catch (err) {
              console.log("[VideoIntro] Could not lock orientation:", err);
            }
          }
        }
      } catch (error) {
        console.log("[VideoIntro] Fullscreen not available or denied:", error);
      }
    };

    const timer = setTimeout(attemptFullscreenLandscape, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      console.log("[VideoIntro] Fullscreen state changed:", isCurrentlyFullscreen);
      setIsFullscreen(isCurrentlyFullscreen);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    setIsFullscreen(!!document.fullscreenElement);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Auto-skip timer removed - only the "Continuer" button should allow skipping
  // The video should play its entire duration naturally

  const playVideo = () => {
    const video = videoRef.current;
    if (video) {
      console.log("[VideoIntro] User clicked Play");
      video.muted = false;
      setIsMuted(false);
      video.play()
        .then(() => {
          console.log("[VideoIntro] Video playing with sound");
          setIsPlaying(true);
          setShowPlayButton(false);
        })
        .catch((e) => {
          console.log("[VideoIntro] Play failed, trying muted:", e);
          video.muted = true;
          setIsMuted(true);
          video.play()
            .then(() => {
              setIsPlaying(true);
              setShowPlayButton(false);
            })
            .catch((e2) => console.error("[VideoIntro] Muted play also failed:", e2));
        });
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) {
      const newMutedState = !isMuted;
      video.muted = newMutedState;
      setIsMuted(newMutedState);
      console.log("[VideoIntro] Mute toggled:", newMutedState);
    }
  };

  const getVideoStyle = () => {
    if (currentVideoIndex === 0) {
      return {
        width: "100%",
        height: "auto",
        maxHeight: "100%",
        objectFit: "contain" as const,
      };
    }
    
    if (isMobile) {
      return {
        width: "auto",
        height: "100%",
        maxWidth: "100%",
        objectFit: "contain" as const,
      };
    }
    
    return {
      width: "100%",
      height: "100%",
      objectFit: "cover" as const,
    };
  };

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black z-50 overflow-hidden flex items-center justify-center">
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

      <video
        ref={videoRef}
        className="block"
        style={getVideoStyle()}
        playsInline
        webkit-playsinline="true"
        data-testid="video-intro"
      />

      {showPlayButton && !isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Button
            onClick={playVideo}
            size="lg"
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary/90 backdrop-blur-md border-2 border-white/20 text-white hover:bg-primary hover:scale-110 transition-all duration-200 shadow-2xl"
            data-testid="button-play"
          >
            <Play className="w-10 h-10 sm:w-12 sm:h-12 ml-1" fill="white" />
          </Button>
        </div>
      )}

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

      {currentVideoIndex === 0 && !isFullscreen && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/80 backdrop-blur-sm px-6 py-3 rounded-full text-white text-sm sm:text-base font-semibold shadow-lg border-2 border-white/20">
          Mode paysage fortement recommandé
        </div>
      )}

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs font-medium">
          {currentVideoIndex + 1} / {playlist.length}
        </div>
      </div>

      <Button
        onClick={() => {
          console.log("[VideoIntro] Skip button clicked");
          if (!videoEnded) {
            setVideoEnded(true);
            onComplete();
          }
        }}
        size="lg"
        style={{
          position: "fixed",
          top: "50%",
          right: "1rem",
          transform: "translateY(-50%)",
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
