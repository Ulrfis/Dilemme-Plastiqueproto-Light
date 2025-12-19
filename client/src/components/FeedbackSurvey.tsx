import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { captureEvent } from "@/App";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Check, X, Share2, ExternalLink, Mic, MicOff, Loader2 } from "lucide-react";

interface FeedbackSurveyProps {
  sessionId: string;
  userName?: string;
  onClose: () => void;
  onComplete: () => void;
}

interface FeedbackData {
  sessionId: string;
  userName?: string;
  gameplayExplanation?: number;
  gameplaySimplicity?: number;
  gameplayBotResponses?: number;
  gameplayVoiceChat?: number;
  feelingOriginality?: number;
  feelingPleasant?: number;
  feelingInteresting?: number;
  motivationContinue?: number;
  motivationGameplay?: number;
  motivationEcology?: number;
  overallRating?: number;
  improvements?: string;
  wantsUpdates?: boolean;
  updateEmail?: string;
  wouldRecommend?: boolean;
  wantsInSchool?: boolean;
}

// Question types
type QuestionType = 'rating' | 'text' | 'text-voice' | 'yesno' | 'yesno-email' | 'yesno-share';

interface Question {
  id: string;
  category: string;
  question: string;
  type: QuestionType;
  field: keyof FeedbackData;
}

const QUESTIONS: Question[] = [
  // Gameplay (start directly here, removed Scénario)
  { id: 'g1', category: 'Gameplay', question: "Le principe de jeu est bien expliqué.", type: 'rating', field: 'gameplayExplanation' },
  { id: 'g2', category: 'Gameplay', question: "Il est simple de jouer.", type: 'rating', field: 'gameplaySimplicity' },
  { id: 'g3', category: 'Gameplay', question: "Peter répond intelligemment pour faire progresser l'enquête.", type: 'rating', field: 'gameplayBotResponses' },
  { id: 'g4', category: 'Gameplay', question: "La discussion vocale est agréable.", type: 'rating', field: 'gameplayVoiceChat' },
  // Feeling
  { id: 'f1', category: 'Feeling', question: "Le principe de jeu est original.", type: 'rating', field: 'feelingOriginality' },
  { id: 'f2', category: 'Feeling', question: "Le principe de jeu est plaisant.", type: 'rating', field: 'feelingPleasant' },
  { id: 'f3', category: 'Feeling', question: "Le jeu est intéressant.", type: 'rating', field: 'feelingInteresting' },
  // Motivation
  { id: 'm1', category: 'Motivation', question: "Le tutoriel donne envie de continuer.", type: 'rating', field: 'motivationContinue' },
  { id: 'm2', category: 'Motivation', question: "Le principe de jeu est motivant.", type: 'rating', field: 'motivationGameplay' },
  { id: 'm3', category: 'Motivation', question: "Le thème écologique est motivant.", type: 'rating', field: 'motivationEcology' },
  // Bilan et perspectives (removed Interface page)
  { id: 'o1', category: "Bilan et perspectives", question: "Quelle note donnerais-tu à ce prototype ?", type: 'rating', field: 'overallRating' },
  { id: 't1', category: "Bilan et perspectives", question: "Quelles améliorations verrais-tu ?", type: 'text-voice', field: 'improvements' },
  { id: 'y2', category: "Bilan et perspectives", question: "Recommanderais-tu ce jeu à un ami ?", type: 'yesno-share', field: 'wouldRecommend' },
  { id: 'y3', category: 'Bilan et perspectives', question: "Aimerais-tu que ce jeu soit utilisé à l'école ?", type: 'yesno', field: 'wantsInSchool' },
  { id: 'y1', category: 'Bilan et perspectives', question: "Veux-tu être au courant lors de la sortie du jeu ?", type: 'yesno-email', field: 'wantsUpdates' },
];

// Group questions by category while preserving order
interface Chapter {
  name: string;
  questions: Question[];
}

const CHAPTERS: Chapter[] = [];
const seenCategories = new Set<string>();

for (const question of QUESTIONS) {
  if (!seenCategories.has(question.category)) {
    seenCategories.add(question.category);
    CHAPTERS.push({
      name: question.category,
      questions: QUESTIONS.filter(q => q.category === question.category),
    });
  }
}

