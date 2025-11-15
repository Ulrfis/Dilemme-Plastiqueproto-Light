import { Button } from "@/components/ui/button";
import logoImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";

interface TitleScreenProps {
  onStart: () => void;
}

export default function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-primary/10 via-background to-chart-2/10">
      <div className="flex flex-col items-center space-y-8 max-w-md w-full">
        <div className="flex flex-col items-center space-y-4">
          <img 
            src={logoImage} 
            alt="Place des Nations - Dilemme Plastique" 
            className="w-64 h-40 object-cover rounded-lg shadow-lg animate-scale-in"
          />
          <h1 className="font-heading text-5xl font-bold text-center bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
            Dilemme Plastique
          </h1>
          <p className="text-lg text-muted-foreground text-center">
            Prototype simplifié
          </p>
        </div>

        <Button
          onClick={onStart}
          size="lg"
          className="w-full max-w-sm rounded-2xl text-lg py-6"
          data-testid="button-start"
        >
          Commencer
        </Button>

        <a
          href="#"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-privacy"
        >
          Mentions légales & confidentialité
        </a>
      </div>
    </div>
  );
}
