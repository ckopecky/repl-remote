import { useParams, Link } from "wouter";
import { useGetProspectDetail, useCreateOutreachPackage } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Building2, Calendar, FileText, Send, User, Target, Activity, CheckCircle2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function ProspectDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: detail, isLoading } = useGetProspectDetail(Number(id), { 
    query: { 
      enabled: !!id,
      queryKey: ["/api/prospects", Number(id)] as any 
    } 
  });

  const createPackage = useCreateOutreachPackage({
    mutation: {
      onSuccess: () => {
        toast({ title: "Outreach Package Created", description: "Moved to queue for generation." });
        setLocation("/outreach");
      },
      onError: () => {
        toast({ title: "Failed to create package", variant: "destructive" });
      }
    }
  });

  if (isLoading) {
    return <div className="p-8"><div className="h-8 w-64 bg-muted animate-pulse rounded mb-8" /></div>;
  }

  if (!detail) {
    return <div className="p-8 text-center text-muted-foreground">Prospect not found.</div>;
  }

  const { person, company, events, behavioralTrail, researchAssessment, outreachPackage } = detail;

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "High": return "bg-rose-500/10 text-rose-600 border-rose-500/20";
      case "Medium": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "Low": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-500";
    if (score >= 50) return "text-amber-500";
    return "text-muted-foreground";
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/10">
      {/* Header */}
      <div className="bg-background border-b border-border/40 px-6 py-4 sticky top-0 z-10">
        <div className="mb-4">
          <Link href="/prospects" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Prospects
          </Link>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {person.firstName} {person.lastName}
              </h1>
              <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                {person.title} at <span className="font-medium text-foreground">{company.name}</span>
                <span className="text-border">•</span>
                <span className="font-mono text-xs">{person.email}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={getPriorityColor(researchAssessment.outreachPriority)}>
              {researchAssessment.outreachPriority} Priority
            </Badge>
            {!outreachPackage ? (
              <Button 
                onClick={() => createPackage.mutate({ data: { personId: person.id } })}
                disabled={createPackage.isPending || researchAssessment.outreachPriority === "Suppress"}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                Queue Outreach
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setLocation("/outreach")} className="gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                In Outreach Queue
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        
        {/* Left Column: Intelligence & Assessment */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Signal & Rationale */}
          <Card className="border-primary/20 shadow-sm overflow-hidden">
            <div className="bg-primary/5 px-6 py-4 border-b border-primary/10">
              <h3 className="font-semibold text-primary flex items-center gap-2">
                <Target className="w-5 h-5" />
                Research Assessment
              </h3>
            </div>
            <CardContent className="p-6 space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recommended Angle</h4>
                <p className="text-sm font-medium leading-relaxed">{researchAssessment.recommendedAngle}</p>
              </div>
              <Separator />
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Analyst Rationale</h4>
                <p className="text-sm text-foreground leading-relaxed">{researchAssessment.rationale}</p>
              </div>
              {researchAssessment.riskNotes && (
                <>
                  <Separator />
                  <div className="bg-destructive/5 rounded-lg p-4 border border-destructive/10">
                    <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Risk Notes
                    </h4>
                    <p className="text-sm text-destructive/90">{researchAssessment.riskNotes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Behavioral Trail Narrative */}
          <Card className="shadow-sm">
            <CardHeader className="pb-4 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-5 h-5 text-muted-foreground" />
                Behavioral Narrative
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm leading-relaxed mb-6">
                {behavioralTrail.behaviorSummary}
              </p>
              
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chronological Trail</h4>
                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {behavioralTrail.chronologicalTrail.map((step, i) => (
                    <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-background bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-colors">
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      </div>
                      <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded border bg-card shadow-sm text-sm">
                        {step}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Raw Events */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Raw Event Stream</CardTitle>
              <CardDescription>All tracked product behavior for this prospect.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events.map(e => (
                  <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors gap-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {e.eventCategory}
                      </Badge>
                      <span className="text-sm font-medium">{e.eventName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(e.occurredAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No raw events recorded.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Profiles & Scores */}
        <div className="space-y-6">
          
          {/* Signal Scores */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex justify-between items-center">
                <span>Research Scores</span>
                <Badge variant="secondary" className="text-[10px] font-mono">v{researchAssessment.hypothesisVersion}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {[
                  { label: "ICP Fit", value: researchAssessment.icpFitScore },
                  { label: "Persona Fit", value: researchAssessment.personaFitScore },
                  { label: "Activation", value: researchAssessment.activationScore },
                  { label: "Enterprise Intent", value: researchAssessment.enterpriseIntentScore },
                  { label: "Collaboration", value: researchAssessment.collaborationScore },
                  { label: "Churn Risk", value: researchAssessment.churnRiskScore },
                ].map(score => (
                  <div key={score.label} className="flex justify-between items-center p-4">
                    <span className="text-sm font-medium text-muted-foreground">{score.label}</span>
                    <span className={`font-mono font-bold ${getScoreColor(score.value)}`}>{score.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Company Profile */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                Company Enrichment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Domain</div>
                <div className="text-sm font-medium">{company.domain}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Industry</div>
                <div className="text-sm font-medium">{company.industry}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Employees</div>
                  <div className="text-sm font-medium">{company.employeeCount.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Funding</div>
                  <div className="text-sm font-medium">{company.fundingStage}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Tech Context</div>
                <div className="text-sm">{company.technologyContext}</div>
              </div>
            </CardContent>
          </Card>

          {/* Person Profile */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Person Enrichment
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Department & Seniority</div>
                <div className="text-sm font-medium">{company.department || "Unknown"} • {person.seniority}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Assigned Persona</div>
                <div className="text-sm font-medium">{person.persona}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Purchase Role</div>
                <div className="text-sm">{person.purchaseRole}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">LinkedIn</div>
                <a href={person.profileUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline truncate block">
                  {person.profileUrl}
                </a>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
