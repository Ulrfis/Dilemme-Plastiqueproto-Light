import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Loader2, Send, Users, MessageCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SynthesisScreenProps {
  userName: string;
  sessionId: string;
  foundClues: string[];
  onShowFeedback: () => void;
}

export default function SynthesisScreen({ 
  userName, 
  sessionId, 
  foundClues,
  onShowFeedback 
}: SynthesisScreenProps) {
  const [synthesis, setSynthesis] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });

      audioChunksRef.current = [];
      
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        setIsTranscribing(true);
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const formData = new FormData();
          formData.append('audio', audioBlob, 'synthesis.webm');

          const response = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData,
          });

          if (response.ok) {
            const data = await response.json();
            if (data.text) {
              setSynthesis(prev => {
                const newText = prev ? prev + ' ' + data.text : data.text;
                return newText.slice(0, 1200);
              });
              toast({
                title: "Transcription r\u00e9ussie",
                description: "Votre message vocal a \u00e9t\u00e9 ajout\u00e9.",
              });
            }
          } else {
            throw new Error('Transcription failed');
          }
        } catch (error) {
          console.error('Transcription error:', error);
          toast({
            title: "Erreur de transcription",
            description: "Impossible de transcrire votre message vocal.",
            variant: "destructive",
          });
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      toast({
        title: "Erreur d'enregistrement",
        description: "Impossible d'acc\u00e9der au microphone.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSaveSynthesis = async () => {
    if (!sessionId) {
      toast({
        title: "Erreur",
        description: "Session non valide, veuillez recommencer.",
        variant: "destructive",
      });
      return;
    }
    
    if (!synthesis.trim()) {
      toast({
        title: "Synth\u00e8se vide",
        description: "\u00c9crivez votre phrase de synth\u00e8se avant de la partager.",
        variant: "destructive",
      });
      return;
    }
    
    if (hasSaved) {
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('POST', `/api/sessions/${sessionId}/synthesis`, { 
        finalSynthesis: synthesis.trim() 
      });
      
      setHasSaved(true);
      queryClient.invalidateQueries({ queryKey: ['/api/sessions', sessionId] });
      toast({
        title: "Synth\u00e8se partag\u00e9e!",
        description: "Votre phrase a \u00e9t\u00e9 ajout\u00e9e \u00e0 la collection.",
      });
    } catch (error) {
      console.error('Error saving synthesis:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder votre synth\u00e8se.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
      <div className="w-full max-w-md space-y-6 animate-scale-in">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading">
            Bravo {userName} !
          </h2>
          <p className="text-muted-foreground">
            Tu as d\u00e9couvert {foundClues.length} indices. Maintenant, raconte ce que tu as compris de l'\u0153uvre.
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-5 space-y-4">
          <div className="text-center">
            <h3 className="font-semibold text-lg mb-1">Ta synth\u00e8se</h3>
            <p className="text-sm text-muted-foreground">
              Dicte ou \u00e9cris une phrase qui r\u00e9sume ce que tu as d\u00e9couvert sur l'impact du plastique.
            </p>
          </div>
          
          <div className="relative">
            <Textarea
              placeholder="Ex: L'\u0153uvre montre comment le plastique menace notre sant\u00e9 et notre plan\u00e8te..."
              value={synthesis}
              onChange={(e) => setSynthesis(e.target.value)}
              className="min-h-[120px] resize-none rounded-xl pr-14 text-base"
              maxLength={1200}
              disabled={isRecording || isTranscribing || hasSaved}
              data-testid="input-synthesis"
            />
            
            <div className="absolute right-2 bottom-2">
              {isTranscribing ? (
                <div className="w-10 h-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              ) : isRecording ? (
                <Button
                  type="button"
                  onClick={stopRecording}
                  size="icon"
                  variant="destructive"
                  className="w-10 h-10 rounded-full animate-pulse"
                  data-testid="button-stop-voice"
                >
                  <Square className="w-4 h-4" />
                </Button>
              ) : !hasSaved ? (
                <Button
                  type="button"
                  onClick={startRecording}
                  size="icon"
                  variant="ghost"
                  className="w-10 h-10 rounded-full hover:bg-primary/10"
                  data-testid="button-start-voice"
                >
                  <Mic className="w-5 h-5 text-primary" />
                </Button>
              ) : null}
            </div>
          </div>
          
          {isRecording && (
            <div className="flex items-center justify-center gap-2 text-sm text-destructive animate-pulse">
              <span className="w-2 h-2 bg-destructive rounded-full"></span>
              Enregistrement en cours... Appuyez pour arr\u00eater
            </div>
          )}
          
          {!hasSaved && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {synthesis.length}/1200 caract\u00e8res
              </span>
              <Button
                onClick={handleSaveSynthesis}
                disabled={isSaving || !synthesis.trim() || isRecording || isTranscribing}
                className="rounded-xl"
                data-testid="button-share-synthesis"
              >
                {isSaving ? (
                  "Envoi..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-1" />
                    Partager
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {hasSaved && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <p className="font-medium">Synth\u00e8se partag\u00e9e !</p>
            </div>
            {synthesis && (
              <blockquote className="text-sm text-foreground/90 leading-relaxed italic border-l-2 border-primary/30 pl-3">
                "{synthesis}"
              </blockquote>
            )}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Link href="/syntheses" className="block">
            <Button
              variant="outline"
              size="lg"
              className="w-full rounded-xl"
              data-testid="button-view-syntheses"
            >
              <Users className="w-4 h-4 mr-2" />
              Voir les autres phrases
            </Button>
          </Link>

          <button
            onClick={onShowFeedback}
            className="w-full py-5 px-6 rounded-2xl text-white font-bold text-lg shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
            style={{
              background: 'linear-gradient(135deg, #29B6F6 0%, #0288D1 50%, #01579B 100%)',
              boxShadow: '0 4px 15px rgba(2, 136, 209, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
              border: '2px solid #0277BD',
            }}
            data-testid="button-feedback"
          >
            <MessageCircle className="w-5 h-5" />
            Donner mon avis sur l'exp\u00e9rience
          </button>
        </div>
      </div>
    </div>
  );
}
