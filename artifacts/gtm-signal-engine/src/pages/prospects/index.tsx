import { useState } from "react";
import { Link } from "wouter";
import { useListProspects } from "@workspace/api-client-react";
import { OutreachPriority, Archetype } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Target, Search, ArrowUpDown } from "lucide-react";

// Mirrors the fixed product event taxonomy in the API server's constants.ts --
// every event a person can trigger is one of these, so this doubles as the
// full set of selectable options for the event-type filter below.
const EVENT_TYPE_OPTIONS = [
  "user_signed_up",
  "application_created",
  "application_configured",
  "organization_enabled",
  "teammate_invited",
  "sdk_installed",
  "api_key_created",
  "integration_error",
  "documentation_viewed",
  "sso_documentation_viewed",
  "mfa_enabled",
  "pricing_page_viewed",
  "enterprise_page_viewed",
  "checkout_started",
  "subscription_started",
  "inactive_period",
  "returned_to_product",
];

function formatEventType(name: string): string {
  return name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function ProspectsList() {
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("outreachPriority");
  
  const { data: prospects, isLoading } = useListProspects({
    search: search || undefined,
    priority: priority !== "all" ? priority as OutreachPriority : undefined,
    eventType: eventType !== "all" ? eventType : undefined,
    sortBy: sortBy as any,
    sortDir: "desc"
  });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "High": return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      case "Medium": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      case "Low": return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getArchetypeLabel = (a: string) => {
    return a.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden">
      <div className="flex-none p-4 md:p-6 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" />
              Prospect Intelligence
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Scan, filter, and triage signal-qualified leads.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, company, or title..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="High">High Priority</SelectItem>
                <SelectItem value="Medium">Medium Priority</SelectItem>
                <SelectItem value="Low">Low Priority</SelectItem>
                <SelectItem value="Suppress">Suppressed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Event Type</SelectItem>
                {EVENT_TYPE_OPTIONS.map((e) => (
                  <SelectItem key={e} value={e}>{formatEventType(e)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outreachPriority">Priority Level</SelectItem>
                <SelectItem value="icpFitScore">ICP Fit Score</SelectItem>
                <SelectItem value="activationScore">Activation Score</SelectItem>
                <SelectItem value="enterpriseIntentScore">Enterprise Intent</SelectItem>
                <SelectItem value="createdAt">Date Discovered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 bg-muted/20">
        <div className="border border-border/50 rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Archetype</TableHead>
                <TableHead className="text-right">ICP Fit</TableHead>
                <TableHead className="text-right">Activation</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Events Triggered</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-5 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-28 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-8 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-5 w-8 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-6 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell><div className="h-5 w-28 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded" /></TableCell>
                  </TableRow>
                ))
              ) : prospects?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                    No prospects found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                prospects?.map((p) => (
                  <TableRow key={p.personId} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Link href={`/prospects/${p.personId}`} className="flex flex-col hover:underline">
                        <span className="font-medium text-foreground">{p.firstName} {p.lastName}</span>
                        <span className="text-xs text-muted-foreground">{p.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{p.companyName}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-md whitespace-nowrap">
                        {getArchetypeLabel(p.archetype)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className={p.icpFitScore > 80 ? "text-emerald-600" : ""}>{p.icpFitScore}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <span className={p.activationScore > 80 ? "text-amber-600" : ""}>{p.activationScore}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getPriorityColor(p.outreachPriority)}>
                        {p.outreachPriority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {p.triggeredEventTypes.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">None yet</span>
                        ) : (
                          p.triggeredEventTypes.slice(0, 3).map((e) => (
                            <Badge key={e} variant="secondary" className="text-[10px] font-normal">
                              {formatEventType(e)}
                            </Badge>
                          ))
                        )}
                        {p.triggeredEventTypes.length > 3 && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            +{p.triggeredEventTypes.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.outreachStatus ? (
                        <span className="text-xs font-medium text-primary flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          In Queue
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
