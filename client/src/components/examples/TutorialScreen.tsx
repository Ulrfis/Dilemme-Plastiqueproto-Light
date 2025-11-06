import TutorialScreen from '../TutorialScreen';

export default function TutorialScreenExample() {
  return (
    <TutorialScreen 
      sessionId="demo-session-id"
      userName="Alice"
      onComplete={(score, clues) => console.log('Tutorial completed with score:', score, 'clues:', clues)} 
    />
  );
}
