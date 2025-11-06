import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2 } from "lucide-react";
import tutorialImage from "@assets/PlaceDesNations_Dilemme_1762432136623.png";
import VoiceInteraction from "./VoiceInteraction";
import SuccessFeedback from "./SuccessFeedback";
import { useVoiceInteraction } from "@/hooks/useVoiceInteraction";
import { sendChatMessage, textToSpeech } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface TutorialScreenProps {
  sessionId: string;
  userName: string;
  onComplete: (score: number, foundClues: string[]) => void;
}

export default function TutorialScreen({ sessionId, userName, onComplete }: TutorialScreenProps) {
  const [foundClues, setFoundClues] = useState<string[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastClue, setLastClue] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  
  const { toast } = useToast();
  
  const {
    audioState,
    transcription,
    startRecording,
    stopRecording,
    playAudio,
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

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (error) {
      console.error('Recording start error:', error);
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
      const result = await sendChatMessage(sessionId, userMessage);
      
      // Store assistant response to display it
      setLastAssistantMessage(result.response);
      setTimeout(() => setLastAssistantMessage(''), 8000);
      
      if (result.detectedClue && !foundClues.includes(result.detectedClue)) {
        setFoundClues(result.foundClues);
        setLastClue(result.detectedClue);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }

      if (!fallbackMode) {
        try {
          const audioBlob = await textToSpeech(result.response);
          await playAudio(audioBlob);
        } catch (error) {
          console.error('TTS error, showing text only:', error);
          recoverFromError();
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      recoverFromError();
      toast({
        title: "Erreur",
        description: "Impossible de traiter votre message. Réessayez.",
        variant: "destructive",
      });
    }
  };

  const handleFinish = () => {
    onComplete(foundClues.length, foundClues);
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Image plein écran en arrière-plan */}
      <div className="absolute inset-0 z-0">
        <img 
          src={tutorialImage} 
          alt="Image à analyser" 
          className="w-full h-full object-cover select-none"
          draggable={false}
          data-testid="img-tutorial"
        />
        {/* Overlay sombre pour lisibilité */}
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Header avec compteur */}
      <header className="relative z-10 bg-black/50 backdrop-blur-sm px-4 py-4 flex items-center justify-between">
        <Badge 
          variant="secondary" 
          className="text-lg px-4 py-2 rounded-full bg-background/90"
          data-testid="badge-clue-counter"
        >
          <span className="font-bold text-primary">{foundClues.length}</span>
          <span className="text-muted-foreground">/4</span>
        </Badge>
        
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setShowHelp(!showHelp)}
          className="w-10 h-10 bg-background/90 hover:bg-background"
          data-testid="button-help"
        >
          <HelpCircle className="w-5 h-5" />
        </Button>
      </header>

      {showHelp && (
        <div className="relative z-10 bg-black/70 backdrop-blur px-4 py-4 animate-slide-up">
          <p className="text-sm text-white">
            Analysez l'image et parlez pour découvrir les 4 indices cachés. Peter vous guidera!
          </p>
        </div>
      )}

      {/* Contenu central - réponse de Peter et indices */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-end p-4 pb-72 space-y-4">
        {/* Réponse de l'assistant */}
        {lastAssistantMessage && (
          <div className="w-full max-w-md bg-black/80 backdrop-blur-md rounded-2xl p-4 animate-slide-up">
            <p className="text-sm font-medium text-white/70 mb-2">Peter dit:</p>
            <p className="text-base text-white" data-testid="text-assistant-message">
              {lastAssistantMessage}
            </p>
          </div>
        )}

        {/* Indices trouvés */}
        {foundClues.length > 0 && (
          <div className="w-full max-w-md bg-black/70 backdrop-blur-md rounded-2xl p-4 space-y-2">
            <p className="text-sm font-medium text-white">Indices trouvés:</p>
            <div className="flex flex-wrap gap-2">
              {foundClues.map((clue, index) => (
                <Badge 
                  key={index} 
                  variant="default" 
                  className="animate-scale-in bg-primary/90"
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
                variant="outline"
                className="w-full rounded-xl mt-2 bg-background/90 hover:bg-background"
                data-testid="button-finish"
              >
                Terminer le niveau
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Contrôles vocaux superposés sur l'image */}
      <div className="relative z-20">
        <VoiceInteraction
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onSendText={handleSendText}
          onRecoverFromError={recoverFromError}
          state={audioState}
          transcription={transcription}
          fallbackMode={fallbackMode}
        />
      </div>

      {showSuccess && <SuccessFeedback clueName={lastClue} />}
    </div>
  );
}
