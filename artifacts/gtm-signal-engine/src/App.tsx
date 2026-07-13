import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/shell';
import Dashboard from '@/pages/dashboard';
import ProspectsList from '@/pages/prospects/index';
import ProspectDetail from '@/pages/prospects/detail';
import Hypothesis from '@/pages/hypothesis';
import Outreach from '@/pages/outreach';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/prospects" component={ProspectsList} />
        <Route path="/prospects/:id" component={ProspectDetail} />
        <Route path="/hypothesis" component={Hypothesis} />
        <Route path="/outreach" component={Outreach} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
