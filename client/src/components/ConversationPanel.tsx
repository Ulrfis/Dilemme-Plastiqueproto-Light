import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { Mic, Square, Send, Loader2, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import peterImage from "@assets/Peter_Avatar_white_1777753861103.jpeg";
import type { AudioState } from "@/hooks/useVoiceInteraction";

interface Message {
  id?: string;
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
  exchangeCount: number;
  maxExchanges: number;
  audioLevel?: number;
  liveTranscript?: string;
  isThinking?: boolean;
}

const THINKING_PHRASES = [
  "Peter réfléchit",
  "Peter observe l'image",
  "Peter analyse les indices",
  "Peter scrute les détails",
  "Peter pèse ses mots",
  "Peter cherche au fond du sac plastique",
  "Peter trie les microplastiques",
  "Peter remonte la chaîne du plastique",
  "Peter écoute ce que disent les déchets",
  "Peter compare les pièces du puzzle",
  "Peter regarde sous l'emballage",
  "Peter relie les indices",
];

const hexStyle: React.CSSProperties = {
  clipPath: 'polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)',
};

function ThinkingBubble() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const orderedPhrases = useMemo(() => {
    const rest = THINKING_PHRASES.slice(1);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return [THINKING_PHRASES[0], ...rest];
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % orderedPhrases.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [orderedPhrases.length]);

  const phrase = orderedPhrases[phraseIndex];

  return (
    <div
      className="flex justify-start animate-slide-up motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-label={`${phrase}…`}
      data-testid="bubble-peter-thinking"
    >
      <div className="flex gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[80%]">
        <img
          src={peterImage}
          alt=""
          loading="lazy"
          decoding="async"
          style={hexStyle}
          className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 animate-bounce-subtle motion-reduce:animate-none"
        />
        <div className="bg-card/40 backdrop-blur-sm rounded-xl rounded-tl-none px-3 sm:px-4 py-2 sm:py-3 border border-dashed border-card-border min-h-[44px] flex items-center">
          <p className="text-xs sm:text-sm italic text-muted-foreground text-left flex items-center gap-1">
            <span
              key={phrase}
              className="animate-thinking-fade motion-reduce:animate-none inline-block"
              data-testid="text-thinking-phrase"
            >
              {phrase}
            </span>
            <span className="inline-flex items-end gap-0.5 ml-0.5" aria-hidden="true">
              <span
                className="w-1 h-1 rounded-full bg-muted-foreground/70 animate-thinking-dot motion-reduce:animate-none"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1 h-1 rounded-full bg-muted-foreground/70 animate-thinking-dot motion-reduce:animate-none"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="w-1 h-1 rounded-full bg-muted-foreground/70 animate-thinking-dot motion-reduce:animate-none"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
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
  exchangeCount,
  maxExchanges,
  audioLevel = 0,
  liveTranscript = '',
  isThinking = false,
}: ConversationPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);

  useEffect(() => {
    if (messagesEndRef.current && isNearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking, isNearBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsNearBottom(distanceToBottom < 60);
    };
    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSendText = useCallback(() => {
    const inputValue = inputRef.current?.value || textInput;
    if (inputValue.trim()) {
      onSendText(inputValue.trim());
      onTextInputChange("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [textInput, onSendText, onTextInputChange]);

  const isButtonDisabled = !textInput.trim() || state === 'processing';

  const statusZoneClasses = `flex-1 rounded-xl px-3 sm:px-4 py-2 sm:py-3 min-h-[44px] sm:min-h-[48px] flex items-center justify-between transition-colors duration-200 ${
    state === 'recording'
      ? 'bg-red-500/10 border border-red-400/30'
      : state === 'processing'
      ? 'bg-primary/10 border border-primary/30'
      : state === 'playing'
      ? 'bg-orange-500/10 border border-orange-400/30'
      : 'bg-card/90 backdrop-blur-sm'
  }`;

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-transparent via-background/60 to-background/95 backdrop-blur-sm">
      {/* Zone de messages scrollable */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4"
      >
        {messages.map((message, index) => (
          <div
            key={message.id || index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
          >
            {message.role === 'assistant' && (
              <div className="flex gap-1.5 sm:gap-2 max-w-[85%] sm:max-w-[80%]">
                <img
                  src={peterImage}
                  alt="Peter"
                  loading="lazy"
                  decoding="async"
                  style={hexStyle}
                  className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 mt-1"
                />
                <div className="bg-card/90 backdrop-blur-sm rounded-xl rounded-tl-none px-3 sm:px-4 py-2 sm:py-3 border border-card-border/40 min-h-[44px]">
                  <p className="text-xs sm:text-sm text-left">{message.content}</p>
                </div>
              </div>
            )}
            {message.role === 'user' && (
              <div className="bg-primary/90 backdrop-blur-sm rounded-xl rounded-tr-none px-3 sm:px-4 py-2 sm:py-3 max-w-[85%] sm:max-w-[80%]">
                <p className="text-xs sm:text-sm text-primary-foreground text-right">{message.content}</p>
              </div>
            )}
          </div>
        ))}
        {isThinking && <ThinkingBubble />}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone de contrôles */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2">
        {/* Waveform pendant l'enregistrement */}
        {state === 'recording' && (() => {
          const amplified = Math.min(1, Math.sqrt(Math.max(audioLevel, 0)) * 2.2);
          const effectiveLevel = Math.max(amplified, 0.12);
          const shape = [0.35, 0.55, 0.78, 0.92, 1, 0.92, 0.78, 0.55, 0.35];
          const baseHeight = 8;
          const maxAdditional = 56;
          return (
            <div
              className="flex justify-center gap-1 sm:gap-1.5 items-center h-16 sm:h-20 mb-2"
              data-testid="waveform-recording"
            >
              {shape.map((s, i) => {
                const height = baseHeight + effectiveLevel * maxAdditional * s;
                const opacity = 0.7 + effectiveLevel * 0.3;
                return (
                  <div
                    key={i}
                    className="w-1.5 sm:w-2 bg-primary rounded-full transition-[height] duration-75 ease-out"
                    style={{ height: `${height}px`, opacity }}
                    data-testid={`waveform-bar-${i}`}
                  />
                );
              })}
            </div>
          );
        })()}

        {/* Ligne d'input */}
        <div className="flex gap-1.5 sm:gap-2 items-end">
          {fallbackMode ? (
            <>
              <Input
                ref={inputRef}
                value={textInput}
                onChange={(e) => onTextInputChange(e.target.value)}
                onInput={(e) => {
                  const target = e.target as HTMLInputElement;
                  if (target.value !== textInput) onTextInputChange(target.value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                placeholder="Tapez votre message..."
                className="flex-1 rounded-xl text-sm sm:text-base bg-card/90 backdrop-blur-sm"
                data-testid="input-text-message"
              />
              <Button
                onClick={handleSendText}
                disabled={isButtonDisabled}
                size="icon"
                className="w-14 h-14 rounded-full flex-shrink-0 shadow-lg"
                data-testid="button-send-text"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </>
          ) : (
            <>
              {/* Bouton clavier */}
              <Button
                onClick={() => setShowTextInput(!showTextInput)}
                size="icon"
                variant={showTextInput ? "secondary" : "outline"}
                disabled={state === 'recording' || state === 'processing'}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex-shrink-0 touch-manipulation"
                data-testid="button-toggle-text"
              >
                <Keyboard className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>

              {/* Zone de statut / input texte */}
              {showTextInput && (state === 'idle' || state === 'playing') ? (
                <>
                  <Input
                    ref={inputRef}
                    value={textInput}
                    onChange={(e) => onTextInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    placeholder="Tapez votre message..."
                    className="flex-1 rounded-xl text-sm sm:text-base bg-card/90 backdrop-blur-sm"
                    autoFocus
                    data-testid="input-text-message"
                  />
                  <Button
                    onClick={handleSendText}
                    disabled={isButtonDisabled}
                    size="icon"
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex-shrink-0 shadow-lg"
                    data-testid="button-send-text"
                  >
                    <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </>
              ) : (
                <div className={statusZoneClasses} data-testid="text-input-status">
                  {/* Contenu gauche : transcription ou statut */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    {state === 'recording' ? (
                      liveTranscript ? (
                        <p
                          className="text-sm sm:text-base text-foreground leading-snug max-h-16 sm:max-h-20 overflow-y-auto break-words pr-1"
                          data-testid="text-live-transcript"
                        >
                          {liveTranscript}
                          <span className="inline-block w-0.5 h-3 sm:h-4 bg-red-500 ml-0.5 align-middle animate-pulse" />
                        </p>
                      ) : (
                        <p className="text-xs sm:text-sm text-muted-foreground italic">À l'écoute…</p>
                      )
                    ) : (
                      <div className="flex items-center gap-2 w-full min-w-0">
                        {/* Ondes sonores Peter parle */}
                        {state === 'playing' && (
                          <span className="inline-flex items-end gap-0.5 flex-shrink-0" aria-hidden="true">
                            {[0, 150, 300].map((delay, i) => (
                              <span
                                key={i}
                                className="w-0.5 sm:w-[3px] rounded-full bg-orange-500 animate-thinking-dot motion-reduce:animate-none"
                                style={{ height: i === 1 ? '14px' : '9px', animationDelay: `${delay}ms` }}
                              />
                            ))}
                          </span>
                        )}
                        {/* Spinner processing */}
                        {state === 'processing' && (
                          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                        )}
                        <p className={`text-xs sm:text-sm overflow-hidden text-ellipsis whitespace-nowrap flex-1 ${
                          state === 'playing' ? 'text-orange-500 font-medium' : 'text-muted-foreground'
                        }`}>
                          {state === 'idle' && (showTextInput ? 'Écrivez ou parlez' : 'Parlez ou tapez')}
                          {state === 'processing' && (
                            liveTranscript
                              ? <span className="text-foreground not-italic" data-testid="text-pending-transcript">{liveTranscript}</span>
                              : 'Traitement...'
                          )}
                          {state === 'playing' && 'Peter parle…'}
                          {state === 'error' && 'Erreur'}
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Compteur HUD aligné droite */}
                  <span
                    className="text-[10px] sm:text-xs text-muted-foreground/50 font-mono flex-shrink-0 ml-2 tabular-nums"
                    data-testid="badge-exchange-counter-conversation"
                  >
                    {exchangeCount}/{maxExchanges}
                  </span>
                </div>
              )}

              {/* Bouton micro */}
              {state === 'recording' ? (
                <Button
                  onClick={onStopRecording}
                  size="icon"
                  variant="destructive"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex-shrink-0 touch-manipulation shadow-lg"
                  data-testid="button-stop-recording"
                >
                  <Square className="w-5 h-5 sm:w-6 sm:h-6" />
                </Button>
              ) : state === 'processing' ? (
                <div className="w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="relative flex-shrink-0">
                  <Button
                    onClick={onStartRecording}
                    size="icon"
                    className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full touch-manipulation shadow-lg ${
                      state === 'playing' ? 'bg-orange-500 hover:bg-orange-600' : ''
                    }`}
                    data-testid="button-mic"
                  >
                    <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                  </Button>
                  {state === 'idle' && !showTextInput && (
                    <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-pulse-ring pointer-events-none" />
                  )}
                  {state === 'playing' && (
                    <div className="absolute inset-0 rounded-full border-2 border-orange-400 animate-pulse pointer-events-none" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
