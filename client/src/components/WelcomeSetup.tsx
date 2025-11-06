import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mic, MicOff, Volume2, VolumeX, CheckCircle, AlertCircle } from "lucide-react";

interface WelcomeSetupProps {
  onStart: (name: string) => void;
}

export default function WelcomeSetup({ onStart }: WelcomeSetupProps) {
  const [name, setName] = useState("");
  const [micStatus, setMicStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'available' | 'unavailable'>('idle');
  const [isTestingAudio, setIsTestingAudio] = useState(false);

  useEffect(() => {
    checkMicrophonePermission();
    checkTTSAvailability();
  }, []);

  const checkMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicStatus('granted');
    } catch (error) {
      setMicStatus('denied');
    }
  };

  const checkTTSAvailability = () => {
    if ('speechSynthesis' in window) {
      setTtsStatus('available');
    } else {
      setTtsStatus('unavailable');
    }
  };

  const testAudio = () => {
    setIsTestingAudio(true);
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance("Test audio");
      utterance.lang = 'fr-FR';
      utterance.onend = () => setIsTestingAudio(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setIsTestingAudio(false), 1000);
    }
  };

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

          <div className="space-y-4">
            <h3 className="text-sm font-medium">Statut audio</h3>
            
            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-card-border">
              {micStatus === 'granted' ? (
                <Mic className="w-5 h-5 text-primary" />
              ) : (
                <MicOff className="w-5 h-5 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Microphone</p>
                <p className="text-xs text-muted-foreground">
                  {micStatus === 'granted' && 'Autorisé'}
                  {micStatus === 'denied' && 'Non autorisé'}
                  {micStatus === 'idle' && 'Vérification...'}
                </p>
              </div>
              {micStatus === 'granted' ? (
                <CheckCircle className="w-5 h-5 text-primary" />
              ) : micStatus === 'denied' ? (
                <AlertCircle className="w-5 h-5 text-destructive" />
              ) : null}
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-card-border">
              {ttsStatus === 'available' ? (
                <Volume2 className="w-5 h-5 text-primary" />
              ) : (
                <VolumeX className="w-5 h-5 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Synthèse vocale</p>
                <p className="text-xs text-muted-foreground">
                  {ttsStatus === 'available' && 'Disponible'}
                  {ttsStatus === 'unavailable' && 'Non disponible'}
                  {ttsStatus === 'idle' && 'Vérification...'}
                </p>
              </div>
              {ttsStatus === 'available' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={testAudio}
                  disabled={isTestingAudio}
                  data-testid="button-test-audio"
                >
                  {isTestingAudio ? 'Test...' : 'Tester'}
                </Button>
              )}
            </div>
          </div>

          {(micStatus === 'denied' || ttsStatus === 'unavailable') && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Mode texte activé. {micStatus === 'denied' && 'Microphone non autorisé. '}
                {ttsStatus === 'unavailable' && 'Synthèse vocale non disponible.'}
              </AlertDescription>
            </Alert>
          )}

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
