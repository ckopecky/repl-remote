import { useState, useRef } from "react";
import { 
  useListArchetypes, 
  useGenerateProspect, 
  useGenerateBatch, 
  useResetDemoData, 
  useReseedDemoData, 
  useSimulateDays, 
  useRecalculateAssessments,
  useGetCurrentHypothesis
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Play, Plus, Zap, Trash2, ShieldAlert, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function DemoControls() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedArchetype, setSelectedArchetype] = useState<string>("");
  const [batchCount, setBatchCount] = useState<number>(10);
  const [simulateDays, setSimulateDays] = useState<number>(7);

  const { data: archetypes } = useListArchetypes();
  const { data: currentHypothesis } = useGetCurrentHypothesis();
  
  const generateProspect = useGenerateProspect({
    mutation: {
      onSuccess: () => {
        toast({ title: "Prospect generated successfully" });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "Failed to generate prospect", variant: "destructive" })
    }
  });

  const generateBatch = useGenerateBatch({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `Generated ${data.generated} prospects in batch` });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "Failed to generate batch", variant: "destructive" })
    }
  });

  const simulate = useSimulateDays({
    mutation: {
      onSuccess: (data) => {
        toast({ title: `Simulated ${data.daysSimulated} days`, description: `Added ${data.eventsAdded} events.` });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "Failed to simulate activity", variant: "destructive" })
    }
  });

  const recalculate = useRecalculateAssessments({
    mutation: {
      onSuccess: (data) => {
        toast({ 
          title: "Assessments Recalculated", 
          description: `Updated ${data.updatedAssessmentsCount} records using v${data.hypothesisVersion}`
        });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "Failed to recalculate", variant: "destructive" })
    }
  });

  const resetData = useResetDemoData({
    mutation: {
      onSuccess: () => {
        toast({ title: "Data reset to fixed seed successfully" });
        queryClient.invalidateQueries();
      }
    }
  });

  const reseedData = useReseedDemoData({
    mutation: {
      onSuccess: () => {
        toast({ title: "Data regenerated with new random seed" });
        queryClient.invalidateQueries();
      }
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-2">
      {/* Generation Panel */}
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Generate Synthetic Data</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Single Prospect</Label>
              <div className="flex gap-2">
                <Select value={selectedArchetype} onValueChange={setSelectedArchetype}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select archetype" />
                  </SelectTrigger>
                  <SelectContent>
                    {archetypes?.map(a => (
                      <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => generateProspect.mutate({ data: { archetype: selectedArchetype as any } })}
                  disabled={!selectedArchetype || generateProspect.isPending}
                  size="icon"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Batch Generate</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  min={1} max={50} 
                  value={batchCount} 
                  onChange={e => setBatchCount(parseInt(e.target.value) || 1)} 
                />
                <Button 
                  onClick={() => generateBatch.mutate({ data: { count: batchCount } })}
                  disabled={generateBatch.isPending}
                  variant="secondary"
                  className="whitespace-nowrap"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Generate {batchCount}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Time Simulation</h3>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Forward Time (Days)</Label>
            <div className="flex gap-2">
              <Input 
                type="number" 
                min={1} max={30} 
                value={simulateDays} 
                onChange={e => setSimulateDays(parseInt(e.target.value) || 1)} 
              />
              <Button 
                onClick={() => simulate.mutate({ data: { days: simulateDays } })}
                disabled={simulate.isPending}
                className="whitespace-nowrap"
              >
                <Play className="w-4 h-4 mr-2" />
                Simulate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Generates product events and updates behavioral trails.</p>
          </div>
        </div>
      </div>

      {/* Engine Controls Panel */}
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Signal Engine Actions</h3>
          <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Recalculate All Scores</span>
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">v{currentHypothesis?.version || '...'}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Re-evaluates every prospect against the current growth hypothesis weights.
            </p>
            <Button 
              onClick={() => recalculate.mutate({})}
              disabled={recalculate.isPending}
              className="w-full"
            >
              <Zap className="w-4 h-4 mr-2" />
              Trigger Full Recalculation
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Environment Reset</h3>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              onClick={() => resetData.mutate({})}
              disabled={resetData.isPending}
              className="w-full justify-start text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset to Fixed Seed (Predictable)
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => reseedData.mutate({})}
              disabled={reseedData.isPending}
              className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Nuke & Regenerate (Random Seed)
            </Button>
            <div className="flex items-start gap-2 mt-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                Reseeding drops all current data and generates a fresh, randomized prospect set.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

