import { useState, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { captureEvent } from "@/App";

interface WelcomeSetupProps {
  onStart: (name: string) => void | Promise<void>;
}

export default function WelcomeSetup({ onStart }: WelcomeSetupProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStart = async () => {
    if (isSubmitting) return;

    console.log('[WelcomeSetup] handleStart called with name:', name);
    const trimmedName = name.trim();

    if (trimmedName) {
      console.log('[WelcomeSetup] Starting tutorial with name:', trimmedName);
      captureEvent("user_session_started", { userName: trimmedName });
      setIsSubmitting(true);
      try {
        await onStart(trimmedName);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      console.log('[WelcomeSetup] Name is empty, not starting');
    }
  };

  // Handler spécifique pour les événements tactiles sur mobile
  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    console.log('[WelcomeSetup] Touch event triggered');
    void handleStart();
  };

  const isButtonDisabled = !name.trim() || isSubmitting;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold font-heading">Bienvenue!</h2>
          <p className="text-muted-foreground">
            Comment dois-je t'appeler?
          </p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Prénom</Label>
            <Input
              id="name"
              type="text"
              placeholder="Ton prénom..."
              value={name}
              disabled={isSubmitting}
              onChange={(e) => {
                console.log('[WelcomeSetup] Name changed:', e.target.value);
                setName(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  console.log('[WelcomeSetup] Enter key pressed');
                  void handleStart();
                }
              }}
              className="text-lg rounded-xl"
              data-testid="input-name"
              autoComplete="off"
              autoFocus
            />
          </div>

          <Button
            onClick={(e) => {
              e.preventDefault();
              console.log('[WelcomeSetup] Click event triggered');
              void handleStart();
            }}
            onTouchEnd={!isButtonDisabled ? handleTouchEnd : undefined}
            disabled={isButtonDisabled}
            className="w-full rounded-2xl text-lg py-6 touch-manipulation"
            size="lg"
            data-testid="button-start-tutorial"
            type="button"
          >
            {isSubmitting ? "Démarrage..." : "Démarrer le tutoriel"}
          </Button>
        </div>
      </div>
    </div>
  );
}
