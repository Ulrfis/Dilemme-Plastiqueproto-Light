import { useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SessionFlowProvider, useSessionFlow } from "@/contexts/SessionFlowContext";
import { MediaProvider } from "@/contexts/MediaContext";
import TitleScreen from "@/components/TitleScreen";
import VideoIntro from "@/components/VideoIntro";
import WelcomeSetup from "@/components/WelcomeSetup";
import TutorialScreen from "@/components/TutorialScreen";
import DragDropGame from "@/components/DragDropGame";
import SynthesisScreen from "@/components/SynthesisScreen";
import FeedbackSurvey from "@/components/FeedbackSurvey";
import Syntheses from "@/pages/Syntheses";
import NotFound from "@/pages/not-found";
import { createSession } from "@/lib/api";

// PostHog is initialized via web snippet in index.html
// Use window.posthog for tracking - do NOT re-initialize here
declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify: (distinctId: string, properties?: Record<string, unknown>) => void;
      reset: () => void;
      get_distinct_id: () => string;
      get_property: (key: string) => unknown;
      debug: (enabled: boolean) => void;
      __loaded?: boolean;
      _i?: unknown[];
    };
    testPostHog?: () => void;
    dilemmeSessionStart?: number;
    dilemmeActionsCount?: number;
  }
}

// Identify user in PostHog with their name
export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (window.posthog) {
    window.posthog.identify(userId, properties);
    console.log(`[PostHog] ✅ Identified user: ${userId}`, properties);
    return true;
  } else {
    console.warn(`[PostHog] ⚠️ Not loaded, skipping identify for: ${userId}`);
    return false;
  }
}

// Session tracking - initialize on load
if (typeof window !== 'undefined') {
  window.dilemmeSessionStart = Date.now();
  window.dilemmeActionsCount = 0;
}

// Helper function to safely capture PostHog events
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  // Increment actions count for session tracking
  if (window.dilemmeActionsCount !== undefined) {
    window.dilemmeActionsCount++;
  }
  
  if (window.posthog) {
    window.posthog.capture(event, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
    console.log(`[PostHog] ✅ Captured event: ${event}`, properties);
    return true;
  } else {
    console.warn(`[PostHog] ⚠️ Not loaded, skipping event: ${event}`);
    return false;
  }
}

// Track specific feature usage
export function captureFeatureUsed(featureName: string, additionalProps?: Record<string, unknown>) {
  return captureEvent('feature_used', {
    feature_name: featureName,
    ...additionalProps,
  });
}

// Track demo/tutorial completion
export function captureDemoCompleted(properties?: Record<string, unknown>) {
  const sessionDuration = window.dilemmeSessionStart 
    ? (Date.now() - window.dilemmeSessionStart) / 1000 
    : 0;
  
  return captureEvent('demo_completed', {
    duration_seconds: sessionDuration,
    actions_completed: window.dilemmeActionsCount || 0,
    ...properties,
  });
}

// Track demo abandonment
export function captureDemoAbandoned(step: string, additionalProps?: Record<string, unknown>) {
  const sessionDuration = window.dilemmeSessionStart 
    ? (Date.now() - window.dilemmeSessionStart) / 1000 
    : 0;
  
  return captureEvent('demo_abandoned', {
    step,
    time_spent: sessionDuration,
    actions_completed: window.dilemmeActionsCount || 0,
    ...additionalProps,
  });
}

// Track session start
export function captureSessionStarted() {
  window.dilemmeSessionStart = Date.now();
  window.dilemmeActionsCount = 0;
  return captureEvent('session_started', {
    url: window.location.href,
  });
}

// Track session end
export function captureSessionEnded(additionalProps?: Record<string, unknown>) {
  const sessionDuration = window.dilemmeSessionStart 
    ? (Date.now() - window.dilemmeSessionStart) / 1000 
    : 0;
  
  return captureEvent('session_ended', {
    duration_seconds: sessionDuration,
    actions_completed: window.dilemmeActionsCount || 0,
    ...additionalProps,
  });
}

// PostHog verification function - call from browser console with window.testPostHog()
function verifyPostHog(): { status: string; details: Record<string, unknown> } {
  const result: { status: string; details: Record<string, unknown> } = {
    status: 'unknown',
    details: {}
  };

  if (typeof window === 'undefined') {
    result.status = 'error';
    result.details.error = 'Not in browser environment';
    return result;
  }

  if (!window.posthog) {
    result.status = 'error';
    result.details.error = 'PostHog not found on window object';
    return result;
  }

  try {
    // Check if PostHog is initialized
    const distinctId = window.posthog.get_distinct_id?.();
    result.details.distinctId = distinctId;
    result.details.hasCapture = typeof window.posthog.capture === 'function';
    result.details.hasIdentify = typeof window.posthog.identify === 'function';
    result.details.__loaded = window.posthog.__loaded;
    result.details._i = window.posthog._i ? 'initialized' : 'not initialized';

    if (distinctId && result.details.hasCapture) {
      result.status = 'ok';
      console.log('[PostHog] ✅ Verification PASSED:', result.details);
    } else {
      result.status = 'warning';
      console.warn('[PostHog] ⚠️ Verification WARNING:', result.details);
    }
  } catch (error) {
    result.status = 'error';
    result.details.error = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PostHog] ❌ Verification FAILED:', result.details);
  }

  return result;
}

