import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Trophy, RotateCcw, Send, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { TutorialSession } from "@shared/schema";

interface ScoreScreenProps {
  score: number;
  totalClues: number;
  foundClues: string[];
  userName: string;
  sessionId: string;
  onReplay: () => void;
  onNextLevel?: () => void;
}

export default function ScoreScreen({ 
  score, 
  totalClues, 
  foundClues, 
  userName, 
  sessionId,
  onReplay,
  onNextLevel 
}: ScoreScreenProps) {
  const [synthesis, setSynthesis] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const { toast } = useToast();

  const { data: sessionData } = useQuery<TutorialSession>({
    queryKey: ['/api/sessions', sessionId],
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (sessionData?.finalSynthesis) {
      setSynthesis(sessionData.finalSynthesis);
      setHasSaved(true);
    }
  }, [sessionData]);
  
  const percentage = Math.round((score / totalClues) * 100);
  const isPerfectScore = score === totalClues;
  
  const getFeedback = () => {
    if (percentage === 100) return "Parfait! Vous avez tout trouvé!";
    if (percentage >= 75) return "Excellent travail!";
    if (percentage >= 50) return "Bien joué!";
    return "Continuez vos efforts!";
  };

  const allClues = ['ADN', 'bébé', 'penseur de Rodin', 'plastique'];

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
        title: "Synthèse vide",
        description: "Écrivez votre phrase de synthèse avant de la partager.",
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
        title: "Synthèse partagée!",
        description: "Votre phrase a été ajoutée à la collection.",
      });
    } catch (error) {
      console.error('Error saving synthesis:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder votre synthèse.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
      <div className="w-full max-w-md space-y-6 animate-scale-in">
        <div className="flex flex-col items-center space-y-4">
          <Trophy className="w-20 h-20 text-primary" />
          <h2 className="text-4xl font-bold font-heading">Félicitations {userName}!</h2>
          <p className="text-lg text-muted-foreground text-center">{getFeedback()}</p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-6 space-y-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Votre score</p>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-6xl font-bold text-primary" data-testid="text-score">{score}</span>
              <span className="text-3xl text-muted-foreground">/ {totalClues}</span>
            </div>
            <Badge variant="secondary" className="text-base px-4 py-1">
              {percentage}%
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Indices:</p>
            <div className="space-y-2">
              {allClues.map((clue, index) => {
                const found = foundClues.includes(clue);
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      found 
                        ? 'bg-primary/5 border-primary/20' 
                        : 'bg-muted/30 border-border'
                    }`}
                    data-testid={`clue-result-${index}`}
                  >
                    {found ? (
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className={found ? 'font-medium' : 'text-muted-foreground'}>
                      {clue}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {isPerfectScore && !hasSaved && (
          <div className="bg-card border border-primary/30 rounded-2xl p-5 space-y-4">
            <div className="text-center">
              <h3 className="font-semibold text-lg mb-1">Partagez votre synthèse</h3>
              <p className="text-sm text-muted-foreground">
                Vous avez trouvé tous les indices! Écrivez une phrase qui résume ce que vous avez découvert.
              </p>
            </div>
            <Textarea
              placeholder="Ex: L'ADN, comme le bébé, est une promesse d'avenir que le plastique menace..."
              value={synthesis}
              onChange={(e) => setSynthesis(e.target.value)}
              className="min-h-[100px] resize-none rounded-xl"
              maxLength={280}
              data-testid="input-synthesis"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {synthesis.length}/280 caractères
              </span>
              <Button
                onClick={handleSaveSynthesis}
                disabled={isSaving || !synthesis.trim()}
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
          </div>
        )}

        {hasSaved && isPerfectScore && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <p className="font-medium">Synthèse partagée!</p>
            </div>
            {synthesis && (
              <blockquote className="text-sm text-foreground/90 leading-relaxed italic border-l-2 border-primary/30 pl-3">
                "{synthesis}"
              </blockquote>
            )}
            <div className="text-center">
              <Link href="/syntheses">
                <Button variant="outline" size="sm" className="rounded-xl" data-testid="button-view-syntheses">
                  <Users className="w-4 h-4 mr-1" />
                  Voir toutes les synthèses
                </Button>
              </Link>
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button
            onClick={onReplay}
            variant="outline"
            className="w-full rounded-2xl text-base py-6"
            data-testid="button-replay"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Rejouer le tutoriel
          </Button>
          
          <Link href="/syntheses" className="block">
            <Button
              variant="ghost"
              className="w-full rounded-2xl text-sm"
              data-testid="button-browse-syntheses"
            >
              <Users className="w-4 h-4 mr-1" />
              Découvrir les synthèses des autres
            </Button>
          </Link>
          
          {onNextLevel && (
            <Button
              onClick={onNextLevel}
              className="w-full rounded-2xl text-base py-6"
              data-testid="button-next-level"
            >
              Niveau 1 - Pollution dans la mer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
