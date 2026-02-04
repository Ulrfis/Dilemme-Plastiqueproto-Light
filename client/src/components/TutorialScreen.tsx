import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2 } from "lucide-react";
import tutorialImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";
import ConversationPanel from "./ConversationPanel";
import SuccessFeedback from "./SuccessFeedback";
import ZoomableImage from "./ZoomableImage";
import InfoModal from "./InfoModal";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { useAudioQueue } from "@/hooks/useAudioQueue";
import { sendChatMessage, textToSpeech, sendChatMessageStreaming, textToSpeechStreaming } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { captureEvent } from "@/App";
import { useSessionFlow } from "@/contexts/SessionFlowContext";

interface Message {
  id?: string;
  role: 'assistant' | 'user';
  content: string;
}

interface TutorialScreenProps {
  sessionId: string;
  userName: string;
  onComplete: (score: number, foundClues: string[]) => void;
}

export default function TutorialScreen({ sessionId, userName, onComplete }: TutorialScreenProps) {
  const sessionFlow = useSessionFlow();

  const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const withIds = (messages: Message[]) =>
    messages.map(m => m.id ? m : { ...m, id: generateId() });

  const makeMessage = (role: Message['role'], content: string, id?: string): Message => ({
    id: id || generateId(),
    role,
    content,
  });

  const [foundClues, setFoundCluesLocal] = useState<string[]>(() => sessionFlow.foundClues);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newClues, setNewClues] = useState<string[]>([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [messages, setMessagesLocal] = useState<Message[]>(() => withIds(sessionFlow.messages));
  const [textInput, setTextInput] = useState('');
  const [audioUnlocked, setAudioUnlockedLocal] = useState(() => sessionFlow.audioUnlocked);
  const [exchangeCount, setExchangeCountLocal] = useState(() => sessionFlow.exchangeCount);
  const [conversationEnded, setConversationEndedLocal] = useState(() => sessionFlow.conversationEnded);
  const [welcomeMessage] = useState(`Bienvenue ${userName} dans cette courte expérience. Il faut que tu trouves 6 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé. Tu as maximum 8 échanges pour y parvenir !`);
  
  const setFoundClues = (clues: string[]) => {
    setFoundCluesLocal(clues);
    sessionFlow.setFoundClues(clues);
  };
  
  const setMessages = (messagesOrFn: Message[] | ((prev: Message[]) => Message[])) => {
    setMessagesLocal(prev => {
      const next = typeof messagesOrFn === 'function' ? messagesOrFn(prev) : messagesOrFn;
      const normalized = withIds(next);
      sessionFlow.setMessages(normalized);
      return normalized;
    });
  };
  
  const setAudioUnlocked = (unlocked: boolean) => {
    setAudioUnlockedLocal(unlocked);
    sessionFlow.setAudioUnlocked(unlocked);
  };
  
  const setExchangeCount = (countOrFn: number | ((prev: number) => number)) => {
    setExchangeCountLocal(prev => {
      const newCount = typeof countOrFn === 'function' ? countOrFn(prev) : countOrFn;
      sessionFlow.setExchangeCount(newCount);
      return newCount;
    });
  };
  
  const setConversationEnded = (ended: boolean) => {
    setConversationEndedLocal(ended);
    sessionFlow.setConversationEnded(ended);
  };
  
  const MAX_EXCHANGES = 8;
  const TOTAL_CLUES = 6;

  // Ref pour s'assurer que le message de bienvenue ne joue qu'une seule fois
  const hasPlayedWelcome = useRef(false);

  const { toast } = useToast();

  // MOBILE FIX: Ajouter un état local pour forcer le retour à idle en cas de blocage
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // PHASE 2 OPTIMIZATION: Enable streaming by default for better latency
  const useStreaming = useRef(true); // Set to false to use old non-streaming pipeline

  const {
    audioState,
    transcription,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    checkMicrophonePermission,
    checkMediaRecorderSupport,
    recoverFromError,
    reset,
    initAudio,
  } = useVoiceInteraction({
    // Notifier quand l'audio commence pour tracking
    onAudioStart: () => {
      console.log('[TutorialScreen] Audio playback started');
      setIsAudioPlaying(true);
    },
    // Notifier quand l'audio s'arrête pour cleanup
    onAudioStop: () => {
      console.log('[TutorialScreen] Audio playback stopped');
      setIsAudioPlaying(false);
    },
  });

  // PHASE 2 OPTIMIZATION: Audio queue for streaming sentence-by-sentence playback
  const audioQueue = useAudioQueue({
    playAudio,
    onQueueEmpty: () => {
      console.log('[TutorialScreen] Audio queue empty');
      setIsAudioPlaying(false);
    },
    onPlaybackStart: () => {
      console.log('[TutorialScreen] Audio queue playback started');
      setIsAudioPlaying(true);
    },
  });

  // Vérifier si l'utilisateur revient avec une conversation existante
  const isReturningUser = messages.length > 0;

  // Fonction pour déverrouiller l'audio et passer à l'écran conversationnel
  // Désormais déclenchée automatiquement à l'arrivée sur l'écran (l'UX “Prêt à commencer ?” est retirée)
  const handleUnlockAudio = async () => {
    console.log('[TutorialScreen] Auto unlocking audio - entering conversation');

    initAudio();

    if (!isReturningUser && !hasPlayedWelcome.current) {
      setMessages([makeMessage('assistant', welcomeMessage)]);
      hasPlayedWelcome.current = true;
      
      try {
        // Pré-chauffage TTS: lancer un call ultra court en arrière-plan pour remplir les caches CDN
        textToSpeechStreaming("...").catch(() => {});

        const audioBlob = await textToSpeechWithRetry(welcomeMessage);
        await playAudio(audioBlob);
      } catch (error) {
        console.error('[TutorialScreen] Failed to play welcome audio:', error);
        toast({
          title: "Mode texte activé",
          description: "Peter s'affiche en texte uniquement.",
          variant: "default",
        });
      }
    } else {
      hasPlayedWelcome.current = true;
    }

    setAudioUnlocked(true);
  };

  // MOBILE FIX: Détecter automatiquement si MediaRecorder est supporté
  // et activer le fallback mode si nécessaire (Safari iOS ancien)
  useEffect(() => {
    console.log('[TutorialScreen] Checking MediaRecorder support...');
    const isSupported = checkMediaRecorderSupport();

    if (!isSupported) {
      console.warn('[TutorialScreen] MediaRecorder NOT supported - activating text fallback mode');
      setFallbackMode(true);
      toast({
        title: "Mode texte activé",
        description: "Votre navigateur ne supporte pas l'enregistrement vocal. Utilisez le mode texte pour discuter avec Peter.",
        variant: "default",
        duration: 5000,
      });
    } else {
      console.log('[TutorialScreen] MediaRecorder is supported - voice mode available');
    }
  }, [checkMediaRecorderSupport, toast]);

  // Note: Le message de bienvenue est maintenant joué directement dans handleUnlockAudio
  // pour garantir qu'il fonctionne sur mobile (dans le contexte du clic utilisateur)

  // Fonction helper pour appeler le TTS avec retry automatique
  const textToSpeechWithRetry = async (text: string, maxRetries = 2): Promise<Blob> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[TutorialScreen] TTS attempt ${attempt + 1}/${maxRetries + 1}`);
        const audioBlob = await textToSpeech(text);
        console.log('[TutorialScreen] TTS successful');
        return audioBlob;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[TutorialScreen] TTS attempt ${attempt + 1} failed:`, error);
        
        // Petit délai avant retry sauf au dernier essai
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Tous les essais ont échoué
    throw lastError || new Error('TTS failed after retries');
  };

  // Fonction pour interrompre Peter et permettre à l'utilisateur de parler
  const handleInterruptPeter = () => {
    console.log('[TutorialScreen] User wants to interrupt Peter');

    // PHASE 2: Clear audio queue for streaming
    audioQueue.clear();

    // Arrêter immédiatement la lecture audio de Peter
    // handleAudioStop sera automatiquement appelé et gérera l'affichage du message
    stopAudio();

    console.log('[TutorialScreen] Peter interrupted, user can now speak');
  };

  const handleStartRecording = async () => {
    console.log('[TutorialScreen] handleStartRecording called');

    // Si Peter est en train de parler, l'interrompre d'abord
    if (audioState === 'playing') {
      handleInterruptPeter();
    }

    try {
      console.log('[TutorialScreen] Calling startRecording...');
      await startRecording();
      console.log('[TutorialScreen] startRecording completed successfully');
    } catch (error) {
      console.error('[TutorialScreen] Recording start error:', error);

      // Vérifier si c'est une erreur définitive qui nécessite le fallback texte
      const errorMessage = error instanceof Error ? error.message : '';
      const errorName = error instanceof Error ? error.name : '';

      console.log('[TutorialScreen] Error details:', { errorName, errorMessage });

      // Détecter les erreurs définitives:
      // - Permission refusée
      // - Microphone non trouvé (NotFoundError)
      // - Microphone non disponible (NotAllowedError, NotSupportedError)
      const isPermanentError =
        errorMessage.includes('denied') ||
        errorMessage.includes('permission') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('NotFound') ||
        errorName === 'NotFoundError' ||
        errorName === 'NotAllowedError' ||
        errorName === 'NotSupportedError';

      if (isPermanentError) {
        // Basculer en fallbackMode pour les erreurs définitives
        console.log('[TutorialScreen] Permanent error detected - switching to text mode');
        // IMPORTANT: Réinitialiser l'état audio AVANT de passer en mode texte
        // Sinon audioState peut rester bloqué et désactiver le bouton d'envoi
        recoverFromError();
        setFallbackMode(true);
        toast({
          title: "Mode texte activé",
          description: "Microphone non disponible ou permission refusée. Utilisez le mode texte pour discuter avec Peter.",
          variant: "default",
          duration: 6000,
        });
      } else {
        // Erreur temporaire, afficher un message mais garder le mode vocal
        console.log('[TutorialScreen] Temporary error - suggesting retry');
        toast({
          title: "Erreur temporaire",
          description: "Problème d'enregistrement. Veuillez réessayer d'appuyer sur le microphone.",
          variant: "default",
        });
        recoverFromError();
      }
    }
  };

  const handleStopRecording = async () => {
    const text = await stopRecording();
    if (text) {
      await processMessage(text);
    }
  };

  const handleSendText = async (text: string) => {
    await processMessage(text);
  };

  const processMessage = async (userMessage: string) => {
    // SIMPLIFICATION: Retrait du mécanisme de blocage strict qui causait des problèmes sur mobile
    // Si un audio est en cours, on l'interrompt automatiquement au lieu de bloquer l'utilisateur
    if (audioState === 'playing' || audioQueue.isPlaying) {
      console.log('[TutorialScreen] Interrupting Peter automatically to process new message');
      handleInterruptPeter();
    }

    // Si on attend déjà une réponse (processing), ignorer les nouveaux messages
    if (audioState === 'processing') {
      console.log('[TutorialScreen] Already processing a message, ignoring new input');
      toast({
        title: "Traitement en cours",
        description: "Veuillez attendre la réponse de Peter.",
        variant: "default",
      });
      return;
    }

    // Vérifier si la conversation est terminée
    if (conversationEnded) {
      toast({
        title: "Conversation terminée",
        description: "Cliquez sur 'Poursuivre' pour continuer.",
        variant: "default",
      });
      return;
    }

    try {
      // Incrémenter le compteur d'échanges
      const newExchangeCount = exchangeCount + 1;
      setExchangeCount(newExchangeCount);
      
      // Ajouter le message utilisateur
      setMessages(prev => [...prev, makeMessage('user', userMessage)]);

      // PHASE 2 OPTIMIZATION: Use streaming pipeline for better latency
      if (useStreaming.current) {
        console.log('[TutorialScreen] Using STREAMING pipeline');
        await processMessageStreaming(userMessage, newExchangeCount);
      } else {
        console.log('[TutorialScreen] Using NON-STREAMING pipeline (legacy)');
        await processMessageNonStreaming(userMessage);
      }
    } catch (error) {
      console.error('Error processing message:', error);

      // Extract detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorResponse = (error as any)?.response?.data;

      let detailedDescription = errorMessage;
      if (errorResponse) {
        detailedDescription = `${errorResponse.error || errorMessage}`;
        if (errorResponse.details) {
          detailedDescription += `\n\nDétails: ${errorResponse.details}`;
        }
        if (errorResponse.technicalInfo) {
          detailedDescription += `\n\nInfo technique: ${errorResponse.technicalInfo.errorType} - ${errorResponse.technicalInfo.timestamp}`;
        }
      }

      toast({
        title: "Erreur de conversation avec Peter",
        description: detailedDescription,
        variant: "destructive",
      });
    }
  };

  // PHASE 2 OPTIMIZATION: Streaming message processing
  const processMessageStreaming = async (userMessage: string, currentExchange: number) => {
    console.log('[TutorialScreen] Processing message with streaming, exchange:', currentExchange);
    let fullResponse = '';
    const sentencesReceived: string[] = [];

    // Track pending TTS requests to ensure all sentences are played
    const pendingTTSRequests: Promise<void>[] = [];

    // Reset the audio queue's expected index for this new response
    audioQueue.reset();

    try {
      // Send streaming chat message with exchange context
      await sendChatMessageStreaming(sessionId, userMessage, {
        onSentence: async (sentence, index) => {
          console.log('[TutorialScreen] Received sentence #' + index + ':', sentence.substring(0, 50) + '...');
          fullResponse += sentence + ' ';
          sentencesReceived.push(sentence);

          // Update UI with partial response (progressive display)
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              // Update existing message
              return [...prev.slice(0, -1), { ...lastMessage, content: fullResponse.trim() }];
            } else {
              // Add new assistant message
              return [...prev, makeMessage('assistant', fullResponse.trim())];
            }
          });

          // Generate TTS for this sentence immediately (parallel to LLM)
          // Use streaming endpoint for faster generation, but wait for complete audio
          // CRITICAL: Track this promise to ensure all sentences are queued before completion
          const ttsPromise = (async () => {
            const maxRetries = 3;
            let lastError: Error | null = null;
            
            for (let attempt = 0; attempt < maxRetries; attempt++) {
              try {
                console.log('[TutorialScreen] Generating TTS for sentence #' + index + ' (attempt ' + (attempt + 1) + '/' + maxRetries + ')');

                // textToSpeechStreaming uses the faster streaming endpoint
                // but returns the complete audio blob to avoid playback cuts
                const audioBlob = await textToSpeechStreaming(sentence);
                
                // Validate the audio blob
                if (!audioBlob || audioBlob.size < 100) {
                  throw new Error('Empty or invalid audio blob received');
                }
                
                console.log('[TutorialScreen] TTS complete for sentence #' + index + ', size:', audioBlob.size);

                // Add complete audio to queue for sequential playback
                audioQueue.enqueue(audioBlob, sentence, index);
                return; // Success - exit the retry loop
              } catch (ttsError) {
                lastError = ttsError instanceof Error ? ttsError : new Error(String(ttsError));
                console.warn('[TutorialScreen] TTS attempt ' + (attempt + 1) + ' failed for sentence #' + index + ':', ttsError);
                
                // Wait before retrying (exponential backoff)
                if (attempt < maxRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
                }
              }
            }
            
            // All retries failed - skip this sentence to unblock the queue
            console.error('[TutorialScreen] TTS failed for sentence #' + index + ' after ' + maxRetries + ' attempts:', lastError);
            audioQueue.skipIndex(index);
          })();

          pendingTTSRequests.push(ttsPromise);
        },

        onComplete: async (finalResponse, newFoundClues, detectedClue) => {
          // CRITICAL: Wait for all TTS requests to complete before processing completion
          // This ensures the last sentence is fully queued for playback
          console.log('[TutorialScreen] Waiting for', pendingTTSRequests.length, 'pending TTS requests to complete...');
          await Promise.all(pendingTTSRequests);
          console.log('[TutorialScreen] All TTS requests completed, processing onComplete');
          console.log('[TutorialScreen] Stream complete, final response length:', finalResponse.length);

          // Vérifier si la réponse est vide ou invalide
          if (!finalResponse || finalResponse.trim().length === 0) {
            console.error('[TutorialScreen] ⚠️ Empty response received from Peter');
            toast({
              title: "Réponse vide",
              description: "Peter n'a pas pu générer de réponse. Veuillez réessayer.",
              variant: "destructive",
            });
            recoverFromError();
            return;
          }

          // Update final message (in case there was additional text at the end)
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              return [...prev.slice(0, -1), { ...lastMessage, content: finalResponse }];
            } else {
              return [...prev, makeMessage('assistant', finalResponse)];
            }
          });

          // Handle clue detection
          const previousClues = foundClues;
          const detectedNewClues = newFoundClues.filter(clue => !previousClues.includes(clue));

          console.log('[TutorialScreen] Clue detection:', {
            previousClues,
            newFoundClues,
            detectedNewClues,
          });

          if (detectedNewClues.length > 0) {
            console.log('[TutorialScreen] New clues detected:', detectedNewClues);
            setFoundClues(newFoundClues);
            setNewClues(detectedNewClues);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
          }
          
          // Vérifier si on a atteint la limite d'échanges (garantir au moins 8 échanges)
          // Note: On ne termine PAS la conversation même si tous les indices sont trouvés
          // L'utilisateur doit pouvoir discuter au moins 8 fois avec Peter
          const maxExchangesReached = currentExchange >= MAX_EXCHANGES;

          if (maxExchangesReached) {
            console.log('[TutorialScreen] Conversation ending: max exchanges reached', { currentExchange, foundClues: newFoundClues.length });
            setConversationEnded(true);
          }
        },

        onError: (error) => {
          console.error('[TutorialScreen] ❌ Stream error:', error);

          // Ajouter un message d'erreur visible dans la conversation
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Erreur: ${error}. Veuillez réessayer.`
          }]);

          toast({
            title: "Erreur de Peter",
            description: `La conversation a échoué: ${error}`,
            variant: "destructive",
            duration: 10000, // 10 secondes pour être visible
          });

          // Réinitialiser l'état pour permettre de réessayer
          recoverFromError();
        },
      }, {
        // Pass exchange context for Peter's behavior at end of conversation
        exchangeCount: currentExchange,
        userName: userName
      });
    } catch (error) {
      console.error('[TutorialScreen] Streaming failed:', error);
      // Fallback to non-streaming
      console.log('[TutorialScreen] Falling back to non-streaming');
      await processMessageNonStreaming(userMessage);
    }
  };

  // Legacy non-streaming message processing (kept for fallback)
  const processMessageNonStreaming = async (userMessage: string) => {
    const result = await sendChatMessage(sessionId, userMessage);

    console.log('[TutorialScreen] ========== API RESPONSE ==========');
    console.log('[TutorialScreen] result.response:', result.response);
    console.log('[TutorialScreen] ===================================');

    // Détecter les NOUVEAUX indices en comparant avec l'état actuel
    const previousClues = foundClues;
    const detectedNewClues = result.foundClues.filter(clue => !previousClues.includes(clue));

    if (detectedNewClues.length > 0) {
      console.log('[TutorialScreen] New clues detected:', detectedNewClues);
      setFoundClues(result.foundClues);
      setNewClues(detectedNewClues);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }

    // Afficher le message IMMEDIATEMENT
    console.log('[TutorialScreen] Adding assistant message immediately');
    setMessages(prev => [...prev, makeMessage('assistant', result.response)]);

    // Generate TTS and play
    try {
      console.log('[TutorialScreen] Generating TTS for response with retry...');
      const audioBlob = await textToSpeechWithRetry(result.response);
      console.log('[TutorialScreen] TTS generated successfully, blob size:', audioBlob.size);

      if (audioBlob.size === 0) {
        throw new Error('Received empty audio blob from TTS');
      }

      console.log('[TutorialScreen] Starting audio playback...');
      await playAudio(audioBlob);
      console.log('[TutorialScreen] Audio playback completed successfully');
    } catch (error) {
      console.error('[TutorialScreen] TTS or playback failed:', error);
      recoverFromError();

      if (!fallbackMode) {
        toast({
          title: "Voix temporairement indisponible",
          description: "La réponse de Peter s'affiche en texte uniquement.",
          variant: "default",
        });
      }
    }
  };

  const handleFinish = () => {
    captureEvent("tutorial_completed", {
      cluesFound: foundClues.length,
      totalClues: TOTAL_CLUES,
      exchangeCount: exchangeCount,
      cluesList: foundClues,
    });
    onComplete(foundClues.length, foundClues);
  };

  // Auto-démarrage audio dès le montage (le clic précédent “Démarrer le tutoriel” suffit comme geste utilisateur)
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      handleUnlockAudio();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allCluesFound = foundClues.length >= TOTAL_CLUES;

  // Animation CSS pour flash limité à 3 fois
  const flashAnimation = allCluesFound ? "animate-flash-3" : "";
  
  const FinishButton = foundClues.length >= 3 ? (
    <Button
      onClick={handleFinish}
      className={`transition-all duration-500 font-semibold shadow-lg hover:scale-105 active:scale-95 whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 ${
        allCluesFound 
          ? `bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 text-sm sm:text-base ${flashAnimation}` 
          : "bg-primary/90 text-white px-3 sm:px-4 py-2 text-sm sm:text-base"
      }`}
      data-testid="button-finish"
    >
      {allCluesFound && <CheckCircle2 className="mr-1 h-4 w-4 sm:mr-2 sm:h-5 sm:w-5" />}
      Poursuivre
    </Button>
  ) : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* MOBILE LAYOUT - vertical stacking (default, shown on screens < lg) */}
      <div className="flex flex-col h-full lg:hidden">
        {/* Header fixe en haut avec compteur */}
        <header className="flex-shrink-0 z-30 bg-card border-b border-card-border px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-1.5 rounded-full"
              data-testid="badge-clue-counter"
            >
              <span className="font-bold text-primary">{foundClues.length}</span>
              <span className="text-muted-foreground">/{TOTAL_CLUES} indices</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {FinishButton}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sessionFlow.resetSession();
                captureEvent('session_manual_reset');
                window.location.replace('/?fresh=1');
              }}
              className="px-3 h-9 sm:h-10"
              data-testid="button-reset-session-mobile"
            >
              Nouvelle session
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowInfoModal(true)}
              className="flex items-center gap-1 px-2 h-9 sm:h-10"
              data-testid="button-help"
            >
              <span className="text-xs sm:text-sm font-medium">Info</span>
              <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>
        </header>

        {/* Image zoomable - 100% en horizontal */}
        <div className="relative w-full bg-muted flex-shrink-0" style={{ height: '26vh', minHeight: '180px' }}>
          <ZoomableImage
            src={tutorialImage}
            alt="Image à analyser"
          />
        </div>

        {/* Zone fixe pour les indices trouvés - sans le bouton Poursuivre (qui est dans le header) */}
        <div className="px-3 sm:px-4 py-2 bg-background border-b border-card-border flex-shrink-0 min-h-[50px] sm:min-h-[60px] flex items-center">
          <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full">
            {foundClues.length > 0 ? (
              foundClues.map((clue, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="animate-scale-in text-xs sm:text-sm"
                  data-testid={`badge-clue-${index}`}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {clue}
                </Badge>
              ))
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground">Les indices apparaîtront ici...</p>
            )}
          </div>
        </div>

        {/* Zone de conversation - seule partie scrollable */}
        <div className="flex-1 overflow-hidden">
          <ConversationPanel
            messages={messages}
            userName={userName}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onSendText={handleSendText}
            state={audioState}
            transcription={transcription}
            fallbackMode={fallbackMode}
            textInput={textInput}
            onTextInputChange={setTextInput}
            exchangeCount={exchangeCount}
            maxExchanges={MAX_EXCHANGES}
          />
        </div>
      </div>

      {/* DESKTOP LAYOUT - two columns side by side (lg and above) */}
      <div className="hidden lg:flex h-full">
        {/* LEFT COLUMN - Conversation scrollable (wider column ~35%) */}
        <div className="w-[35%] flex flex-col border-r border-card-border flex-shrink-0">
          <ConversationPanel
            messages={messages}
            userName={userName}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onSendText={handleSendText}
            state={audioState}
            transcription={transcription}
            fallbackMode={fallbackMode}
            textInput={textInput}
            onTextInputChange={setTextInput}
            exchangeCount={exchangeCount}
            maxExchanges={MAX_EXCHANGES}
          />
        </div>

        {/* RIGHT COLUMN - Image maximized with info bar on top (~65% width) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Info bar above image - contains clue counter, found clues, and help */}
          <div className="flex-shrink-0 bg-card border-b border-card-border px-6 py-3 flex items-center justify-between gap-4">
            {/* Left section: Clue counter and tags */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Clue counter badge */}
              <Badge
                variant="secondary"
                className="text-base px-3 py-1.5 rounded-full flex-shrink-0"
                data-testid="badge-clue-counter"
              >
                <span className="font-bold text-primary">{foundClues.length}</span>
                <span className="text-muted-foreground">/{TOTAL_CLUES} indices</span>
              </Badge>

              {/* Clue tags */}
              {foundClues.length > 0 ? (
                <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                  {foundClues.map((clue, index) => (
                    <Badge
                      key={index}
                      variant="default"
                      className="animate-scale-in text-sm"
                      data-testid={`badge-clue-${index}`}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {clue}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Les indices apparaîtront ici...</p>
              )}
            </div>

            {/* Right section: Help button and Finish button */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {FinishButton}

              <Button
                variant="outline"
                onClick={() => {
                  sessionFlow.resetSession();
                  captureEvent('session_manual_reset');
                  window.location.replace('/?fresh=1');
                }}
                className="px-3 h-10"
                data-testid="button-reset-session-desktop"
              >
                Nouvelle session
              </Button>

              <Button
                variant="ghost"
                onClick={() => setShowInfoModal(true)}
                className="flex items-center gap-1.5 px-3 h-10"
                data-testid="button-help"
              >
                <span className="text-sm font-medium">Info</span>
                <HelpCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Image section - maximized to fill remaining space */}
          <div className="flex-1 relative bg-white overflow-hidden">
            <ZoomableImage
              src={tutorialImage}
              alt="Image à analyser"
            />
          </div>
        </div>
      </div>

      {showSuccess && <SuccessFeedback clueNames={newClues} />}
      <InfoModal open={showInfoModal} onOpenChange={setShowInfoModal} />
    </div>
  );
}