// Expose test function globally for debugging
if (typeof window !== 'undefined') {
  window.testPostHog = () => {
    console.log('=== PostHog Connection Test ===');
    const result = verifyPostHog();
    console.log('Verification result:', result);

    if (result.status === 'ok') {
      console.log('Sending test event...');
      const sent = captureEvent('posthog_test_event', {
        test: true,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent
      });
      console.log('Test event sent:', sent);
      console.log('✅ PostHog is working! Check your PostHog dashboard for the "posthog_test_event" event.');
    } else {
      console.error('❌ PostHog verification failed. Check the details above.');
    }

    return result;
  };
}

// Initial PostHog check and session tracking (with delay to ensure PostHog is fully loaded)
if (typeof window !== 'undefined') {
  // Wait a bit for PostHog to fully initialize
  setTimeout(() => {
    const verification = verifyPostHog();
    if (verification.status === 'ok') {
      // Capture app loaded and session started events
      captureEvent("app_loaded", {
        url: window.location.href
      });
      captureSessionStarted();
    }
  }, 1000);
  
  // Track session end when user leaves or closes the page
  window.addEventListener('beforeunload', () => {
    captureSessionEnded({
      exit_url: window.location.href,
      exit_type: 'page_unload'
    });
  });
  
  // Also track visibility change for mobile (when app goes to background)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      captureEvent('app_backgrounded', {
        duration_seconds: window.dilemmeSessionStart 
          ? (Date.now() - window.dilemmeSessionStart) / 1000 
          : 0,
        actions_completed: window.dilemmeActionsCount || 0,
      });
    }
  });
}

function TitlePage() {
  const [, setLocation] = useLocation();
  
  const handleStart = () => {
    captureFeatureUsed('title_screen_start');
    setLocation('/video');
  };
  
  return <TitleScreen onStart={handleStart} />;
}

function VideoPage() {
  const [, setLocation] = useLocation();
  
  const handleComplete = () => {
    captureFeatureUsed('video_completed');
    setLocation('/welcome');
  };
  
  return <VideoIntro onComplete={handleComplete} />;
}

