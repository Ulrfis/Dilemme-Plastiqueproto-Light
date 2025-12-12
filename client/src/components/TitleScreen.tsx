import { Button } from "@/components/ui/button";
import logoImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";
import { useMedia } from "@/contexts/MediaContext";
import posthog from "posthog-js";

interface TitleScreenProps {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: TitleScreenProps) {
  const { unlockAudio } = useMedia();

  const handleStart = async () => {
    console.log('[TitleScreen] Start button clicked - unlocking audio...');
    posthog.capture("title_screen_started");

    // Déverrouiller l'audio avec le user gesture
    const unlocked = await unlockAudio();

    if (unlocked) {
      console.log('[TitleScreen] Audio unlocked successfully, proceeding to video');
    } else {
      console.log('[TitleScreen] Audio unlock failed, but proceeding anyway');
    }

    // Naviguer vers l'écran vidéo
    onStart();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-primary/10 via-background to-chart-2/10">
      <div className="flex flex-col items-center space-y-8 max-w-lg w-full">
        <div className="flex flex-col items-center space-y-4">
          <img
            src={logoImage}
            alt="Place des Nations - Dilemme Plastique"
            className="w-full max-w-lg object-cover rounded-lg shadow-lg animate-scale-in"
          />
          <h1 className="font-heading text-5xl font-bold text-center bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
            Dilemme Plastique
          </h1>
          <p className="text-lg text-muted-foreground text-center">
            Prototype simplifié
          </p>
        </div>

        <Button
          onClick={handleStart}
          size="lg"
          className="w-full max-w-sm rounded-2xl text-lg py-6"
          data-testid="button-start"
        >
          Commencer
        </Button>
      </div>
    </div>
  );
}
