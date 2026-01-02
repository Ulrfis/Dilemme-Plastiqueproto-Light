import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, Square, Send, Loader2, Keyboard } from "lucide-react";
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
  const [showTextInput, setShowTextInput] = useState(false);

  const handleSendText = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      setTextInput("");
    }
  };

  // Mode texte uniquement (fallback)
  if (fallbackMode) {
    return (
      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-card-border rounded-t-3xl shadow-2xl px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto space-y-3">
          <p className="text-xs sm:text-sm text-muted-foreground text-center">
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
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0"
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
    <div className="fixed bottom-0 inset-x-0 bg-card border-t border-card-border rounded-t-3xl shadow-2xl px-4 sm:px-6 py-4 sm:py-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {transcription && (
          <div className="bg-muted rounded-xl p-3 sm:p-4 animate-slide-up">
            <p className="text-xs sm:text-sm text-muted-foreground mb-1">Vous avez dit:</p>
            <p className="text-sm sm:text-base" data-testid="text-transcription">{transcription}</p>
          </div>
        )}

        {/* Zone d'input texte (visible si showTextInput est true) */}
        {showTextInput && (
          <div className="flex gap-2 animate-slide-up">
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Tapez votre message..."
              className="rounded-xl text-base"
              autoFocus
              data-testid="input-text-message"
            />
            <Button
              onClick={handleSendText}
              disabled={!textInput.trim() || state === 'processing'}
              size="icon"
              className="w-11 h-11 rounded-xl flex-shrink-0"
              data-testid="button-send-text"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        )}

        <div className="flex flex-col items-center space-y-3">
          {state === 'recording' && (
            <div className="flex gap-1 items-end h-10 mb-2">
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
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full animate-bounce-subtle"
              data-testid="img-peter-avatar"
            />
          )}

          {state === 'processing' && (
            <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin" />
          )}

          {/* Boutons d'action : micro + clavier - TOUJOURS VISIBLES */}
          <div className="flex items-center gap-4">
            {/* Bouton clavier pour basculer l'input texte - toujours visible, désactivé si pas idle */}
            <Button
              onClick={() => setShowTextInput(!showTextInput)}
              size="icon"
              variant={showTextInput ? "secondary" : "outline"}
              disabled={state === 'recording' || state === 'processing'}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full"
              data-testid="button-toggle-text"
            >
              <Keyboard className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>

            {/* Bouton microphone ou stop selon l'état */}
            {state === 'recording' ? (
              <Button
                onClick={onStopRecording}
                size="icon"
                variant="destructive"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full"
                data-testid="button-stop-recording"
              >
                <Square className="w-6 h-6 sm:w-7 sm:h-7" />
              </Button>
            ) : state === 'processing' ? (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              <div className="relative">
                <Button
                  onClick={() => {
                    console.log('[VoiceInteraction] Mic button clicked!');
                    onStartRecording();
                  }}
                  size="icon"
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${
                    state === 'playing' ? 'bg-orange-500 hover:bg-orange-600' : ''
                  }`}
                  data-testid="button-mic"
                >
                  <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
                </Button>
                {state === 'idle' && !showTextInput && (
                  <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring pointer-events-none" />
                )}
              </div>
            )}

            {/* Placeholder pour équilibrer visuellement */}
            <div className="w-12 h-12 sm:w-14 sm:h-14" />
          </div>

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

          <p className="text-xs sm:text-sm text-muted-foreground text-center">
            {state === 'idle' && (showTextInput ? 'Écrivez ou parlez' : 'Appuyez pour parler')}
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