// Rating slider component
function RatingSlider({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5, 6].map((num) => (
          <button
            key={num}
            onClick={() => onChange(num)}
            data-testid={`rating-button-${num}`}
            className={`flex-1 h-10 rounded-lg text-sm font-bold transition-all duration-200 ${
              value === num
                ? 'bg-primary text-primary-foreground scale-105 shadow-md'
                : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
            }`}
          >
            {num}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
        <span>Pas du tout</span>
        <span>Tout à fait</span>
      </div>
    </div>
  );
}

// Yes/No buttons
function YesNoButtons({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-3 justify-center">
      <button
        onClick={() => onChange(true)}
        data-testid="button-yes"
        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-1.5 ${
          value === true
            ? 'bg-green-500 text-white scale-105 shadow-md'
            : 'bg-secondary hover:bg-green-100 text-secondary-foreground'
        }`}
      >
        <Check className="w-4 h-4" /> Oui
      </button>
      <button
        onClick={() => onChange(false)}
        data-testid="button-no"
        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-1.5 ${
          value === false
            ? 'bg-red-500 text-white scale-105 shadow-md'
            : 'bg-secondary hover:bg-red-100 text-secondary-foreground'
        }`}
      >
        <X className="w-4 h-4" /> Non
      </button>
    </div>
  );
}

// Voice input component for text fields
function VoiceTextInput({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  placeholder: string;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[VoiceTextInput] Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');

      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          // Append to existing text or set new text
          onChange(value ? `${value} ${data.text}` : data.text);
        }
      }
    } catch (error) {
      console.error('[VoiceTextInput] Transcription error:', error);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          placeholder={placeholder}
          className="min-h-20 text-sm pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="input-improvements"
        />
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          data-testid="button-voice-input"
          className={`absolute right-2 top-2 p-2 rounded-full transition-all duration-200 ${
            isRecording 
              ? 'bg-red-500 text-white animate-pulse' 
              : isTranscribing
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary hover:bg-primary/20'
          }`}
        >
          {isTranscribing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {isRecording ? "Parle maintenant... Clique pour arrêter" : isTranscribing ? "Transcription en cours..." : "Clique sur le micro pour dicter"}
      </p>
    </div>
  );
}

