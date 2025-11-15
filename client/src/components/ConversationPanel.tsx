import { useEffect, useRef } from "react";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import peterImage from "@assets/Peter Avatar_1763217836125.jpg";
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
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4"
      >
        {messages.map((message, index) => {
          return (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
            >
              {message.role === 'assistant' && (
                <div className="flex gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[80%]">
                  <img
                    src={peterImage}
                    alt="Peter"
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                  />
                  <div className="bg-card/90 backdrop-blur-sm rounded-2xl rounded-tl-none px-3 sm:px-4 py-2 sm:py-3 shadow-lg">
                    <p className="text-xs sm:text-sm text-left">
                      {message.content}
                    </p>
                  </div>
                </div>
              )}
              {message.role === 'user' && (
                <div className="bg-primary/90 backdrop-blur-sm rounded-2xl rounded-tr-none px-3 sm:px-4 py-2 sm:py-3 shadow-lg max-w-[85%] sm:max-w-[80%]">
                  <p className="text-xs sm:text-sm text-primary-foreground text-right">{message.content}</p>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de transcription temporaire - ENLEVÉE */}

      {/* Zone d'input et contrôles */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
        {/* Indicateur d'état */}
        {state === 'recording' && (
          <div className="flex justify-center gap-1 items-end h-6 sm:h-8 mb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-1 sm:w-1.5 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 15 + 8}px`,
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
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full animate-bounce-subtle"
            />
          </div>
        )}

        {state === 'processing' && (
          <div className="flex justify-center mb-2">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Bulle d'input utilisateur avec bouton micro intégré */}
        <div className="flex gap-1.5 sm:gap-2 items-end">
          {fallbackMode ? (
            <>
              <Input
                value={textInput}
                onChange={(e) => onTextInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Tapez votre message..."
                className="flex-1 rounded-2xl text-sm sm:text-base bg-card/90 backdrop-blur-sm"
                data-testid="input-text-message"
              />
              <Button
                onClick={handleSendText}
                disabled={!textInput.trim() || state === 'processing'}
                size="icon"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0"
                data-testid="button-send-text"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </>
          ) : (
            <>
              <div className="flex-1 bg-card/90 backdrop-blur-sm rounded-2xl px-3 sm:px-4 py-2 sm:py-3 min-h-[44px] sm:min-h-[48px] flex items-center">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {state === 'idle' && 'Appuyez sur le micro pour parler'}
                  {state === 'recording' && 'Enregistrement en cours...'}
                  {state === 'processing' && 'Traitement...'}
                  {state === 'playing' && (
                    <span>
                      Peter vous répond... <span className="text-orange-500 font-medium hidden sm:inline">Appuyez sur le micro pour l'interrompre</span>
                      <span className="text-orange-500 font-medium sm:hidden">Touchez le micro pour interrompre</span>
                    </span>
                  )}
                  {state === 'error' && 'Erreur - Réessayez'}
                </p>
              </div>

              {/* Bouton micro - TOUJOURS ACTIF, même pendant que Peter parle */}
              {(state === 'idle' || state === 'playing') && (
                <div className="relative flex-shrink-0">
                  <Button
                    onClick={onStartRecording}
                    size="icon"
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl touch-manipulation ${
                      state === 'playing'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : ''
                    }`}
                    data-testid="button-mic"
                  >
                    <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                  {state === 'idle' && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-pulse-ring pointer-events-none" />
                  )}
                  {state === 'playing' && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-orange-400 animate-pulse pointer-events-none" />
                  )}
                </div>
              )}

              {state === 'recording' && (
                <Button
                  onClick={onStopRecording}
                  size="icon"
                  variant="destructive"
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex-shrink-0 touch-manipulation"
                  data-testid="button-stop-recording"
                >
                  <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              )}

              {state === 'processing' && (
                <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
