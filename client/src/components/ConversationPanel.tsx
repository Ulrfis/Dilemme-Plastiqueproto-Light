import { useEffect, useRef } from "react";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import peterImage from "@assets/generated_images/Peter_AI_mascot_character_ddfcb150.png";
import type { AudioState } from "@/hooks/useVoiceInteraction";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ConversationPanelProps {
  messages: Message[];
  userName: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSendText: (text: string) => void;
  state: AudioState;
  transcription?: string;
  fallbackMode?: boolean;
  textInput: string;
  onTextInputChange: (text: string) => void;
}

export default function ConversationPanel({
  messages,
  userName,
  onStartRecording,
  onStopRecording,
  onSendText,
  state,
  transcription = '',
  fallbackMode = false,
  textInput,
  onTextInputChange,
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll pour garder les deux derniers échanges visibles
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendText = () => {
    if (textInput.trim()) {
      onSendText(textInput.trim());
      onTextInputChange("");
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-transparent to-background/95 backdrop-blur-sm">
      {/* Zone de messages scrollable */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
          >
            {message.role === 'assistant' && (
              <div className="flex gap-2 max-w-[80%]">
                <img
                  src={peterImage}
                  alt="Peter"
                  className="w-10 h-10 rounded-full flex-shrink-0"
                />
                <div className="bg-card/90 backdrop-blur-sm rounded-2xl rounded-tl-none px-4 py-3 shadow-lg">
                  <p className="text-sm text-left">{message.content}</p>
                </div>
              </div>
            )}
            {message.role === 'user' && (
              <div className="bg-primary/90 backdrop-blur-sm rounded-2xl rounded-tr-none px-4 py-3 shadow-lg max-w-[80%]">
                <p className="text-sm text-primary-foreground text-right">{message.content}</p>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de transcription temporaire */}
      {transcription && (
        <div className="px-4 pb-2">
          <div className="bg-muted/80 backdrop-blur-sm rounded-xl p-3 animate-slide-up">
            <p className="text-xs text-muted-foreground mb-1">Vous avez dit:</p>
            <p className="text-sm" data-testid="text-transcription">{transcription}</p>
          </div>
        </div>
      )}

      {/* Zone d'input et contrôles */}
      <div className="px-4 pb-4 pt-2">
        {/* Indicateur d'état */}
        {state === 'recording' && (
          <div className="flex justify-center gap-1 items-end h-8 mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-1.5 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 20 + 10}px`,
                  animationDelay: `${i * 0.1}s`
                }}
              />
            ))}
          </div>
        )}

        {state === 'playing' && (
          <div className="flex justify-center mb-2">
            <img
              src={peterImage}
              alt="Peter parle"
              className="w-12 h-12 rounded-full animate-bounce-subtle"
            />
          </div>
        )}

        {state === 'processing' && (
          <div className="flex justify-center mb-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Bulle d'input utilisateur avec bouton micro intégré */}
        <div className="flex gap-2 items-end">
          {fallbackMode ? (
            <>
              <Input
                value={textInput}
                onChange={(e) => onTextInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Tapez votre message..."
                className="flex-1 rounded-2xl text-base bg-card/90 backdrop-blur-sm"
                data-testid="input-text-message"
              />
              <Button
                onClick={handleSendText}
                disabled={!textInput.trim() || state === 'processing'}
                size="icon"
                className="w-12 h-12 rounded-2xl flex-shrink-0"
                data-testid="button-send-text"
              >
                <Send className="w-5 h-5" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1 bg-card/90 backdrop-blur-sm rounded-2xl px-4 py-3 min-h-[48px] flex items-center">
                <p className="text-sm text-muted-foreground">
                  {state === 'idle' && 'Appuyez sur le micro pour parler'}
                  {state === 'recording' && 'Enregistrement en cours...'}
                  {state === 'processing' && 'Traitement...'}
                  {state === 'playing' && 'Peter vous répond...'}
                  {state === 'error' && 'Erreur - Réessayez'}
                </p>
              </div>

              {state === 'idle' && (
                <div className="relative flex-shrink-0">
                  <Button
                    onClick={onStartRecording}
                    size="icon"
                    className="w-14 h-14 rounded-2xl"
                    data-testid="button-mic"
                  >
                    <Mic className="w-6 h-6" />
                  </Button>
                  <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-pulse-ring pointer-events-none" />
                </div>
              )}

              {state === 'recording' && (
                <Button
                  onClick={onStopRecording}
                  size="icon"
                  variant="destructive"
                  className="w-12 h-12 rounded-2xl flex-shrink-0"
                  data-testid="button-stop-recording"
                >
                  <Square className="w-5 h-5" />
                </Button>
              )}

              {(state === 'processing' || state === 'playing') && (
                <div className="w-14 h-14 flex-shrink-0" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