export default function FeedbackSurvey({ sessionId, userName, onClose, onComplete }: FeedbackSurveyProps) {
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [feedbackData, setFeedbackData] = useState<FeedbackData>({
    sessionId,
    userName,
  });
  const [email, setEmail] = useState('');
  const [showThankYou, setShowThankYou] = useState(false);

  const totalChapters = CHAPTERS.length;
  const progress = ((currentChapterIndex + 1) / totalChapters) * 100;
  const currentChapter = CHAPTERS[currentChapterIndex];
  const currentQuestions = currentChapter.questions;

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackData) => {
      const res = await apiRequest('POST', '/api/feedback', data);
      return res.json();
    },
    onSuccess: () => {
      captureEvent("feedback_submitted", {
        userName,
        sessionId,
      });
      setShowThankYou(true);
      setTimeout(() => {
        onComplete();
      }, 2000);
    },
  });

  const updateField = (field: keyof FeedbackData, value: any) => {
    setFeedbackData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentChapterIndex < totalChapters - 1) {
      setCurrentChapterIndex(prev => prev + 1);
    } else {
      // Submit
      const finalData = { ...feedbackData };
      if (feedbackData.wantsUpdates && email) {
        finalData.updateEmail = email;
      }
      console.log('[FeedbackSurvey] Submitting feedback data:', finalData);
      submitMutation.mutate(finalData);
    }
  };

  const handlePrev = () => {
    if (currentChapterIndex > 0) {
      setCurrentChapterIndex(prev => prev - 1);
    }
  };

  const canProceed = () => {
    // Check if all questions in the current chapter are answered
    const allAnswered = currentQuestions.every(question => {
      const value = feedbackData[question.field];
      if (question.type === 'text' || question.type === 'text-voice') return true; // Optional
      if (question.type === 'yesno' || question.type === 'yesno-email' || question.type === 'yesno-share') {
        return value !== undefined;
      }
      return value !== undefined;
    });

    // On last chapter, if user said yes to email updates, require email
    if (currentChapterIndex === totalChapters - 1 && feedbackData.wantsUpdates === true) {
      return allAnswered && email.trim().length > 0;
    }

    return allAnswered;
  };

  const handleShare = () => {
    const url = 'https://proto-dilemme2.edugami.app/';
    if (navigator.share) {
      navigator.share({ title: 'Dilemme Plastique', url });
    } else {
      window.open(url, '_blank');
    }
  };

  if (showThankYou) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center p-6 animate-in fade-in zoom-in duration-500">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-1">Merci pour ton avis !</h2>
          <p className="text-sm text-muted-foreground">Tes réponses nous aident beaucoup.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col h-screen overflow-hidden">
      {/* Header with progress */}
      <div className="flex-shrink-0 bg-background border-b px-3 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-1.5">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" data-testid="button-close-survey">
              <X className="w-5 h-5" />
            </button>
            <span className="text-xs text-muted-foreground">{currentChapterIndex + 1} / {totalChapters}</span>
          </div>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question content - scrollable area that includes navigation */}
      <div className="flex-1 px-3 py-2 overflow-y-auto min-h-0">
        <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300" key={currentChapterIndex}>
          {/* Chapter title */}
          <h1 className="text-xl sm:text-2xl font-bold mb-3 text-center">{currentChapter.name}</h1>

          {/* Questions in this chapter */}
          <div className="space-y-3">
            {currentQuestions.map((question) => (
              <div key={question.id} className="bg-card border rounded-lg p-3 shadow-sm">
                <h2 className="text-sm sm:text-base font-semibold mb-3 text-left">{question.question}</h2>

                {question.type === 'rating' && (
                  <RatingSlider
                    value={feedbackData[question.field] as number | undefined}
                    onChange={(v) => updateField(question.field, v)}
                  />
                )}

                {question.type === 'text' && (
                  <Textarea
                    placeholder="Partage tes idées... (optionnel)"
                    className="min-h-20 text-sm"
                    value={(feedbackData[question.field] as string) || ''}
                    onChange={(e) => updateField(question.field, e.target.value)}
                  />
                )}

                {question.type === 'text-voice' && (
                  <VoiceTextInput
                    value={(feedbackData[question.field] as string) || ''}
                    onChange={(v) => updateField(question.field, v)}
                    placeholder="Partage tes idées... (optionnel)"
                  />
                )}

                {(question.type === 'yesno' || question.type === 'yesno-email' || question.type === 'yesno-share') && (
                  <div className="space-y-2">
                    <YesNoButtons
                      value={feedbackData[question.field] as boolean | undefined}
                      onChange={(v) => updateField(question.field, v)}
                    />

                    {question.type === 'yesno-email' && feedbackData.wantsUpdates === true && (
                      <div className="mt-3 animate-in fade-in slide-in-from-bottom-2">
                        <div className="bg-primary/10 border-2 border-primary rounded-lg p-3">
                          <label className="block text-sm font-medium text-primary mb-2 text-center">
                            Entre ton email pour être informé :
                          </label>
                          <Input
                            type="email"
                            placeholder="ton.email@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="text-center text-sm bg-background border-primary/30 focus:border-primary"
                            data-testid="input-email"
                          />
                          {!email.trim() && (
                            <p className="text-xs text-destructive mt-1 text-center">
                              Email requis pour continuer
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {question.type === 'yesno-share' && feedbackData.wouldRecommend === true && (
                      <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 text-center">
                        <Button onClick={handleShare} variant="outline" size="sm" className="gap-1.5" data-testid="button-share">
                          <Share2 className="w-3.5 h-3.5" /> Partager
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation - placed directly below questions, not at bottom of screen */}
          <div className="mt-4 pb-4">
            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={currentChapterIndex === 0}
                data-testid="button-prev"
              >
                <ChevronLeft className="w-4 h-4 mr-0.5" /> Précédent
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                disabled={!canProceed() || submitMutation.isPending}
                data-testid="button-next"
              >
                {currentChapterIndex === totalChapters - 1 ? (
                  submitMutation.isPending ? 'Envoi...' : 'Terminer'
                ) : (
                  <>Suivant <ChevronRight className="w-4 h-4 ml-0.5" /></>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
