import { useEffect } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      __loaded?: boolean;
      _i?: unknown[];
    };
    testPostHog?: () => void;
  }
}

// Helper function to safely capture PostHog events
export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (window.posthog) {
    window.posthog.capture(event, properties);
    console.log(`[PostHog] ✅ Captured event: ${event}`, properties);
    return true;
  } else {
    console.warn(`[PostHog] ⚠️ Not loaded, skipping event: ${event}`);
    return false;
  }
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

// Initial PostHog check and app_loaded event (with delay to ensure PostHog is fully loaded)
if (typeof window !== 'undefined') {
  // Wait a bit for PostHog to fully initialize
  setTimeout(() => {
    const verification = verifyPostHog();
    if (verification.status === 'ok') {
      captureEvent("app_loaded", {
        timestamp: new Date().toISOString(),
        url: window.location.href
      });
    }
  }, 1000);
}

function TitlePage() {
  const [, setLocation] = useLocation();
  return <TitleScreen onStart={() => setLocation('/video')} />;
}

function VideoPage() {
  const [, setLocation] = useLocation();
  return <VideoIntro onComplete={() => setLocation('/welcome')} />;
}

function WelcomePage() {
  const [, setLocation] = useLocation();
  const { setUserName, setSessionId } = useSessionFlow();

  const handleComplete = async (name: string) => {
    setUserName(name);
    try {
      const session = await createSession({
        userName: name,
        foundClues: [],
        score: 0,
        audioMode: 'voice',
        completed: 0,
      });
      setSessionId(session.id);
      setLocation('/tutorial');
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  return <WelcomeSetup onStart={handleComplete} />;
}

function TutorialPage() {
  const [, setLocation] = useLocation();
  const { sessionId, userName, hasSession, setFoundClues } = useSessionFlow();

  if (!hasSession) {
    return <Redirect to="/" />;
  }

  const handleComplete = (finalScore: number, clues: string[]) => {
    setFoundClues(clues);
    setLocation('/game');
  };

  return (
    <TutorialScreen
      sessionId={sessionId}
      userName={userName}
      onComplete={handleComplete}
    />
  );
}

function GamePage() {
  const [, setLocation] = useLocation();
  const { userName, hasSession } = useSessionFlow();

  if (!hasSession) {
    return <Redirect to="/" />;
  }

  return (
    <DragDropGame
      userName={userName}
      onComplete={() => setLocation('/synthesis')}
    />
  );
}

function SynthesisPage() {
  const [, setLocation] = useLocation();
  const { userName, sessionId, foundClues, hasSession } = useSessionFlow();

  if (!hasSession) {
    return <Redirect to="/" />;
  }

  return (
    <SynthesisScreen
      userName={userName}
      sessionId={sessionId}
      foundClues={foundClues}
      onShowFeedback={() => setLocation('/feedback')}
    />
  );
}

function FeedbackPage() {
  const [, setLocation] = useLocation();
  const { sessionId, userName, hasSession, setFeedbackCompleted } = useSessionFlow();

  if (!hasSession) {
    return <Redirect to="/" />;
  }

  const handleComplete = () => {
    setFeedbackCompleted(true);
    setLocation('/complete');
  };

  return (
    <FeedbackSurvey
      sessionId={sessionId}
      userName={userName}
      onClose={() => setLocation('/synthesis')}
      onComplete={handleComplete}
    />
  );
}

function CompletePage() {
  const { userName, resetSession } = useSessionFlow();
  const [, setLocation] = useLocation();

  const handleReplay = () => {
    resetSession();
    setLocation('/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-chart-2/5">
      <div className="w-full max-w-md space-y-6 text-center animate-scale-in">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold font-heading">Merci {userName || 'participant'} !</h2>
        <p className="text-muted-foreground text-lg">
          Tu as terminé l'expérience Dilemme Plastique.
        </p>
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-green-700 font-medium">Merci pour ta participation !</p>
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
      timestamp: new Date().toISOString(),
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
