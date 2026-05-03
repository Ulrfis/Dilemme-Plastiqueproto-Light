import { Button } from "@/components/ui/button";
import logoImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";
import peterAvatar from "@assets/peter_avatar_nobg.png";
import { useMedia } from "@/contexts/MediaContext";
import { captureEvent } from "@/App";
import { useSessionFlow } from "@/contexts/SessionFlowContext";
import { RefreshCw } from "lucide-react";

interface TitleScreenProps {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: TitleScreenProps) {
  const { unlockAudio } = useMedia();
  const { resetSession } = useSessionFlow();

  const handleStart = async () => {
    console.log('[TitleScreen] Start button clicked - unlocking audio...');
    captureEvent("title_screen_started");
    const unlocked = await unlockAudio();
    if (unlocked) {
      console.log('[TitleScreen] Audio unlocked successfully, proceeding to video');
    } else {
      console.log('[TitleScreen] Audio unlock failed, but proceeding anyway');
    }
    onStart();
  };

  const handleNewSession = () => {
    if (confirm("Voulez-vous vraiment recommencer l'expérience ? Cela effacera votre progression actuelle.")) {
      resetSession();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-br from-primary/10 via-background to-chart-2/10">
      <div className="flex flex-col items-center gap-5 w-full max-w-xl">

        <h1 className="font-heading text-5xl font-bold text-center bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
          Dilemme Plastique
        </h1>

        <div className="relative w-full">
          <img
            src={logoImage}
            alt="Place des Nations - Dilemme Plastique"
            className="w-full object-cover rounded-xl shadow-md"
          />
          <img
            src={peterAvatar}
            alt="Peter, ton guide IA"
            className="absolute -bottom-14 right-4 h-36 w-auto object-contain drop-shadow-lg select-none pointer-events-none"
          />
        </div>

        <div className="flex flex-col items-center gap-2 pt-10 text-center">
          <p className="text-base text-foreground/80 leading-relaxed">
            Explore cette image avec Peter et découvre les 6 indices cachés sur l'impact du plastique dans notre corps.
          </p>
          <p className="text-sm text-muted-foreground">
            5 minutes. 6 découvertes. Une conversation.
          </p>
        </div>

        <Button
          onClick={handleStart}
          className="w-full rounded-2xl"
          data-testid="button-start"
        >
          Commencer
        </Button>

        <div className="flex flex-col items-center gap-1 pt-1">
          <p className="text-xs text-muted-foreground/50 text-center">
            Déjà commencé et souhaitez repartir de zéro ?
          </p>
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            data-testid="button-new-session-home"
          >
            <RefreshCw className="w-3 h-3" />
            Nouvelle session
          </button>
        </div>

      </div>
    </div>
  );
}
