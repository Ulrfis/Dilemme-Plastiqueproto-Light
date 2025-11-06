import TitleScreen from '../TitleScreen';

export default function TitleScreenExample() {
  return (
    <TitleScreen 
      onStart={() => console.log('Start clicked')} 
    />
  );
}
