import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WelcomeSetupProps {
  onStart: (name: string) => void;
}

export default function WelcomeSetup({ onStart }: WelcomeSetupProps) {
  const [name, setName] = useState("");

  const handleStart = () => {
    if (name.trim()) {
      onStart(name.trim());
    }
  };

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
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
              className="text-lg rounded-xl"
              data-testid="input-name"
            />
          </div>

          <Button
            onClick={handleStart}
            disabled={!name.trim()}
            className="w-full rounded-2xl text-lg py-6"
            size="lg"
            data-testid="button-start-tutorial"
          >
            Démarrer le tutoriel
          </Button>
        </div>
      </div>
    </div>
  );
}
