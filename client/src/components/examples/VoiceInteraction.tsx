import { useState } from 'react';
import VoiceInteraction from '../VoiceInteraction';

export default function VoiceInteractionExample() {
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'playing'>('idle');
  const [transcription, setTranscription] = useState('');

  const handleStartRecording = () => {
    console.log('Start recording');
    setState('recording');
    setTimeout(() => {
      setState('processing');
      setTimeout(() => {
        setTranscription('Ceci est un test de transcription');
        setState('playing');
        setTimeout(() => setState('idle'), 2000);
      }, 1000);
    }, 2000);
  };

  const handleStopRecording = () => {
    console.log('Stop recording');
    setState('processing');
  };

  const handleSendText = (text: string) => {
    console.log('Text message:', text);
  };

  return (
    <div className="min-h-screen bg-background">
      <VoiceInteraction 
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onSendText={handleSendText}
        state={state}
        transcription={transcription}
      />
    </div>
  );
}
