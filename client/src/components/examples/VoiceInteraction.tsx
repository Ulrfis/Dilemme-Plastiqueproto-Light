import { useState } from 'react';
import VoiceInteraction from '../VoiceInteraction';

export default function VoiceInteractionExample() {
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'playing'>('idle');
  const [transcription, setTranscription] = useState('');

  const handleMessage = (msg: string) => {
    console.log('Message:', msg);
    if (msg === 'voice-recording-started') {
      setState('recording');
      setTimeout(() => {
        setState('processing');
        setTimeout(() => {
          setTranscription('Ceci est un test de transcription');
          setState('playing');
          setTimeout(() => setState('idle'), 2000);
        }, 1000);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <VoiceInteraction 
        onMessage={handleMessage}
        state={state}
        transcription={transcription}
      />
    </div>
  );
}
