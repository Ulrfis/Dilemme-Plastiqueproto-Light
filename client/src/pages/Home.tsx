import { useState } from "react";
import TitleScreen from "@/components/TitleScreen";
import VideoIntro from "@/components/VideoIntro";
import WelcomeSetup from "@/components/WelcomeSetup";
import TutorialScreen from "@/components/TutorialScreen";
import ScoreScreen from "@/components/ScoreScreen";
import { createSession } from "@/lib/api";
import { MediaProvider } from "@/contexts/MediaContext";

type Screen = 'title' | 'video' | 'welcome' | 'tutorial' | 'score';

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('title');
  const [userName, setUserName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [score, setScore] = useState(0);
  const [foundClues, setFoundClues] = useState<string[]>([]);

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
    setScore(finalScore);
    setFoundClues(clues);
    setCurrentScreen('score');
  };

  const handleReplay = async () => {
    try {
      const session = await createSession({
        userName: userName,
        foundClues: [],
        score: 0,
        audioMode: 'voice',
        completed: 0,
      });
      
      setSessionId(session.id);
      setScore(0);
      setFoundClues([]);
      setCurrentScreen('tutorial');
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  const handleNextLevel = () => {
    console.log('Next level - Not implemented in prototype');
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
      {currentScreen === 'score' && (
        <ScoreScreen
          score={score}
          totalClues={4}
          foundClues={foundClues}
          userName={userName}
          onReplay={handleReplay}
          onNextLevel={handleNextLevel}
        />
      )}
    </MediaProvider>
  );
}
