import { useState } from "react";
import TitleScreen from "@/components/TitleScreen";
import VideoIntro from "@/components/VideoIntro";
import WelcomeSetup from "@/components/WelcomeSetup";
import TutorialScreen from "@/components/TutorialScreen";
import DragDropGame from "@/components/DragDropGame";
import SynthesisScreen from "@/components/SynthesisScreen";
import FeedbackSurvey from "@/components/FeedbackSurvey";
import { createSession } from "@/lib/api";
import { MediaProvider } from "@/contexts/MediaContext";

type Screen = 'title' | 'video' | 'welcome' | 'tutorial' | 'game' | 'synthesis' | 'complete';

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('title');
  const [userName, setUserName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [foundClues, setFoundClues] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCompleted, setFeedbackCompleted] = useState(false);

  const handleStart = () => {
    setCurrentScreen('video');
  };

  const handleVideoComplete = () => {
    setCurrentScreen('welcome');
  };

  const handleWelcomeComplete = async (name: string) => {
    setUserName(name);
    
    try {
      const session = await createSession({
        userName: name,
        foundClues: [],
        score: 0,
        audioMode: 'voice',
        completed: 0,
      });
      
      setSessionId(session.id);
      setCurrentScreen('tutorial');
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleTutorialComplete = (finalScore: number, clues: string[]) => {
    setFoundClues(clues);
    setCurrentScreen('game');
  };

  const handleGameComplete = () => {
    setCurrentScreen('synthesis');
  };

  const handleShowFeedback = () => {
    setShowFeedback(true);
  };

  const handleFeedbackComplete = () => {
    setShowFeedback(false);
    setFeedbackCompleted(true);
    setCurrentScreen('complete');
  };

  const handleReplay = async () => {
    console.log('[Home] Replay button clicked - resetting to title screen');
    setUserName('');
    setSessionId('');
    setFoundClues([]);
    setFeedbackCompleted(false);
    setCurrentScreen('title');
  };

  return (
    <MediaProvider>
      {currentScreen === 'title' && <TitleScreen onStart={handleStart} />}
      {currentScreen === 'video' && <VideoIntro onComplete={handleVideoComplete} />}
      {currentScreen === 'welcome' && <WelcomeSetup onStart={handleWelcomeComplete} />}
      {currentScreen === 'tutorial' && sessionId && (
        <TutorialScreen
          sessionId={sessionId}
          userName={userName}
          onComplete={handleTutorialComplete}
        />
      )}
      {currentScreen === 'game' && (
        <DragDropGame
          userName={userName}
          onComplete={handleGameComplete}
        />
      )}
      {currentScreen === 'synthesis' && (
        <SynthesisScreen
          userName={userName}
          sessionId={sessionId}
          foundClues={foundClues}
          onShowFeedback={handleShowFeedback}
        />
      )}
      {currentScreen === 'complete' && (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
          <div className="w-full max-w-md space-y-6 text-center animate-scale-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold font-heading">Merci {userName} !</h2>
            <p className="text-muted-foreground text-lg">
              Tu as terminé l'expérience Dilemme Plastique.
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-green-700 font-medium">Merci pour ta participation !</p>
            </div>
          </div>
        </div>
      )}

      {showFeedback && (
        <FeedbackSurvey
          sessionId={sessionId}
          userName={userName}
          onClose={() => setShowFeedback(false)}
          onComplete={handleFeedbackComplete}
        />
      )}
    </MediaProvider>
  );
}
