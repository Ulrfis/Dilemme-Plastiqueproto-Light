import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2, ChevronUp, ChevronDown } from "lucide-react";
import tutorialImage from "@assets/BURDEN_OF_THE_THINKER_2_retrav_1776145190837.jpg";
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

  const hasPlayedWelcome = useRef(false);
  const streamGenerationRef = useRef(0);

  // Bulle "Peter réfléchit" : visible dès l'envoi du message utilisateur,
  // masquée dès la première phrase de la vraie réponse (ou onError/onComplete fallback)
  const [isThinking, setIsThinking] = useState(false);
  const firstSentenceReceivedRef = useRef(false);

  // Image collapsible (mobile) — auto-réduit quand le clavier virtuel s'ouvre
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const userCollapsedRef = useRef(false);

  // PostHog TTS latency tracking refs
  const exchangeStartTimeRef = useRef<number>(0);
  const phase1ReadyTimeRef = useRef<number>(0);
  const phase1ReportedRef = useRef<boolean>(false);

  const { toast } = useToast();

  // MOBILE FIX: Ajouter un état local pour forcer le retour à idle en cas de blocage
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // PHASE 2 OPTIMIZATION: Enable streaming by default for better latency
  const useStreaming = useRef(true); // Set to false to use old non-streaming pipeline

  // Live transcript Deepgram pendant l'enregistrement (passe de correction Whisper au stop)
  // committedRef = somme des transcriptions "is_final" reçues (verrouillées)
  // currentInterim = dernier interim, remplacé à chaque message
  const liveCommittedRef = useRef<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');

  const handleLiveTranscript = useCallback((text: string, isFinal: boolean) => {
    if (isFinal) {
      liveCommittedRef.current = (liveCommittedRef.current + ' ' + text).trim();
      setLiveTranscript(liveCommittedRef.current);
    } else {
      const combined = (liveCommittedRef.current + ' ' + text).trim();
      setLiveTranscript(combined);
    }
  }, []);

  const {
    audioState,
    transcription,
    audioLevel,
    startRecording,
    stopRecording,
    playAudio,
    playFromUrl,
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
    // Transcription temps réel Deepgram → affichée dans la zone d'input
    onLiveTranscript: handleLiveTranscript,
  });

  const audioQueue = useAudioQueue({
    playAudio,
    onQueueEmpty: () => {
      console.log('[TutorialScreen] Audio queue empty - all sentences played');
    },
    onPlaybackStart: () => {
      console.log('[TutorialScreen] First sentence audio started playing');
      const now = Date.now();
      const latencyMs = exchangeStartTimeRef.current > 0 ? now - exchangeStartTimeRef.current : undefined;
      const phase1ToPlaybackMs = phase1ReadyTimeRef.current > 0 ? now - phase1ReadyTimeRef.current : undefined;
      captureEvent('audio_playback_started', {
        latency_ms: latencyMs,
        phase1_to_playback_ms: phase1ToPlaybackMs,
      });
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

        // Try to use the pre-generated welcome audio token (kicked off at session creation)
        let audioBlob: Blob | null = null;
        const pregenToken = sessionStorage.getItem('welcomeAudioToken');
        if (pregenToken) {
          sessionStorage.removeItem('welcomeAudioToken'); // consume immediately to prevent stale reuse
          try {
            console.log('[TutorialScreen] Using pre-generated welcome audio, token:', pregenToken.substring(0, 8));
            const audioResponse = await fetch(`/api/tts/play/${pregenToken}`);
            if (audioResponse.ok) {
              audioBlob = await audioResponse.blob();
              console.log('[TutorialScreen] Pre-generated welcome audio ready, size:', audioBlob.size);
            } else {
              console.warn('[TutorialScreen] Pre-generated token returned', audioResponse.status, '— falling back');
            }
          } catch (pregenErr) {
            console.warn('[TutorialScreen] Pre-generated audio fetch failed, falling back:', pregenErr);
            audioBlob = null;
          }
        }

        // Fallback: generate on-demand if pre-gen token was unavailable or failed
        if (!audioBlob || audioBlob.size < 100) {
          console.log('[TutorialScreen] Generating welcome audio on-demand (no pre-gen token)');
          audioBlob = await textToSpeechWithRetry(welcomeMessage);
        }

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

  const handleInterruptPeter = () => {
    console.log('[TutorialScreen] User wants to interrupt Peter');
    audioQueue.clear();
    stopAudio();
    console.log('[TutorialScreen] Peter interrupted, user can now speak');
  };

  const handleStartRecording = async () => {
    console.log('[TutorialScreen] handleStartRecording called');

    // Réinitialiser le live transcript Deepgram pour cette nouvelle prise de parole
    liveCommittedRef.current = '';
    setLiveTranscript('');

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
    if (audioState === 'playing') {
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

      // Activer la bulle "Peter réfléchit" pendant la génération de la réponse
      firstSentenceReceivedRef.current = false;
      setIsThinking(true);

      // PHASE 2 OPTIMIZATION: Use streaming pipeline for better latency
      if (useStreaming.current) {
        console.log('[TutorialScreen] Using STREAMING pipeline');
        await processMessageStreaming(userMessage, newExchangeCount);
      } else {
        console.log('[TutorialScreen] Using NON-STREAMING pipeline (legacy)');
        await processMessageNonStreaming(userMessage);
      }
    } catch (error) {
      setIsThinking(false);
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

  const processMessageStreaming = async (userMessage: string, currentExchange: number) => {
    console.log('[TutorialScreen] Processing message with streaming, exchange:', currentExchange);
    let fullResponse = '';

    // Reset PostHog latency tracking for this exchange
    exchangeStartTimeRef.current = Date.now();
    phase1ReadyTimeRef.current = 0;
    phase1ReportedRef.current = false;

    audioQueue.clear();
    audioQueue.pause();
    streamGenerationRef.current++;
    const currentGeneration = streamGenerationRef.current;

    try {
      await sendChatMessageStreaming(sessionId, userMessage, {
        onSentence: (sentence, index) => {
          if (streamGenerationRef.current !== currentGeneration) return;
          console.log('[TutorialScreen] Received sentence #' + index + ':', sentence.substring(0, 50) + '...');
          fullResponse += sentence + ' ';

          // Première phrase reçue : masquer la bulle "Peter réfléchit"
          if (!firstSentenceReceivedRef.current) {
            firstSentenceReceivedRef.current = true;
            setIsThinking(false);
          }

          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              return [...prev.slice(0, -1), { ...lastMessage, content: fullResponse.trim() }];
            } else {
              return [...prev, makeMessage('assistant', fullResponse.trim())];
            }
          });
        },

        onSentenceAudio: (index, audioToken, count, phase) => {
          if (streamGenerationRef.current !== currentGeneration) return;
          console.log(`[TutorialScreen] Audio block ready: index=${index}, count=${count}, phase=${phase}, token=${audioToken}`);

          const now = Date.now();
          const latencyMs = exchangeStartTimeRef.current > 0 ? now - exchangeStartTimeRef.current : undefined;
          if (phase === 'phase1' || (!phase && !phase1ReportedRef.current)) {
            phase1ReportedRef.current = true;
            phase1ReadyTimeRef.current = now;
            captureEvent('tts_phase1_ready', {
              latency_ms: latencyMs,
              sentence_index: index,
              sentence_count: count,
            });
          } else if (phase === 'phase2' || (!phase && phase1ReportedRef.current)) {
            const phase1ToPhase2Ms = phase1ReadyTimeRef.current > 0 ? now - phase1ReadyTimeRef.current : undefined;
            captureEvent('tts_phase2_ready', {
              latency_ms: latencyMs,
              phase1_to_phase2_ms: phase1ToPhase2Ms,
              sentence_index: index,
              sentence_count: count,
              phase2_missing: false,
            });
          }

          // Pre-register all higher indices in this audio block as skipped.
          // The audio at `index` covers sentences index through index+count-1.
          // The AudioQueue expects sequential playback, so we skip the "inner" indices.
          for (let i = index + 1; i < index + count; i++) {
            audioQueue.skipIndex(i);
          }

          fetch(`/api/tts/play/${audioToken}`)
            .then(audioResponse => {
              if (streamGenerationRef.current !== currentGeneration) return;
              if (audioResponse.ok) {
                return audioResponse.blob();
              }
              throw new Error(`HTTP ${audioResponse.status}`);
            })
            .then(audioBlob => {
              if (streamGenerationRef.current !== currentGeneration) return;
              if (audioBlob && audioBlob.size >= 100) {
                audioQueue.enqueue(audioBlob, `sentences-${index}-to-${index + count - 1}`, index);
              } else {
                console.warn('[TutorialScreen] Audio block at index #' + index + ' too small, skipping all', count, 'indices');
                for (let i = index; i < index + count; i++) audioQueue.skipIndex(i);
              }
            })
            .catch(fetchErr => {
              if (streamGenerationRef.current !== currentGeneration) return;
              console.error('[TutorialScreen] Error fetching audio block at index #' + index + ':', fetchErr);
              captureEvent('sentence_audio_error', { pipeline: 'streaming', sentence_index: index, reason: 'fetch_failed' });
              for (let i = index; i < index + count; i++) audioQueue.skipIndex(i);
            });
        },

        onSentenceAudioError: (index) => {
          if (streamGenerationRef.current !== currentGeneration) return;
          console.warn('[TutorialScreen] Sentence #' + index + ' TTS failed on server, skipping');
          captureEvent('sentence_audio_error', { pipeline: 'streaming', sentence_index: index });
          audioQueue.skipIndex(index);
        },

        onComplete: async (finalResponse, newFoundClues, detectedClue, phase2Dispatched) => {
          if (streamGenerationRef.current !== currentGeneration) return;
          console.log('[TutorialScreen] Stream complete, final response length:', finalResponse.length);

          // Garde-fou : si le stream complète sans aucun event onSentence, la bulle
          // "Peter réfléchit" doit être retirée ici (sinon elle resterait à jamais).
          setIsThinking(false);

          if (!finalResponse || finalResponse.trim().length === 0) {
            console.error('[TutorialScreen] Empty response received from Peter');
            toast({
              title: "Réponse vide",
              description: "Peter n'a pas pu générer de réponse. Veuillez réessayer.",
              variant: "destructive",
            });
            recoverFromError();
            return;
          }

          // Server explicitly confirms whether Phase 2 was dispatched.
          // Only emit phase2_missing when the server confirms it will NOT arrive
          // (short response handled entirely by Phase 1).
          // Note: when phase2Dispatched===true but generation fails, the server sends
          // sentence_audio_error events — those are tracked separately and this path
          // doesn't trigger (Phase 2 audio arrives after `complete`, so the check here
          // would be a race; instead we rely on server-side error events).
          if (phase2Dispatched === false) {
            const now = Date.now();
            captureEvent('tts_phase2_ready', {
              latency_ms: exchangeStartTimeRef.current > 0 ? now - exchangeStartTimeRef.current : undefined,
              phase2_missing: true,
            });
          }

          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              return [...prev.slice(0, -1), { ...lastMessage, content: finalResponse }];
            } else {
              return [...prev, makeMessage('assistant', finalResponse)];
            }
          });

          const previousClues = foundClues;
          const detectedNewClues = newFoundClues.filter(clue => !previousClues.includes(clue));

          console.log('[TutorialScreen] Clue detection:', {
            previousClues,
            newFoundClues,
            detectedNewClues,
          });

          if (detectedNewClues.length > 0) {
            console.log('[TutorialScreen] New clues detected — showing animation before audio');
            setFoundClues(newFoundClues);
            setNewClues(detectedNewClues);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 4500);
          }

          audioQueue.resume();
          
          const maxExchangesReached = currentExchange >= MAX_EXCHANGES;
          const allCluesNowFound = newFoundClues.length >= TOTAL_CLUES;

          if (maxExchangesReached || allCluesNowFound) {
            console.log('[TutorialScreen] Conversation ending:', { maxExchangesReached, allCluesNowFound, exchange: currentExchange, clues: newFoundClues.length });
            setConversationEnded(true);
          }
        },

        onError: (error) => {
          if (streamGenerationRef.current !== currentGeneration) return;
          setIsThinking(false);
          console.error('[TutorialScreen] Stream error:', error);
          captureEvent('tts_stream_error', { pipeline: 'streaming' });
          audioQueue.clear();

          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Erreur: ${error}. Veuillez réessayer.`
          }]);

          toast({
            title: "Erreur de Peter",
            description: `La conversation a échoué: ${error}`,
            variant: "destructive",
            duration: 10000,
          });

          recoverFromError();
        },
      }, {
        exchangeCount: currentExchange,
        userName: userName
      });
    } catch (error) {
      console.error('[TutorialScreen] Streaming failed:', error);
      audioQueue.clear();
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
      setTimeout(() => setShowSuccess(false), 4500);
    }

    // Afficher le message IMMEDIATEMENT
    console.log('[TutorialScreen] Adding assistant message immediately');
    setIsThinking(false);
    setMessages(prev => [...prev, makeMessage('assistant', result.response)]);

    // Fin de conversation si tous les indices trouvés
    if (result.foundClues.length >= TOTAL_CLUES) {
      console.log('[TutorialScreen] All clues found — ending conversation');
      setConversationEnded(true);
    }

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
      captureEvent('sentence_audio_error', { pipeline: 'non-streaming' });
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

  // Détection clavier virtuel via visualViewport — réduit l'image auto quand le clavier s'ouvre
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handleVvResize = () => {
      const keyboardHeight = window.innerHeight - vv.height;
      if (keyboardHeight > 120) {
        setImageCollapsed(true);
      } else if (!userCollapsedRef.current) {
        setImageCollapsed(false);
      }
    };
    vv.addEventListener('resize', handleVvResize);
    return () => vv.removeEventListener('resize', handleVvResize);
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
      {/* MOBILE LAYOUT — vertical stacking (< 768px) */}
      <div className="flex flex-col h-full md:hidden">
        {/* Header compact */}
        <header className="flex-shrink-0 z-30 bg-card border-b border-card-border px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant="secondary"
              className="text-sm px-2 py-1 rounded-full flex-shrink-0"
              data-testid="badge-clue-counter"
            >
              <span className="font-bold text-primary">{foundClues.length}</span>
              <span className="text-muted-foreground">/{TOTAL_CLUES}</span>
            </Badge>
            {/* Mini barre de progression */}
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(foundClues.length / TOTAL_CLUES) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {FinishButton}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowInfoModal(true)}
              className="h-9 w-9"
              data-testid="button-help"
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Image zoomable collapsible */}
        <div
          className="relative w-full bg-muted flex-shrink-0 overflow-hidden transition-all duration-300"
          style={{ height: imageCollapsed ? 0 : '22vh', minHeight: imageCollapsed ? 0 : '160px' }}
        >
          <ZoomableImage src={tutorialImage} alt="Image à analyser" />
          {/* Clues overlay sur l'image */}
          {foundClues.length > 0 && !imageCollapsed && (
            <div className="absolute bottom-0 left-0 right-0 px-2 pb-2 pt-4 bg-gradient-to-t from-background/80 to-transparent flex flex-wrap gap-1 pointer-events-none">
              {foundClues.map((clue, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="animate-scale-in text-xs pointer-events-auto"
                  data-testid={`badge-clue-${index}`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                  {clue}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Toggle masquer/voir l'image */}
        <button
          onClick={() => {
            const next = !imageCollapsed;
            setImageCollapsed(next);
            userCollapsedRef.current = next;
          }}
          className="flex-shrink-0 w-full bg-card/80 border-b border-card-border py-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:bg-muted/50 active:bg-muted transition-colors"
          data-testid="button-toggle-image"
        >
          {imageCollapsed
            ? <><ChevronDown className="w-3 h-3" /> Voir l'image</>
            : <><ChevronUp className="w-3 h-3" /> Masquer l'image</>
          }
        </button>

        {/* Conversation — prend tout l'espace restant */}
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
            audioLevel={audioLevel}
            liveTranscript={liveTranscript}
            isThinking={isThinking}
          />
        </div>
      </div>

      {/* TABLET LAYOUT — deux colonnes 45/55 (768px–1023px) */}
      <div className="hidden md:flex lg:hidden h-full">
        {/* Colonne gauche — Image */}
        <div className="w-[45%] flex-shrink-0 relative bg-muted overflow-hidden">
          <ZoomableImage src={tutorialImage} alt="Image à analyser" />
          {/* Clues overlay bas de l'image */}
          {foundClues.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6 bg-gradient-to-t from-background/90 to-transparent flex flex-wrap gap-1.5 pointer-events-none">
              {foundClues.map((clue, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="animate-scale-in text-xs pointer-events-auto"
                  data-testid={`badge-clue-${index}`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                  {clue}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Colonne droite — Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mini header conversation */}
          <div className="flex-shrink-0 bg-card border-b border-card-border px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="text-sm px-3 py-1 rounded-full"
                data-testid="badge-clue-counter"
              >
                <span className="font-bold text-primary">{foundClues.length}</span>
                <span className="text-muted-foreground">/{TOTAL_CLUES} indices</span>
              </Badge>
              <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(foundClues.length / TOTAL_CLUES) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {FinishButton}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowInfoModal(true)}
                data-testid="button-help"
              >
                <HelpCircle className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Panel conversation */}
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
              audioLevel={audioLevel}
              liveTranscript={liveTranscript}
              isThinking={isThinking}
            />
          </div>
        </div>
      </div>

      {/* DESKTOP LAYOUT — deux colonnes (≥ 1024px) */}
      <div className="hidden lg:flex h-full">
        {/* Colonne gauche — Conversation (34%) */}
        <div className="w-[34%] xl:w-[32%] flex flex-col border-r border-card-border flex-shrink-0">
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
            liveTranscript={liveTranscript}
            exchangeCount={exchangeCount}
            maxExchanges={MAX_EXCHANGES}
            audioLevel={audioLevel}
            isThinking={isThinking}
          />
        </div>

        {/* Colonne droite — Image + info bar */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Info bar structurée en 3 zones */}
          <div className="flex-shrink-0 bg-card border-b border-card-border px-5 py-2.5 flex items-center gap-4">
            {/* Zone 1 : Progression */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant="secondary"
                className="text-sm px-3 py-1 rounded-full"
                data-testid="badge-clue-counter"
              >
                <span className="font-bold text-primary">{foundClues.length}</span>
                <span className="text-muted-foreground">/{TOTAL_CLUES}</span>
              </Badge>
              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${(foundClues.length / TOTAL_CLUES) * 100}%` }}
                />
              </div>
            </div>

            {/* Zone 2 : Indices trouvés */}
            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
              {foundClues.length > 0 ? (
                foundClues.map((clue, index) => (
                  <Badge
                    key={index}
                    variant="default"
                    className="animate-scale-in text-sm"
                    data-testid={`badge-clue-${index}`}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {clue}
                  </Badge>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Les indices apparaîtront ici…</p>
              )}
            </div>

            {/* Zone 3 : Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {FinishButton}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionFlow.resetSession();
                  captureEvent('session_manual_reset');
                  window.location.replace('/?fresh=1');
                }}
                data-testid="button-reset-session-desktop"
              >
                Nouvelle session
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowInfoModal(true)}
                data-testid="button-help"
              >
                <HelpCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Image — remplit l'espace restant */}
          <div className="flex-1 relative bg-background overflow-hidden">
            <ZoomableImage src={tutorialImage} alt="Image à analyser" />
          </div>
        </div>
      </div>

      {showSuccess && <SuccessFeedback clueNames={newClues} />}
      <InfoModal open={showInfoModal} onOpenChange={setShowInfoModal} />
    </div>
  );
}
