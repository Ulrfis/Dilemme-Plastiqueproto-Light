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
    const apiKey = import.meta.env.VITE_POSTHOG_API_KEY;
    if (apiKey) {
      posthog.init(apiKey, {
        api_host: "https://us.i.posthog.com",
        loaded: (ph) => {
          ph.identify();
        },
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
