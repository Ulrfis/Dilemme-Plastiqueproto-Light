import { useEffect, useRef } from "react";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import peterImage from "@assets/generated_images/Peter_AI_mascot_character_ddfcb150.png";
import type { AudioState } from "@/hooks/useVoiceInteraction";
import { useTypewriter } from "@/hooks/useTypewriter";

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

  // Récupérer le dernier message de l'assistant pour l'effet typewriter
  const lastAssistantMessage = messages.length > 0 && messages[messages.length - 1].role === 'assistant'
    ? messages[messages.length - 1]
    : null;

  // Effet typewriter pour le dernier message de Peter pendant qu'il parle
  const { displayedText: typedText } = useTypewriter({
    text: lastAssistantMessage?.content || '',
    speed: 25,
    enabled: state === 'playing',
  });

  // Auto-scroll pour garder les deux derniers échanges visibles
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typedText]);

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
        {messages.map((message, index) => {
          // Déterminer si c'est le dernier message de l'assistant
          const isLastAssistantMessage =
            message.role === 'assistant' &&
            index === messages.length - 1 &&
            state === 'playing';

          // Utiliser le texte tapé pour le dernier message si en train de jouer
          const displayContent = isLastAssistantMessage ? typedText : message.content;

          return (
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
                    <p className="text-sm text-left">
                      {displayContent}
                      {isLastAssistantMessage && <span className="animate-pulse">▌</span>}
                    </p>
                  </div>
                </div>
              )}
              {message.role === 'user' && (
                <div className="bg-primary/90 backdrop-blur-sm rounded-2xl rounded-tr-none px-4 py-3 shadow-lg max-w-[80%]">
                  <p className="text-sm text-primary-foreground text-right">{message.content}</p>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de transcription temporaire - ENLEVÉE */}

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
                  {state === 'playing' && (
                    <span>
                      Peter vous répond... <span className="text-orange-500 font-medium">Appuyez sur le micro pour l'interrompre</span>
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
                    className={`w-14 h-14 rounded-2xl ${
                      state === 'playing'
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : ''
                    }`}
                    data-testid="button-mic"
                  >
                    <Mic className="w-6 h-6" />
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
                  className="w-12 h-12 rounded-2xl flex-shrink-0"
                  data-testid="button-stop-recording"
                >
                  <Square className="w-5 h-5" />
                </Button>
              )}

              {state === 'processing' && (
                <div className="w-14 h-14 flex-shrink-0" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