function WelcomePage() {
  const [, setLocation] = useLocation();
  const { setUserName, setSessionId, setAudioUnlocked, setMessages, setExchangeCount, setConversationEnded } = useSessionFlow();

  const handleComplete = async (name: string) => {
    // CRITICAL: Reset audio and conversation state for new session
    // This ensures Peter's welcome message will be spoken even if user had a previous session
    setAudioUnlocked(true); // autorise la lecture immédiate sur l'écran suivant
    setMessages([]);
    setExchangeCount(0);
    setConversationEnded(false);
    
    setUserName(name);
    
    // Identify user in PostHog with their name before starting
    identifyUser(name, { 
      name: name,
      signup_date: new Date().toISOString(),
    });
    
    captureFeatureUsed('welcome_name_entered', { hasName: !!name, userName: name });
    
    try {
      const session = await createSession({
        userName: name,
        foundClues: [],
        score: 0,
        audioMode: 'voice',
        completed: 0,
      });
      setSessionId(session.id);
      captureFeatureUsed('session_created', { sessionId: session.id, userName: name });
      setLocation('/tutorial');
    } catch (error) {
      console.error('Failed to create session:', error);
      captureEvent('session_creation_error', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };

  return <WelcomeSetup onStart={handleComplete} />;
}

function TutorialPage() {
  const [, setLocation] = useLocation();
  const { sessionId, userName, setFoundClues } = useSessionFlow();

  const storedSession = sessionStorage.getItem('dilemme_session_flow');
  const hasValidSession = sessionId || (storedSession && JSON.parse(storedSession).sessionId);

  if (!hasValidSession) {
    captureDemoAbandoned('tutorial', { reason: 'no_valid_session' });
    return <Redirect to="/" />;
  }

  const handleComplete = (finalScore: number, clues: string[]) => {
    setFoundClues(clues);
    captureFeatureUsed('tutorial_completed', {
      cluesFound: clues.length,
      score: finalScore,
    });
    setLocation('/game');
  };

  return (
    <TutorialScreen
      sessionId={sessionId || (storedSession ? JSON.parse(storedSession).sessionId : '')}
      userName={userName || (storedSession ? JSON.parse(storedSession).userName : '')}
      onComplete={handleComplete}
    />
  );
}

function GamePage() {
  const [, setLocation] = useLocation();
  const { userName } = useSessionFlow();

  const storedSession = sessionStorage.getItem('dilemme_session_flow');
  const hasValidSession = userName || (storedSession && JSON.parse(storedSession).sessionId);

  if (!hasValidSession) {
    captureDemoAbandoned('game', { reason: 'no_valid_session' });
    return <Redirect to="/" />;
  }

  const handleComplete = () => {
    captureFeatureUsed('game_completed');
    setLocation('/synthesis');
  };

  return (
    <DragDropGame
      userName={userName || (storedSession ? JSON.parse(storedSession).userName : '')}
      onComplete={handleComplete}
    />
  );
}

function SynthesisPage() {
  const [, setLocation] = useLocation();
  const { userName, sessionId, foundClues } = useSessionFlow();

  const storedSession = sessionStorage.getItem('dilemme_session_flow');
  const hasValidSession = sessionId || (storedSession && JSON.parse(storedSession).sessionId);

  if (!hasValidSession) {
    captureDemoAbandoned('synthesis', { reason: 'no_valid_session' });
    return <Redirect to="/" />;
  }

  const stored = storedSession ? JSON.parse(storedSession) : null;
  
  const handleShowFeedback = () => {
    captureFeatureUsed('synthesis_completed');
    setLocation('/feedback');
  };

  return (
    <SynthesisScreen
      userName={userName || (stored?.userName || '')}
      sessionId={sessionId || (stored?.sessionId || '')}
      foundClues={foundClues.length > 0 ? foundClues : (stored?.foundClues || [])}
      onShowFeedback={handleShowFeedback}
    />
  );
}

function FeedbackPage() {
  const [, setLocation] = useLocation();
  const { sessionId, userName, setFeedbackCompleted } = useSessionFlow();

  const storedSession = sessionStorage.getItem('dilemme_session_flow');
  const hasValidSession = sessionId || (storedSession && JSON.parse(storedSession).sessionId);

  if (!hasValidSession) {
    captureDemoAbandoned('feedback', { reason: 'no_valid_session' });
    return <Redirect to="/" />;
  }

  const stored = storedSession ? JSON.parse(storedSession) : null;

  const handleComplete = () => {
    setFeedbackCompleted(true);
    captureFeatureUsed('feedback_completed');
    setLocation('/complete');
  };

  return (
    <FeedbackSurvey
      sessionId={sessionId || (stored?.sessionId || '')}
      userName={userName || (stored?.userName || '')}
      onClose={() => setLocation('/synthesis')}
      onComplete={handleComplete}
    />
  );
}

function CompletePage() {
  const { userName, resetSession, foundClues } = useSessionFlow();
  const [, setLocation] = useLocation();

  // Track demo completion on mount
  useEffect(() => {
    captureDemoCompleted({
      userName: userName || 'unknown',
      cluesFound: foundClues?.length || 0,
    });
  }, [userName, foundClues]);

  const handleReplay = () => {
    resetSession();
    captureSessionStarted(); // Start a new session
    window.location.href = '/'; // Full refresh to ensure clean state
  };

  const handleShare = async () => {
    const shareUrl = "https://proto-dilemme2.edugami.app/";
    const shareData = {
      title: "Dilemme Plastique",
      text: "Découvrez l'impact du plastique sur la santé avec cette expérience interactive !",
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        captureFeatureUsed('share_experience', { method: 'native' });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        captureFeatureUsed('share_experience', { method: 'clipboard' });
        alert("Lien copié dans le presse-papier !");
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
      <div className="w-full max-w-md space-y-8 text-center animate-scale-in">
        <div className="text-6xl mb-4">🎉</div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold font-heading">Merci {userName || 'participant'} !</h2>
          <p className="text-muted-foreground text-lg">
            Tu as terminé l'expérience Dilemme Plastique.
          </p>
        </div>

        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-700 dark:text-green-400 font-medium">Merci pour ta participation !</p>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-4">
          <Button 
            onClick={handleShare}
            variant="default"
            size="lg"
            className="w-full rounded-2xl py-6 text-lg font-semibold shadow-md"
            data-testid="button-share"
          >
            Partager l'expérience
          </Button>

          <Button 
            onClick={handleReplay}
            variant="outline"
            size="lg"
            className="w-full rounded-2xl py-6 text-lg font-semibold"
            data-testid="button-replay"
          >
            Recommencer l'expérience
          </Button>
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <MediaProvider>
      <Switch>
        <Route path="/" component={TitlePage} />
        <Route path="/video" component={VideoPage} />
        <Route path="/welcome" component={WelcomePage} />
        <Route path="/tutorial" component={TutorialPage} />
        <Route path="/game" component={GamePage} />
        <Route path="/synthesis" component={SynthesisPage} />
        <Route path="/feedback" component={FeedbackPage} />
        <Route path="/complete" component={CompletePage} />
        <Route path="/syntheses" component={Syntheses} />
        <Route component={NotFound} />
      </Switch>
    </MediaProvider>
  );
}

function App() {
  useEffect(() => {
    // Capture page view when app mounts
    captureEvent("page_view", {
      page: window.location.pathname,
    });
    
    // Track feature usage for prototype demo
    captureFeatureUsed('prototype_demo', {
      initial_page: window.location.pathname,
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionFlowProvider>
          <Toaster />
          <Router />
        </SessionFlowProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
