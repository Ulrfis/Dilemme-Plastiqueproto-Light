import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2 } from "lucide-react";
import tutorialImage from "@assets/generated_images/Tutorial_analysis_image_85409a9b.png";
import VoiceInteraction from "./VoiceInteraction";
import SuccessFeedback from "./SuccessFeedback";

interface TutorialScreenProps {
  userName: string;
  onComplete: (score: number) => void;
}

type AudioState = 'idle' | 'recording' | 'processing' | 'playing';

const TARGET_CLUES = ['ADN', 'bébé', 'penseur de Rodin', 'plastique'];

export default function TutorialScreen({ userName, onComplete }: TutorialScreenProps) {
  const [foundClues, setFoundClues] = useState<string[]>([]);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [transcription, setTranscription] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastClue, setLastClue] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const handleMessage = (message: string) => {
    console.log('User message:', message);
    
    setAudioState('processing');
    
    setTimeout(() => {
      const messageLower = message.toLowerCase();
      let clueFound = false;
      
      TARGET_CLUES.forEach(clue => {
        if (messageLower.includes(clue.toLowerCase()) && !foundClues.includes(clue)) {
          setFoundClues(prev => [...prev, clue]);
          setLastClue(clue);
          setShowSuccess(true);
          clueFound = true;
          setTimeout(() => setShowSuccess(false), 3000);
        }
      });

      setTranscription(message);
      setAudioState('playing');
      
      setTimeout(() => {
        setAudioState('idle');
      }, 2000);
    }, 1000);
  };

  const handleFinish = () => {
    onComplete(foundClues.length);
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
        onMessage={handleMessage}
        state={audioState}
        transcription={transcription}
      />

      {showSuccess && <SuccessFeedback clueName={lastClue} />}
    </div>
  );
}
