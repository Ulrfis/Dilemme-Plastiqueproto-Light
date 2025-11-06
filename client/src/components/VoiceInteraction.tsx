import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import peterImage from "@assets/generated_images/Peter_AI_mascot_character_ddfcb150.png";
import type { AudioState } from "@/hooks/useVoiceInteraction";

interface VoiceInteractionProps {
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSendText: (text: string) => void;
  onRecoverFromError?: () => void;
  state: AudioState;
  transcription?: string;
  fallbackMode?: boolean;
}

export default function VoiceInteraction({ 
  onStartRecording,
  onStopRecording,
  onSendText,
  onRecoverFromError,
  state, 
  transcription = '',
  fallbackMode = false 
}: VoiceInteractionProps) {
  const [textInput, setTextInput] = useState("");

  const handleSendText = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  if (fallbackMode) {
    return (
      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-card-border rounded-t-3xl shadow-2xl px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Mode texte activé
          </p>
          <div className="flex gap-2">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Tapez votre message..."
              className="rounded-xl text-base"
              data-testid="input-text-message"
            />
            <Button
              onClick={handleSendText}
              disabled={!textInput.trim() || state === 'processing'}
              size="icon"
              className="w-12 h-12 rounded-xl"
              data-testid="button-send-text"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 inset-x-0 bg-card border-t border-card-border rounded-t-3xl shadow-2xl px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {transcription && (
          <div className="bg-muted rounded-xl p-4 animate-slide-up">
            <p className="text-sm text-muted-foreground mb-1">Vous avez dit:</p>
            <p className="text-base" data-testid="text-transcription">{transcription}</p>
          </div>
        )}

        <div className="flex flex-col items-center space-y-4">
          {state === 'recording' && (
            <div className="flex gap-1 items-end h-12 mb-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-2 bg-primary rounded-full animate-pulse"
                  style={{
                    height: `${Math.random() * 40 + 20}px`,
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </div>
          )}

          {state === 'playing' && (
            <img 
              src={peterImage} 
              alt="Peter" 
              className="w-16 h-16 rounded-full animate-bounce-subtle"
              data-testid="img-peter-avatar"
            />
          )}

          {state === 'processing' && (
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          )}

          {state === 'idle' && (
            <div className="relative">
              <Button
                onClick={onStartRecording}
                size="icon"
                className="w-20 h-20 rounded-full"
                data-testid="button-mic"
              >
                <Mic className="w-8 h-8" />
              </Button>
              <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring" />
            </div>
          )}

          {state === 'recording' && (
            <Button
              onClick={onStopRecording}
              size="icon"
              variant="destructive"
              className="w-12 h-12 rounded-full"
              data-testid="button-stop-recording"
            >
              <Square className="w-5 h-5" />
            </Button>
          )}

          {state === 'error' && (
            <div className="text-center space-y-2">
              <p className="text-sm text-destructive">Erreur audio</p>
              <Button
                onClick={() => {
                  if (onRecoverFromError) onRecoverFromError();
                  onStartRecording();
                }}
                size="sm"
                variant="outline"
                data-testid="button-recover-error"
              >
                Réessayer
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center">
            {state === 'idle' && 'Appuyez pour parler'}
            {state === 'recording' && 'Enregistrement en cours...'}
            {state === 'processing' && 'Traitement...'}
            {state === 'playing' && 'Peter vous répond...'}
            {state === 'error' && 'Une erreur est survenue'}
          </p>
        </div>
      </div>
    </div>
  );
}
