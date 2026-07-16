import { useState } from "react";
import { useListGtmSignals, useUpdateGtmSignal, useGetAttioExportPreview, useSyncGtmSignalToAttio, useGenerateGtmSignalContent } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, FileJson, Check, X, ExternalLink, AlertTriangle, RefreshCw, CloudUpload, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GtmSignalStatus } from "@workspace/api-client-react";

export default function OutreachQueue() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [previewId, setPreviewId] = useState<number | null>(null);

  const { data: packages, isLoading } = useListGtmSignals({
    status: filter !== "all" ? filter as any : undefined
  });

  const updateMut = useUpdateGtmSignal({
    mutation: {
      onSuccess: (data: any) => {
        if (data?.status === "Sent" && data?.attioSyncStatus === "synced") {
          toast({ title: "Sent and synced to Attio", description: "Company, person, and note were pushed to your workspace." });
        } else if (data?.status === "Sent" && data?.attioSyncStatus === "error") {
          toast({ title: "Marked Sent, but Attio sync failed", description: data.attioSyncError, variant: "destructive" });
        } else {
          toast({ title: "Status updated" });
        }
      },
      onError: () => toast({ title: "Failed to update", variant: "destructive" })
    }
  });

  const syncMut = useSyncGtmSignalToAttio({
    mutation: {
      onSuccess: (data: any) => {
        if (data?.attioSyncStatus === "synced") {
          toast({ title: "Synced to Attio" });
        } else {
          toast({ title: "Attio sync failed", description: data?.attioSyncError, variant: "destructive" });
        }
      },
      onError: () => toast({ title: "Attio sync failed", variant: "destructive" })
    }
  });

  const generateMut = useGenerateGtmSignalContent({
    mutation: {
      onSuccess: (data: any) => {
        if (data?.generationStatus === "generated") {
          toast({ title: "Outreach content generated", description: "The LLM drafted a research summary, angle, and email." });
        } else {
          toast({ title: "Generation failed", description: data?.generationError, variant: "destructive" });
        }
      },
      onError: () => toast({ title: "Generation failed", variant: "destructive" })
    }
  });

  const getStatusColor = (s: string) => {
    if (s === "Approved" || s === "Sent" || s === "Replied") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    if (s === "Needs Review" || s === "Ready for Generation") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    if (s === "Rejected" || s === "Paused") return "bg-destructive/10 text-destructive border-destructive/20";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden bg-background">
      <div className="flex-none p-6 border-b">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Send className="w-6 h-6 text-primary" />
              Outreach Queue
            </h1>
            <p className="text-muted-foreground mt-1">Review and approve generated outreach before CRM sync.</p>
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Packages</TabsTrigger>
            <TabsTrigger value="Needs Review">Needs Review</TabsTrigger>
            <TabsTrigger value="Approved">Approved</TabsTrigger>
            <TabsTrigger value="Sent">Sent</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-muted/20">
        <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Prospect</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Source Signal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center">Loading queue...</TableCell></TableRow>
              ) : packages?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Queue is empty.</TableCell></TableRow>
              ) : (
                packages?.map(pkg => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.personName}</TableCell>
                    <TableCell>{pkg.companyName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={pkg.outreachPriority === "High" ? "border-rose-500/30 text-rose-600" : ""}>
                        {pkg.outreachPriority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={pkg.sourceSignal}>
                      {pkg.sourceSignal}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className={getStatusColor(pkg.status)}>
                          {pkg.status}
                        </Badge>
                        {(pkg as any).attioSyncStatus === "synced" && (pkg as any).attioPersonWebUrl && (
                          <a
                            href={(pkg as any).attioPersonWebUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                          >
                            <CloudUpload className="w-3 h-3" /> Synced to Attio <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {(pkg as any).attioSyncStatus === "error" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-destructive flex items-center gap-1 cursor-default">
                                <AlertTriangle className="w-3 h-3" /> Attio sync failed
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{(pkg as any).attioSyncError}</TooltipContent>
                          </Tooltip>
                        )}
                        {(pkg as any).generationStatus === "failed" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-destructive flex items-center gap-1 cursor-default">
                                <Sparkles className="w-3 h-3" /> Generation failed
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{(pkg as any).generationError}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" size="sm" 
                          className="h-8 px-2"
                          onClick={() => setPreviewId(pkg.id)}
                        >
                          <FileJson className="w-4 h-4 mr-1.5" />
                          Payload
                        </Button>

                        {(pkg as any).generationStatus === "failed" && (
                          <Button
                            variant="outline" size="sm" className="h-8"
                            disabled={generateMut.isPending}
                            onClick={() => generateMut.mutate({ id: pkg.id })}
                          >
                            <Sparkles className="w-4 h-4 mr-1.5" />
                            Retry Generation
                          </Button>
                        )}

                        {(pkg as any).attioSyncStatus === "error" && (
                          <Button
                            variant="outline" size="sm" className="h-8"
                            disabled={syncMut.isPending}
                            onClick={() => syncMut.mutate({ id: pkg.id })}
                          >
                            <RefreshCw className="w-4 h-4 mr-1.5" />
                            Retry Sync
                          </Button>
                        )}

                        {pkg.status === GtmSignalStatus.Rejected && (
                          <Button
                            variant="outline" size="sm" className="h-8"
                            disabled={generateMut.isPending}
                            onClick={() => generateMut.mutate({ id: pkg.id })}
                          >
                            <RefreshCw className="w-4 h-4 mr-1.5" />
                            Regenerate Email
                          </Button>
                        )}

                        {pkg.status === GtmSignalStatus.Needs_Review && (
                          <>
                            <Button 
                              variant="outline" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => updateMut.mutate({ id: pkg.id, data: { status: GtmSignalStatus.Approved } })}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => updateMut.mutate({ id: pkg.id, data: { status: GtmSignalStatus.Rejected } })}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        
                        {(pkg.status === GtmSignalStatus.Approved || pkg.status === GtmSignalStatus.Generated) && (
                          <Button 
                            variant="default" size="sm" className="h-8"
                            disabled={updateMut.isPending}
                            onClick={() => updateMut.mutate({ id: pkg.id, data: { status: GtmSignalStatus.Sent } })}
                          >
                            <CloudUpload className="w-4 h-4 mr-1.5" />
                            Send &amp; Sync to Attio
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ExportPreviewDialog 
        id={previewId} 
        open={!!previewId} 
        onOpenChange={(v) => !v && setPreviewId(null)} 
      />
    </div>
  );
}

function ExportPreviewDialog({ id, open, onOpenChange }: { id: number | null, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { data, isLoading } = useGetAttioExportPreview(id as number, {
    query: { enabled: !!id, queryKey: ["attio-preview", id] as any }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-primary" />
            Attio CRM Export Payload Preview
          </DialogTitle>
          <DialogDescription>
            The exact payloads that will be written to your Attio workspace when you sync.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">Loading payload...</div>
        ) : data ? (
          <Tabs defaultValue="gtmSignal" className="flex-1 flex flex-col min-h-0 mt-4">
            <TabsList>
              <TabsTrigger value="gtmSignal">GTM Signal</TabsTrigger>
              <TabsTrigger value="generativeEmail">Email Draft</TabsTrigger>
              <TabsTrigger value="person">Person Record</TabsTrigger>
              <TabsTrigger value="company">Company Record</TabsTrigger>
            </TabsList>

            {(["gtmSignal", "generativeEmail", "person", "company"] as const).map((key) => (
              <TabsContent key={key} value={key} className="flex-1 min-h-0 m-0 mt-2 border rounded-md overflow-hidden">
                {data[key] ? (
                  <pre className="p-4 bg-muted/30 h-full overflow-auto text-xs font-mono">
                    {JSON.stringify(data[key], null, 2)}
                  </pre>
                ) : (
                  <div className="p-4 h-full flex items-center justify-center text-sm text-muted-foreground">
                    {key === "generativeEmail"
                      ? "No email draft yet — generate content first."
                      : "No data available."}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Failed to load preview.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
