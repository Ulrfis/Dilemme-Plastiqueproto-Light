import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Heart, Clock, TrendingUp, MessageSquare, CheckCircle, MessageCircle } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { TutorialSession } from "@shared/schema";
import FeedbackSurvey from "@/components/FeedbackSurvey";

type SortOption = 'recent' | 'upvotes';

function formatTimeAgo(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function SynthesisCard({ session, onUpvote, upvoting }: {
  session: TutorialSession;
  onUpvote: (id: string) => void;
  upvoting: boolean;
}) {
  const clueCount = session.foundClues.length;
  const isComplete = clueCount === 4;
  const [isExpanded, setIsExpanded] = useState(false);

  const synthesisText = session.finalSynthesis || '';
  const isLongText = synthesisText.length > 280;
  const displayText = isExpanded || !isLongText
    ? synthesisText
    : synthesisText.slice(0, 280);

  return (
    <Card
      className="overflow-visible"
      data-testid={`card-synthesis-${session.id}`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-foreground truncate"
            data-testid={`text-username-${session.id}`}
          >
            {session.userName || 'Anonyme'}
          </p>
          <p
            className="text-xs text-muted-foreground mt-0.5"
            data-testid={`text-time-${session.id}`}
          >
            {formatTimeAgo(session.completedAt)}
          </p>
        </div>
        <Badge
          variant={isComplete ? "default" : "secondary"}
          className="shrink-0"
          data-testid={`badge-clues-${session.id}`}
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          {clueCount}/4
        </Badge>
      </CardHeader>
      <CardContent className="py-3">
        <blockquote
          className="text-sm text-foreground/90 leading-relaxed italic border-l-2 border-primary/30 pl-3"
          data-testid={`text-synthesis-${session.id}`}
        >
          "{displayText}"
          {isLongText && !isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className="text-primary font-medium not-italic hover:underline ml-1"
              data-testid={`button-expand-${session.id}`}
            >
              ... (voir plus)
            </button>
          )}
          {isLongText && isExpanded && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-primary font-medium not-italic hover:underline ml-1 block mt-1"
              data-testid={`button-collapse-${session.id}`}
            >
              (voir moins)
            </button>
          )}
        </blockquote>
      </CardContent>
      <CardFooter className="flex justify-between items-center pt-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1" data-testid={`text-messages-${session.id}`}>
            <MessageSquare className="w-3.5 h-3.5" />
            {session.messageCount || 0}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary"
          onClick={() => onUpvote(session.id)}
          disabled={upvoting}
          data-testid={`button-upvote-${session.id}`}
        >
          <Heart 
            className={`w-4 h-4 transition-colors ${session.upvotes > 0 ? 'text-pink-500 fill-pink-500' : ''}`} 
          />
          <span data-testid={`text-upvotes-${session.id}`}>{session.upvotes || 0}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}

function SynthesesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <div className="flex-1">
              <Skeleton className="h-5 w-24 mb-1" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-5 w-12" />
          </CardHeader>
          <CardContent className="py-3">
            <Skeleton className="h-12 w-full" />
          </CardContent>
          <CardFooter className="flex justify-between items-center pt-2">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-8 w-16" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// Plastic-style feedback button
function PlasticFeedbackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
      style={{
        background: 'linear-gradient(135deg, #29B6F6 0%, #0288D1 50%, #01579B 100%)',
        boxShadow: '0 4px 15px rgba(2, 136, 209, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
        border: '2px solid #0277BD',
      }}
      data-testid="button-feedback"
    >
      <MessageCircle className="w-6 h-6" />
      Donner votre avis sur l'expérience !
    </button>
  );
}

export default function Syntheses() {
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [upvotingId, setUpvotingId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCompleted, setFeedbackCompleted] = useState(false);

  const { data: syntheses, isLoading, isError, refetch } = useQuery<TutorialSession[]>({
    queryKey: ['/api/syntheses', `?sort=${sortBy}`],
  });

  const upvoteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      setUpvotingId(sessionId);
      const res = await apiRequest('POST', `/api/syntheses/${sessionId}/upvote`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
    },
    onSettled: () => {
      setUpvotingId(null);
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between px-4 py-3 max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Retour
            </Button>
          </Link>
          <h1 className="font-semibold text-lg" data-testid="text-page-title">Synthèses</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant={sortBy === 'recent' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('recent')}
            data-testid="button-sort-recent"
          >
            <Clock className="w-4 h-4 mr-1" />
            Récentes
          </Button>
          <Button
            variant={sortBy === 'upvotes' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('upvotes')}
            data-testid="button-sort-upvotes"
          >
            <TrendingUp className="w-4 h-4 mr-1" />
            Populaires
          </Button>
        </div>

        {isLoading && <SynthesesSkeleton />}

        {isError && (
          <Card className="p-6 text-center">
            <p className="text-destructive" data-testid="text-error">
              Erreur lors du chargement des synthèses
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/syntheses'] })}
              data-testid="button-retry"
            >
              Réessayer
            </Button>
          </Card>
        )}

        {!isLoading && !isError && syntheses && syntheses.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground" data-testid="text-empty">
              Aucune synthèse pour le moment. Soyez le premier à partager votre découverte !
            </p>
            <Link href="/">
              <Button className="mt-4" data-testid="button-start">
                Commencer
              </Button>
            </Link>
          </Card>
        )}

        {!isLoading && !isError && syntheses && syntheses.length > 0 && (
          <div className="space-y-4" data-testid="list-syntheses">
            {syntheses.map((session) => (
              <SynthesisCard
                key={session.id}
                session={session}
                onUpvote={(id) => upvoteMutation.mutate(id)}
                upvoting={upvotingId === session.id}
              />
            ))}
          </div>
        )}

        {/* Feedback button - always visible at bottom */}
        {!feedbackCompleted && (
          <div className="mt-8 mb-4">
            <PlasticFeedbackButton onClick={() => setShowFeedback(true)} />
          </div>
        )}

        {feedbackCompleted && (
          <div className="mt-8 mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
            <p className="text-green-700 font-medium">✅ Merci pour ton avis !</p>
          </div>
        )}
      </main>

      {/* Feedback survey modal */}
      {showFeedback && (
        <FeedbackSurvey
          sessionId="anonymous"
          onClose={() => setShowFeedback(false)}
          onComplete={() => {
            setShowFeedback(false);
            setFeedbackCompleted(true);
          }}
        />
      )}
    </div>
  );
}
