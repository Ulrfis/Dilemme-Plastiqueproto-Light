import { useState, useEffect } from "react";
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [welcomeMessage] = useState(`Bienvenue ${userName} dans cette courte expérience. Il faut que tu trouves 4 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé.`);

  const { toast } = useToast();

  // MOBILE FIX: Ajouter un état local pour forcer le retour à idle en cas de blocage
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

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

  // Fonction pour déverrouiller l'audio et jouer le message de bienvenue
  const handleUnlockAudio = async () => {
    console.log('[TutorialScreen] Unlocking audio with user gesture');
    
    try {
      // Générer le TTS pour le message de bienvenue
      const audioBlob = await textToSpeechWithRetry(welcomeMessage);
      console.log('[TutorialScreen] Welcome message TTS generated');
      
      // Jouer l'audio - ce geste utilisateur déverrouille l'audio pour toute la session
      await playAudio(audioBlob);
      console.log('[TutorialScreen] Welcome audio played successfully');
      
      // Ajouter le message de bienvenue à la conversation
      setMessages([{
        role: 'assistant',
        content: welcomeMessage
      }]);
      
      // Marquer que l'audio est déverrouillé
      setAudioUnlocked(true);
    } catch (error) {
      console.error('[TutorialScreen] Failed to unlock audio:', error);
      
      // En cas d'erreur, afficher le message en mode texte
      setMessages([{
        role: 'assistant',
        content: welcomeMessage
      }]);
      setAudioUnlocked(true);
      
      toast({
        title: "Mode texte activé",
        description: "Peter s'affiche en texte uniquement.",
        variant: "default",
      });
    }
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
      stopAudio();
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

    try {
      // Ajouter le message utilisateur
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

      const result = await sendChatMessage(sessionId, userMessage);
      
      console.log('[TutorialScreen] ========== API RESPONSE ==========');
      console.log('[TutorialScreen] result.response:', result.response);
      console.log('[TutorialScreen] result.response type:', typeof result.response);
      console.log('[TutorialScreen] result.response length:', result.response?.length);
      console.log('[TutorialScreen] First 100 chars:', result.response?.substring(0, 100));
      console.log('[TutorialScreen] ===================================');

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

      // CHANGEMENT : Afficher le message IMMEDIATEMENT, sans attendre l'audio
      // Cela garantit que le texte s'affiche toujours, même si l'audio échoue
      console.log('[TutorialScreen] Adding assistant message immediately');
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);

      // IMPORTANT: Peter doit TOUJOURS parler (TTS), même si l'utilisateur est en mode texte (fallbackMode)
      // Le fallbackMode affecte seulement l'INPUT utilisateur (texte vs voix), pas l'OUTPUT de Peter
      try {
        console.log('[TutorialScreen] Generating TTS for response with retry...');
        const audioBlob = await textToSpeechWithRetry(result.response);
        console.log('[TutorialScreen] TTS generated successfully');

        console.log('[TutorialScreen] About to call playAudio...');

        // MOBILE FIX: Timeout de sécurité pour forcer le retour à idle si l'audio ne se termine pas
        // Estimer la durée de l'audio (environ 150 mots par minute de parole)
        const estimatedDuration = Math.max(10000, (result.response.length / 5) * 60 / 150 * 1000);
        const safetyTimeout = estimatedDuration + 5000; // Ajouter 5 secondes de marge

        console.log(`[TutorialScreen] Setting safety timeout: ${safetyTimeout}ms`);
        const timeoutId = setTimeout(() => {
          console.warn('[TutorialScreen] Safety timeout triggered - forcing audio to stop');
          stopAudio();
          // Forcer le retour à idle si le hook ne le fait pas
          if (audioState !== 'idle') {
            recoverFromError();
          }
        }, safetyTimeout);

        try {
          await playAudio(audioBlob);
          console.log('[TutorialScreen] Audio playback completed successfully');
        } finally {
          // Toujours nettoyer le timeout, que l'audio réussisse ou échoue
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('[TutorialScreen] TTS or playback failed:', error);

        // CRITIQUE: S'assurer que l'état revient à idle pour permettre de continuer
        console.log('[TutorialScreen] Forcing state back to idle after audio error');
        recoverFromError();

        // Afficher un toast informatif seulement si on n'est PAS déjà en fallbackMode
        // (pour éviter de spammer l'utilisateur avec des toasts sur mobile)
        if (!fallbackMode) {
          toast({
            title: "Voix temporairement indisponible",
            description: "La réponse de Peter s'affiche en texte uniquement.",
            variant: "default",
          });
        }

        // NE PAS activer fallbackMode - le mode texte est seulement pour l'INPUT
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

  const handleFinish = () => {
    onComplete(foundClues.length, foundClues);
  };

  // Afficher le bouton de déverrouillage audio si l'audio n'est pas encore déverrouillé
  if (!audioUnlocked) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Prêt à commencer ?</h2>
            <p className="text-muted-foreground">
              Cliquez sur le bouton ci-dessous pour écouter Peter vous accueillir et commencer le tutoriel.
            </p>
          </div>
          
          <Button
            onClick={handleUnlockAudio}
            size="lg"
            className="w-full max-w-sm rounded-2xl text-lg py-6"
            data-testid="button-unlock-audio"
          >
            🎧 Écouter Peter
          </Button>
          
          <p className="text-sm text-muted-foreground">
            Pour une meilleure expérience, activez le son de votre appareil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* MOBILE LAYOUT - vertical stacking (default, shown on screens < lg) */}
      <div className="flex flex-col h-full lg:hidden">
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
                <span className="text-muted-foreground">/4 indices</span>
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
              {foundClues.length >= 2 && (
                <Button
                  onClick={handleFinish}
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  data-testid="button-finish"
                >
                  Terminer
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowHelp(!showHelp)}
                className="w-10 h-10"
                data-testid="button-help"
              >
                <HelpCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Help section (expandable) */}
          {showHelp && (
            <div className="flex-shrink-0 bg-muted/50 backdrop-blur px-4 py-3 animate-slide-up border-b border-card-border">
              <p className="text-sm">
                Analysez l'image et parlez pour découvrir les 4 indices cachés. Peter vous guidera!
              </p>
            </div>
          )}

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
    </div>
  );
}
