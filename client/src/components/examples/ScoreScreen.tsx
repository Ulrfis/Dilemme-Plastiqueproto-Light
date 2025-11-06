import ScoreScreen from '../ScoreScreen';

export default function ScoreScreenExample() {
  return (
    <ScoreScreen 
      score={3}
      totalClues={4}
      foundClues={['ADN', 'bébé', 'penseur de Rodin']}
      userName="Alice"
      onReplay={() => console.log('Replay clicked')}
      onNextLevel={() => console.log('Next level clicked')}
    />
  );
}
