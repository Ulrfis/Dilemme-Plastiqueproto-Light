import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Syntheses from "@/pages/Syntheses";
import NotFound from "@/pages/not-found";
import posthog from "posthog-js";

const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
console.log("[PostHog] API Key available:", !!apiKey);

if (apiKey) {
  posthog.init(apiKey, {
    api_host: "https://us.i.posthog.com",
  });
  console.log("[PostHog] Initialized successfully");
  posthog.capture("app_loaded", { timestamp: new Date().toISOString() });
} else {
  console.warn("[PostHog] No API key found - analytics disabled");
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/syntheses" component={Syntheses} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    console.log("[PostHog] App mounted, checking if initialized");
    if (apiKey) {
      posthog.capture("page_view", {
        page: "home",
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
