import { useState } from "react";
import { useListHypotheses, useGetCurrentHypothesis, useCreateHypothesis } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { FlaskConical, Save, History, Activity, AlertCircle, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function Hypothesis() {
  const { toast } = useToast();
  const { data: current, isLoading: isCurrentLoading } = useGetCurrentHypothesis();
  const { data: history } = useListHypotheses();
  
  const [formData, setFormData] = useState<any>(null);
  const [recalcResult, setRecalcResult] = useState<any>(null);
  const [showResult, setShowResult] = useState(false);

  const createMut = useCreateHypothesis({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "New Hypothesis Deployed", description: `Version ${data.hypothesis.version} is now active.` });
        setRecalcResult(data.recalculation);
        setShowResult(true);
      },
      onError: () => toast({ title: "Failed to deploy", variant: "destructive" })
    }
  });

  // Init form data when current loads
  if (current && !formData && !isCurrentLoading) {
    setFormData({
      title: current.title,
      description: current.description,
      signalWeights: { ...current.signalWeights },
      messagingGuidance: { ...current.messagingGuidance },
      knownLimitations: current.knownLimitations
    });
  }

  const handleSave = () => {
    if (!formData) return;
    createMut.mutate({ data: formData });
  };

  const updateWeight = (key: string, value: number[]) => {
    setFormData((prev: any) => ({
      ...prev,
      signalWeights: { ...prev.signalWeights, [key]: value[0] }
    }));
  };

  if (isCurrentLoading || !formData) {
    return <div className="p-8"><div className="h-8 w-64 bg-muted animate-pulse rounded" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden bg-muted/10">
      <div className="flex-none p-6 border-b bg-background">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-primary" />
              Growth Hypothesis Engine
            </h1>
            <p className="text-muted-foreground mt-1">
              Define how signals are weighted to prioritize prospects.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-sm px-3 py-1">
              Current: v{current?.version}
            </Badge>
            <Button onClick={handleSave} disabled={createMut.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              Deploy & Recalculate
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Tabs defaultValue="editor" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="editor">Hypothesis Editor</TabsTrigger>
              <TabsTrigger value="history" className="gap-2">
                <History className="w-4 h-4" /> Version History
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="editor" className="space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Core Thesis</CardTitle>
                  <CardDescription>What is our current bet on finding the best prospects?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Hypothesis Name</Label>
                    <Input 
                      value={formData.title} 
                      onChange={e => setFormData((prev: any) => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Thesis Description</Label>
                    <Textarea 
                      value={formData.description}
                      onChange={e => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Signal Weights (0.0 to 1.0)
                  </CardTitle>
                  <CardDescription>Tune the importance of specific behavioral patterns.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {Object.entries(formData.signalWeights).map(([key, value]: [string, any]) => (
                      <div key={key} className="space-y-3 p-4 border rounded-lg bg-card/50">
                        <div className="flex justify-between items-center">
                          <Label className="font-mono text-xs">{key}</Label>
                          <span className="text-xs font-bold text-primary w-8 text-right">{value.toFixed(2)}</span>
                        </div>
                        <Slider 
                          value={[value]} 
                          min={0} max={1} step={0.05}
                          onValueChange={(v) => updateWeight(key, v)}
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Known Limitations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    value={formData.knownLimitations}
                    onChange={e => setFormData((prev: any) => ({ ...prev, knownLimitations: e.target.value }))}
                    rows={2}
                    placeholder="E.g., Over-indexes on enterprise due to SSO weight..."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {history?.map((h) => (
                      <div key={h.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="font-mono">v{h.version}</Badge>
                            <h4 className="font-semibold">{h.title}</h4>
                            {h.version === current?.version && (
                              <Badge className="bg-primary/20 text-primary hover:bg-primary/20">Active</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{h.description}</p>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {new Date(h.effectiveAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Recalculation Complete</DialogTitle>
            <DialogDescription>
              Deployed hypothesis v{recalcResult?.hypothesisVersion}. 
              Updated {recalcResult?.updatedAssessmentsCount} assessments.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left">Prospect</th>
                  <th className="p-2 text-left">Previous Priority</th>
                  <th className="p-2 text-left">New Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recalcResult?.changes.length === 0 ? (
                  <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No priority changes.</td></tr>
                ) : (
                  recalcResult?.changes.map((c: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{c.personName} <span className="text-muted-foreground text-xs block">{c.companyName}</span></td>
                      <td className="p-2">
                        <Badge variant="outline" className="opacity-70">{c.previousOutreachPriority}</Badge>
                      </td>
                      <td className="p-2">
                        <span className="mx-2 text-muted-foreground">→</span>
                        <Badge variant="outline" className="border-primary/30 text-primary">{c.newOutreachPriority}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="pt-4 flex justify-end">
            <Button onClick={() => setShowResult(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
