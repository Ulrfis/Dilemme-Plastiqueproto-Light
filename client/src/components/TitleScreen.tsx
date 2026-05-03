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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-primary/10 via-background to-chart-2/10 overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12 max-w-3xl w-full">

        <div className="flex-shrink-0 flex items-end justify-center">
          <img
            src={peterAvatar}
            alt="Peter, ton guide IA"
            className="h-64 md:h-80 w-auto object-contain drop-shadow-xl animate-scale-in select-none pointer-events-none"
          />
        </div>

        <div className="flex flex-col items-center md:items-start space-y-6 max-w-sm w-full">
          <div className="flex flex-col items-center md:items-start space-y-3">
            <img
              src={logoImage}
              alt="Place des Nations - Dilemme Plastique"
              className="w-full max-w-xs object-cover rounded-lg shadow-md"
            />
            <h1 className="font-heading text-4xl md:text-5xl font-bold text-center md:text-left bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
              Dilemme Plastique
            </h1>
            <p className="text-base text-foreground/80 text-center md:text-left leading-relaxed">
              Je suis Peter, ton guide dans cette expérience. Explore cette image avec moi et découvre les 6 indices qui révèlent l'impact du plastique sur notre santé.
            </p>
            <p className="text-sm text-muted-foreground text-center md:text-left">
              5 minutes. 6 découvertes. Une conversation.
            </p>
          </div>

          <Button
            onClick={handleStart}
            size="lg"
            className="w-full rounded-2xl text-lg py-6"
            data-testid="button-start"
          >
            Commencer
          </Button>

          <div className="flex flex-col items-center md:items-start gap-1 pt-2">
            <p className="text-xs text-muted-foreground/60 text-center md:text-left">
              Déjà commencé et souhaitez repartir de zéro ?
            </p>
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              data-testid="button-new-session-home"
            >
              <RefreshCw className="w-3 h-3" />
              Nouvelle session
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
