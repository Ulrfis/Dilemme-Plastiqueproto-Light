import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Trophy, RotateCcw } from "lucide-react";

interface ScoreScreenProps {
  score: number;
  totalClues: number;
  foundClues: string[];
  userName: string;
  onReplay: () => void;
  onNextLevel?: () => void;
}

export default function ScoreScreen({ 
  score, 
  totalClues, 
  foundClues, 
  userName, 
  onReplay,
  onNextLevel 
}: ScoreScreenProps) {
  const percentage = Math.round((score / totalClues) * 100);
  
  const getFeedback = () => {
    if (percentage === 100) return "Parfait! Vous avez tout trouvé!";
    if (percentage >= 75) return "Excellent travail!";
    if (percentage >= 50) return "Bien joué!";
    return "Continuez vos efforts!";
  };

  const allClues = ['ADN', 'bébé', 'penseur de Rodin', 'plastique'];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
      <div className="w-full max-w-md space-y-8 animate-scale-in">
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

        <div className="space-y-3">
          <Button
            onClick={onReplay}
            variant="outline"
            className="w-full rounded-2xl text-base py-6"
            data-testid="button-replay"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Rejouer le tutoriel
          </Button>
          
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
