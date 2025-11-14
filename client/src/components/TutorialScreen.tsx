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

  const { toast } = useToast();

  // Message de bienvenue initial
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Bienvenue ${userName} dans cette courte expérience. Il faut que tu trouves 4 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé.`
    }]);
  }, [userName]);
  
  const {
    audioState,
    transcription,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    checkMicrophonePermission,
    recoverFromError,
  } = useVoiceInteraction();

  // Auto-switch to text mode when audio error occurs
  useEffect(() => {
    if (audioState === 'error' && !fallbackMode) {
      setFallbackMode(true);
      toast({
        title: "Mode texte activé",
        description: "Le microphone n'est pas disponible. Utilisez le mode texte.",
        variant: "default",
      });
      recoverFromError();
    }
  }, [audioState, fallbackMode, toast, recoverFromError]);

  // Fonction pour interrompre Peter et permettre à l'utilisateur de parler
  const handleInterruptPeter = () => {
    console.log('[TutorialScreen] User wants to interrupt Peter');

    // Arrêter immédiatement la lecture audio de Peter
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
      setFallbackMode(true);
      toast({
        title: "Mode texte activé",
        description: "Impossible d'accéder au microphone. Utilisez le mode texte.",
        variant: "destructive",
      });
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
    try {
      // Ajouter le message utilisateur
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

      const result = await sendChatMessage(sessionId, userMessage);

      // NE PAS ajouter la réponse de l'assistant tout de suite
      // On l'ajoutera juste avant de jouer la voix pour synchroniser le typewriter

      // Détecter les NOUVEAUX indices en comparant avec l'état actuel
      const previousClues = foundClues;
      const detectedNewClues = result.foundClues.filter(clue => !previousClues.includes(clue));

      if (detectedNewClues.length > 0) {
        setFoundClues(result.foundClues);
        setNewClues(detectedNewClues);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }

      // Toujours jouer le TTS si on n'est pas en fallback mode
      if (!fallbackMode) {
        try {
          console.log('[TutorialScreen] Generating TTS for response...');
          const audioBlob = await textToSpeech(result.response);
          console.log('[TutorialScreen] TTS generated, playing audio...');

          // AJOUTER le message de l'assistant JUSTE AVANT de jouer la voix
          // Ainsi le typewriter se synchronisera avec la voix
          setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);

          await playAudio(audioBlob);
          console.log('[TutorialScreen] Audio playback completed');
        } catch (error) {
          console.error('TTS error, showing text only:', error);
          // En cas d'erreur, afficher quand même le message
          setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
        }
      } else {
        // En mode texte, afficher le message immédiatement
        setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
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

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header fixe en haut avec compteur */}
      <header className="flex-shrink-0 z-30 bg-card border-b border-card-border px-4 py-3 flex items-center justify-between">
        <Badge
          variant="secondary"
          className="text-base px-3 py-1.5 rounded-full"
          data-testid="badge-clue-counter"
        >
          <span className="font-bold text-primary">{foundClues.length}</span>
          <span className="text-muted-foreground">/4 indices</span>
        </Badge>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => setShowHelp(!showHelp)}
          className="w-10 h-10"
          data-testid="button-help"
        >
          <HelpCircle className="w-5 h-5" />
        </Button>
      </header>

      {showHelp && (
        <div className="flex-shrink-0 bg-muted/50 backdrop-blur px-4 py-3 animate-slide-up border-b border-card-border z-20">
          <p className="text-sm">
            Analysez l'image et parlez pour découvrir les 4 indices cachés. Peter vous guidera!
          </p>
        </div>
      )}

      {/* Image zoomable - 100% en horizontal */}
      <div className="relative w-full bg-muted flex-shrink-0" style={{ height: '35vh', minHeight: '200px' }}>
        <ZoomableImage
          src={tutorialImage}
          alt="Image à analyser"
        />
      </div>

      {/* Zone fixe pour les indices trouvés - toujours présente */}
      <div className="px-4 py-2 bg-background border-b border-card-border flex-shrink-0 min-h-[60px] flex items-center">
        {foundClues.length > 0 ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex flex-wrap gap-2 flex-1">
              {foundClues.map((clue, index) => (
                <Badge
                  key={index}
                  variant="default"
                  className="animate-scale-in text-xs"
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
                className="rounded-xl flex-shrink-0"
                data-testid="button-finish"
              >
                Terminer
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Les indices apparaîtront ici...</p>
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
