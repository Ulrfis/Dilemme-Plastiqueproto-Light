import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Check, X, Share2, ExternalLink } from "lucide-react";

interface FeedbackSurveyProps {
  sessionId: string;
  userName?: string;
  onClose: () => void;
  onComplete: () => void;
}

interface FeedbackData {
  sessionId: string;
  userName?: string;
  scenarioComprehension?: number;
  scenarioObjectives?: number;
  scenarioClueLink?: number;
  gameplayExplanation?: number;
  gameplaySimplicity?: number;
  gameplayBotResponses?: number;
  feelingOriginality?: number;
  feelingPleasant?: number;
  feelingInteresting?: number;
  motivationContinue?: number;
  motivationGameplay?: number;
  motivationEcology?: number;
  interfaceVisualBeauty?: number;
  interfaceVisualClarity?: number;
  interfaceVoiceChat?: number;
  overallRating?: number;
  improvements?: string;
  wantsUpdates?: boolean;
  updateEmail?: string;
  wouldRecommend?: boolean;
  wantsInSchool?: boolean;
}

// Question types
type QuestionType = 'rating' | 'text' | 'yesno' | 'yesno-email' | 'yesno-share';

interface Question {
  id: string;
  category: string;
  question: string;
  type: QuestionType;
  field: keyof FeedbackData;
}

const QUESTIONS: Question[] = [
  // Scénario
  { id: 's1', category: 'Scénario', question: "L'histoire est facile à comprendre.", type: 'rating', field: 'scenarioComprehension' },
  { id: 's2', category: 'Scénario', question: "Les objectifs sont clairs.", type: 'rating', field: 'scenarioObjectives' },
  { id: 's3', category: 'Scénario', question: "Le lien entre les indices et la pollution plastique est bien mis en évidence.", type: 'rating', field: 'scenarioClueLink' },
  // Gameplay
  { id: 'g1', category: 'Gameplay', question: "Le principe de jeu est bien expliqué.", type: 'rating', field: 'gameplayExplanation' },
  { id: 'g2', category: 'Gameplay', question: "Il est simple de comprendre le principe.", type: 'rating', field: 'gameplaySimplicity' },
  { id: 'g3', category: 'Gameplay', question: "Peter_bot répond intelligemment pour faire progresser l'enquête.", type: 'rating', field: 'gameplayBotResponses' },
  // Feeling
  { id: 'f1', category: 'Feeling', question: "Le principe de jeu est original.", type: 'rating', field: 'feelingOriginality' },
  { id: 'f2', category: 'Feeling', question: "Le principe de jeu est plaisant.", type: 'rating', field: 'feelingPleasant' },
  { id: 'f3', category: 'Feeling', question: "Le jeu est intéressant.", type: 'rating', field: 'feelingInteresting' },
  // Motivation
  { id: 'm1', category: 'Motivation', question: "Le tutoriel donne envie de continuer.", type: 'rating', field: 'motivationContinue' },
  { id: 'm2', category: 'Motivation', question: "Le principe de jeu est motivant.", type: 'rating', field: 'motivationGameplay' },
  { id: 'm3', category: 'Motivation', question: "Le thème écologique est motivant.", type: 'rating', field: 'motivationEcology' },
  // Interface
  { id: 'i1', category: 'Interface', question: "Le contenu visuel est joli.", type: 'rating', field: 'interfaceVisualBeauty' },
  { id: 'i2', category: 'Interface', question: "Le contenu visuel est clair.", type: 'rating', field: 'interfaceVisualClarity' },
  { id: 'i3', category: 'Interface', question: "La discussion vocale est agréable.", type: 'rating', field: 'interfaceVoiceChat' },
  // Bilan et perspectives
  { id: 'o1', category: "Bilan et perspectives", question: "Quelle note donnerais-tu à ce tutoriel ?", type: 'rating', field: 'overallRating' },
  { id: 't1', category: "Bilan et perspectives", question: "Quelles améliorations verrais-tu ?", type: 'text', field: 'improvements' },
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
  const labels = ['Pas du tout', '', '', '', '', 'Tout à fait'];
  
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex justify-between mb-2 text-xs text-muted-foreground">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((num) => (
          <button
            key={num}
            onClick={() => onChange(num)}
            className={`flex-1 h-14 rounded-xl text-lg font-bold transition-all duration-200 ${
              value === num
                ? 'bg-primary text-primary-foreground scale-110 shadow-lg'
                : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
            }`}
          >
            {num}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>{labels[0]}</span>
        <span>{labels[5]}</span>
      </div>
    </div>
  );
}

