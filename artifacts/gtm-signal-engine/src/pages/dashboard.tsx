import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, Activity, Zap, ShieldAlert, Target, GitCommit, CheckCircle2 } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="flex-1 p-8 space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = [
    {
      title: "Monitored Companies",
      value: summary?.companies || 0,
      icon: Building2,
      color: "text-blue-500",
    },
    {
      title: "Known People",
      value: summary?.people || 0,
      icon: Users,
      color: "text-indigo-500",
    },
    {
      title: "Total Tracked Events",
      value: (summary?.totalEvents || 0).toLocaleString(),
      icon: Activity,
      color: "text-emerald-500",
    },
    {
      title: "High Priority Prospects",
      value: summary?.highPriorityProspects || 0,
      icon: Target,
      color: "text-rose-500",
      alert: true,
    },
    {
      title: "Activated Accounts",
      value: summary?.activatedAccounts || 0,
      icon: Zap,
      color: "text-amber-500",
    },
    {
      title: "Enterprise Evaluators",
      value: summary?.enterpriseEvaluators || 0,
      icon: Building2,
      color: "text-purple-500",
    },
    {
      title: "At-Risk Implementers",
      value: summary?.atRiskImplementers || 0,
      icon: ShieldAlert,
      color: "text-orange-500",
    },
    {
      title: "Converted Accounts",
      value: summary?.convertedAccounts || 0,
      icon: CheckCircle2,
      color: "text-teal-500",
    },
  ];

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Engine Status</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time overview of the synthetic GTM pipeline.</p>
        </div>
        
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border rounded-lg">
          <GitCommit className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Active Hypothesis</span>
          <span className="text-xs font-mono font-bold px-2 py-0.5 bg-background border rounded">
            v{summary?.currentHypothesisVersion || '0.0.0'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => {
          const Icon = metric.icon;
          return (
            <Card key={i} className="overflow-hidden border-border/50 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-lg bg-muted ${metric.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {metric.alert && metric.value > 0 && (
                    <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">{metric.title}</p>
                  <h3 className="text-3xl font-bold font-mono tracking-tight">{metric.value}</h3>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
