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

  useEffect(() => {
    checkMicPermission();
  }, []);

  const checkMicPermission = async () => {
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) {
      setFallbackMode(true);
      toast({
        title: "Mode texte activé",
        description: "Le microphone n'est pas disponible. Vous pouvez utiliser le mode texte.",
        variant: "destructive",
      });
    }
  };

  const handleStartRecording = async () => {
    await startRecording();
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
    <div className="min-h-screen flex flex-col pb-64">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4 flex items-center justify-between">
        <Badge 
          variant="secondary" 
          className="text-lg px-4 py-2 rounded-full"
          data-testid="badge-clue-counter"
        >
          <span className="font-bold text-primary">{foundClues.length}</span>
          <span className="text-muted-foreground">/4</span>
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
        <div className="bg-muted/50 border-b border-border px-4 py-4 animate-slide-up">
          <p className="text-sm text-muted-foreground">
            Analysez l'image et parlez pour découvrir les 4 indices cachés. Peter vous guidera!
          </p>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-start p-4 space-y-6">
        <div className="w-full max-w-2xl space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold">Bonjour {userName}!</h2>
            <p className="text-muted-foreground">
              Que voyez-vous dans cette image?
            </p>
          </div>

          <div className="relative rounded-xl overflow-hidden shadow-lg">
            <img 
              src={tutorialImage} 
              alt="Image à analyser" 
              className="w-full h-auto select-none"
              draggable={false}
              data-testid="img-tutorial"
            />
          </div>

          {foundClues.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Indices trouvés:</p>
              <div className="flex flex-wrap gap-2">
                {foundClues.map((clue, index) => (
                  <Badge 
                    key={index} 
                    variant="default" 
                    className="animate-scale-in"
                    data-testid={`badge-clue-${index}`}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {clue}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {foundClues.length >= 2 && (
            <Button
              onClick={handleFinish}
              variant="outline"
              className="w-full rounded-xl"
              data-testid="button-finish"
            >
              Terminer le niveau
            </Button>
          )}
        </div>
      </div>

      <VoiceInteraction
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onSendText={handleSendText}
        onRecoverFromError={recoverFromError}
        state={audioState}
        transcription={transcription}
        fallbackMode={fallbackMode}
      />

      {showSuccess && <SuccessFeedback clueName={lastClue} />}
    </div>
  );
}
