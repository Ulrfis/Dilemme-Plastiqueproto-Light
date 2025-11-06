import TutorialScreen from '../TutorialScreen';

export default function TutorialScreenExample() {
  return (
    <TutorialScreen 
      userName="Alice"
      onComplete={(score) => console.log('Tutorial completed with score:', score)} 
    />
  );
}
