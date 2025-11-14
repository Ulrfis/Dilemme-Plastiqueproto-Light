import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2 } from "lucide-react";
import tutorialImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";
import ConversationPanel from "./ConversationPanel";
import SuccessFeedback from "./SuccessFeedback";
import ZoomableImage from "./ZoomableImage";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { sendChatMessage, textToSpeech } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface TutorialScreenProps {
  sessionId: string;
  userName: string;
  onComplete: (score: number, foundClues: string[]) => void;
}

export default function TutorialScreen({ sessionId, userName, onComplete }: TutorialScreenProps) {
  const [foundClues, setFoundClues] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [newClues, setNewClues] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState('');
  
  // Utiliser une ref au lieu d'un state pour éviter les problèmes de stale closure
  // Le callback handleAudioStart sera stable et lira toujours la dernière valeur
  const pendingAssistantMessageRef = useRef<string | null>(null);
  
  // Flag pour bloquer les nouveaux messages tant que l'audio précédent n'a pas commencé
  // Évite que pendingAssistantMessageRef soit écrasé par des messages rapides
  const isWaitingForAudioStart = useRef(false);

  const { toast } = useToast();

  // Message de bienvenue initial
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Bienvenue ${userName} dans cette courte expérience. Il faut que tu trouves 4 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé.`
    }]);
  }, [userName]);
  
  // Callback appelé quand l'audio commence VRAIMENT à jouer (via audio.onplaying)
  // Utilise une ref pour éviter les stale closures - le callback reste stable
  const handleAudioStart = useCallback(() => {
    if (pendingAssistantMessageRef.current) {
      console.log('[TutorialScreen] Audio started playing, adding assistant message for typewriter sync');
      setMessages(prev => [...prev, { role: 'assistant', content: pendingAssistantMessageRef.current! }]);
      pendingAssistantMessageRef.current = null;
    }
    // Débloquer l'envoi de nouveaux messages maintenant que l'audio a commencé
    isWaitingForAudioStart.current = false;
  }, []); // Pas de dépendances - le callback ne change jamais

  // Callback appelé quand l'audio est arrêté ou échoue
  // Nettoie les flags pour éviter les deadlocks
  const handleAudioStop = useCallback(() => {
    console.log('[TutorialScreen] Audio stopped or failed, cleaning up');
    pendingAssistantMessageRef.current = null;
    isWaitingForAudioStart.current = false;
  }, []);

  const {
    audioState,
    transcription,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    checkMicrophonePermission,
    recoverFromError,
  } = useVoiceInteraction({ 
    onAudioStart: handleAudioStart,
    onAudioStop: handleAudioStop 
  });

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

    // Arrêter immédiatement la lecture audio de Peter
    stopAudio();
    
    // Nettoyer le message en attente pour éviter qu'il s'affiche plus tard
    pendingAssistantMessageRef.current = null;
    
    // CRITIQUE: Débloquer les nouveaux messages
    // Si l'audio n'avait pas encore commencé, handleAudioStart ne sera jamais appelé
    // et isWaitingForAudioStart resterait bloqué indéfiniment
    isWaitingForAudioStart.current = false;

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
        setFallbackMode(true);
        toast({
          title: "Mode texte activé",
          description: "Microphone non disponible. Utilisez le mode texte.",
          variant: "default",
        });
      } else {
        // Erreur temporaire, afficher un message mais garder le mode vocal
        toast({
          title: "Erreur temporaire",
          description: "Veuillez réessayer d'appuyer sur le microphone.",
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
    // Bloquer les nouveaux messages tant que l'audio précédent n'a pas commencé
    // Évite d'écraser pendingAssistantMessageRef avec des messages rapides
    if (isWaitingForAudioStart.current) {
      console.log('[TutorialScreen] Blocking new message - still waiting for previous audio to start');
      toast({
        title: "Veuillez patienter",
        description: "Laissez Peter finir de parler avant d'envoyer un nouveau message.",
        variant: "default",
      });
      return;
    }

    try {
      // Ajouter le message utilisateur
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

      const result = await sendChatMessage(sessionId, userMessage);

      // Détecter les NOUVEAUX indices en comparant avec l'état actuel
      const previousClues = foundClues;
      const detectedNewClues = result.foundClues.filter(clue => !previousClues.includes(clue));

      console.log('[TutorialScreen] Clue detection:', {
        previousClues,
        resultFoundClues: result.foundClues,
        detectedNewClues,
      });

      if (detectedNewClues.length > 0) {
        console.log('[TutorialScreen] New clues detected:', detectedNewClues);
        setFoundClues(result.foundClues);
        setNewClues(detectedNewClues);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }

      // Toujours jouer le TTS si on n'est pas en fallback mode
      if (!fallbackMode) {
        try {
          console.log('[TutorialScreen] Generating TTS for response with retry...');
          const audioBlob = await textToSpeechWithRetry(result.response);
          console.log('[TutorialScreen] TTS generated successfully');

          // Stocker le message en attente dans la ref - il sera ajouté au tableau quand l'audio démarre
          // via le callback handleAudioStart, synchronisant parfaitement le typewriter avec la voix
          pendingAssistantMessageRef.current = result.response;
          
          // Bloquer les nouveaux messages jusqu'à ce que cet audio commence
          isWaitingForAudioStart.current = true;

          await playAudio(audioBlob);
          console.log('[TutorialScreen] Audio playback completed');
        } catch (error) {
          console.error('TTS failed after all retries, showing text only:', error);
          
          // Débloquer les nouveaux messages en cas d'erreur
          isWaitingForAudioStart.current = false;
          
          // Afficher un toast informatif (pas d'erreur destructive)
          toast({
            title: "Voix temporairement indisponible",
            description: "La réponse de Peter s'affiche en texte. Le mode vocal reste actif.",
            variant: "default",
          });
          
          // Afficher le message immédiatement en mode texte pour cette réponse seulement
          setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
          pendingAssistantMessageRef.current = null;
          
          // NE PAS activer fallbackMode - garder le mode vocal pour les prochains échanges
        }
      } else {
        // En mode texte, afficher le message immédiatement
        setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      
      // Débloquer les nouveaux messages en cas d'erreur générale
      isWaitingForAudioStart.current = false;
      pendingAssistantMessageRef.current = null;

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

  const handleFinish = () => {
    onComplete(foundClues.length, foundClues);
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header fixe en haut avec compteur */}
      <header className="flex-shrink-0 z-30 bg-card border-b border-card-border px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <Badge
          variant="secondary"
          className="text-sm sm:text-base px-2 sm:px-3 py-1 sm:py-1.5 rounded-full"
          data-testid="badge-clue-counter"
        >
          <span className="font-bold text-primary">{foundClues.length}</span>
          <span className="text-muted-foreground">/4 indices</span>
        </Badge>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setShowHelp(!showHelp)}
          className="w-9 h-9 sm:w-10 sm:h-10"
          data-testid="button-help"
        >
          <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
        </Button>
      </header>

      {showHelp && (
        <div className="flex-shrink-0 bg-muted/50 backdrop-blur px-3 sm:px-4 py-2 sm:py-3 animate-slide-up border-b border-card-border z-20">
          <p className="text-xs sm:text-sm">
            Analysez l'image et parlez pour découvrir les 4 indices cachés. Peter vous guidera!
          </p>
        </div>
      )}

      {/* Image zoomable - 100% en horizontal */}
      <div className="relative w-full bg-muted flex-shrink-0" style={{ height: '30vh', minHeight: '180px' }}>
        <ZoomableImage
          src={tutorialImage}
          alt="Image à analyser"
        />
      </div>

      {/* Zone fixe pour les indices trouvés - toujours présente */}
      <div className="px-3 sm:px-4 py-2 bg-background border-b border-card-border flex-shrink-0 min-h-[50px] sm:min-h-[60px] flex items-center">
        {foundClues.length > 0 ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex flex-wrap gap-1.5 sm:gap-2 flex-1">
              {foundClues.map((clue, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="animate-scale-in text-xs sm:text-sm"
                  data-testid={`badge-clue-${index}`}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {clue}
                </Badge>
              ))}
            </div>

            {foundClues.length >= 2 && (
              <Button
                onClick={handleFinish}
                size="sm"
                variant="outline"
                className="rounded-xl flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3"
                data-testid="button-finish"
              >
                Terminer
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted-foreground">Les indices apparaîtront ici...</p>
        )}
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
        />
      </div>

      {showSuccess && <SuccessFeedback clueNames={newClues} />}
    </div>
  );
}
