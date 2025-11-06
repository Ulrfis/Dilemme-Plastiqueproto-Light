import { useState } from "react";
import TitleScreen from "@/components/TitleScreen";
import VideoIntro from "@/components/VideoIntro";
import WelcomeSetup from "@/components/WelcomeSetup";
import TutorialScreen from "@/components/TutorialScreen";
import ScoreScreen from "@/components/ScoreScreen";

type Screen = 'title' | 'video' | 'welcome' | 'tutorial' | 'score';

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('title');
  const [userName, setUserName] = useState('');
  const [score, setScore] = useState(0);
  const [foundClues, setFoundClues] = useState<string[]>([]);

  const handleStart = () => {
    setCurrentScreen('video');
  };

  const handleVideoComplete = () => {
    setCurrentScreen('welcome');
  };

  const handleWelcomeComplete = (name: string) => {
    setUserName(name);
    setCurrentScreen('tutorial');
  };

  const handleTutorialComplete = (finalScore: number) => {
    setScore(finalScore);
    const allClues = ['ADN', 'bébé', 'penseur de Rodin', 'plastique'];
    setFoundClues(allClues.slice(0, finalScore));
    setCurrentScreen('score');
  };

  const handleReplay = () => {
    setScore(0);
    setFoundClues([]);
    setCurrentScreen('tutorial');
  };

  const handleNextLevel = () => {
    console.log('Next level - Not implemented in prototype');
  };

  return (
    <>
      {currentScreen === 'title' && <TitleScreen onStart={handleStart} />}
      {currentScreen === 'video' && <VideoIntro onComplete={handleVideoComplete} />}
      {currentScreen === 'welcome' && <WelcomeSetup onStart={handleWelcomeComplete} />}
      {currentScreen === 'tutorial' && (
        <TutorialScreen userName={userName} onComplete={handleTutorialComplete} />
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
    </>
  );
}