// Yes/No buttons
function YesNoButtons({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex gap-4 justify-center">
      <button
        onClick={() => onChange(true)}
        className={`px-8 py-4 rounded-xl text-lg font-bold transition-all duration-200 flex items-center gap-2 ${
          value === true
            ? 'bg-green-500 text-white scale-105 shadow-lg'
            : 'bg-secondary hover:bg-green-100 text-secondary-foreground'
        }`}
      >
        <Check className="w-5 h-5" /> Oui
      </button>
      <button
        onClick={() => onChange(false)}
        className={`px-8 py-4 rounded-xl text-lg font-bold transition-all duration-200 flex items-center gap-2 ${
          value === false
            ? 'bg-red-500 text-white scale-105 shadow-lg'
            : 'bg-secondary hover:bg-red-100 text-secondary-foreground'
        }`}
      >
        <X className="w-5 h-5" /> Non
      </button>
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
    return currentQuestions.every(question => {
      const value = feedbackData[question.field];
      if (question.type === 'text') return true; // Optional
      if (question.type === 'yesno' || question.type === 'yesno-email' || question.type === 'yesno-share') {
        return value !== undefined;
      }
      return value !== undefined;
    });
  };

  const handleShare = () => {
    const url = 'https://proto-dilemme2.edugami.app/syntheses';
    if (navigator.share) {
      navigator.share({ title: 'Dilemme Plastique', url });
    } else {
      window.open(url, '_blank');
    }
  };

  if (showThankYou) {
    return (
      <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
        <div className="text-center p-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Merci pour ton avis ! 🙏</h2>
          <p className="text-muted-foreground">Tes réponses nous aident à améliorer le jeu.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header with progress */}
      <div className="sticky top-0 bg-background border-b p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-6 h-6" />
            </button>
            <span className="text-sm text-muted-foreground">{currentChapterIndex + 1} / {totalChapters}</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300" key={currentChapterIndex}>
          {/* Chapter title */}
          <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">{currentChapter.name}</h1>

          {/* Questions in this chapter */}
          <div className="space-y-8">
            {currentQuestions.map((question) => (
              <div key={question.id} className="bg-card border rounded-xl p-6 shadow-sm">
                <h2 className="text-lg md:text-xl font-semibold mb-6 text-left">{question.question}</h2>

                {question.type === 'rating' && (
                  <RatingSlider
                    value={feedbackData[question.field] as number | undefined}
                    onChange={(v) => updateField(question.field, v)}
                  />
                )}

                {question.type === 'text' && (
                  <Textarea
                    placeholder="Partage tes idées... (optionnel)"
                    className="min-h-32 text-base"
                    value={(feedbackData[question.field] as string) || ''}
                    onChange={(e) => updateField(question.field, e.target.value)}
                  />
                )}

                {(question.type === 'yesno' || question.type === 'yesno-email' || question.type === 'yesno-share') && (
                  <div className="space-y-4">
                    <YesNoButtons
                      value={feedbackData[question.field] as boolean | undefined}
                      onChange={(v) => updateField(question.field, v)}
                    />

                    {question.type === 'yesno-email' && feedbackData.wantsUpdates === true && (
                      <div className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                        <Input
                          type="email"
                          placeholder="Ton email..."
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="text-center text-base"
                        />
                      </div>
                    )}

                    {question.type === 'yesno-share' && feedbackData.wouldRecommend === true && (
                      <div className="mt-6 animate-in fade-in slide-in-from-bottom-2">
                        <Button onClick={handleShare} variant="outline" className="gap-2">
                          <Share2 className="w-4 h-4" /> Partager le jeu
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sticky bottom-0 bg-background border-t p-4">
        <div className="max-w-3xl mx-auto flex justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentChapterIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Précédent
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed() || submitMutation.isPending}
          >
            {currentChapterIndex === totalChapters - 1 ? (
              submitMutation.isPending ? 'Envoi...' : 'Terminer'
            ) : (
              <>Suivant <ChevronRight className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

