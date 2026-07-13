import { useState } from "react";
import { useListOutreachPackages, useUpdateOutreachPackage, useGetAttioExportPreview } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, FileJson, Check, X, Clock, Pause, Play, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OutreachStatus } from "@workspace/api-client-react";

export default function OutreachQueue() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [previewId, setPreviewId] = useState<number | null>(null);

  const { data: packages, isLoading } = useListOutreachPackages({
    status: filter !== "all" ? filter as any : undefined
  });

  const updateMut = useUpdateOutreachPackage({
    mutation: {
      onSuccess: () => toast({ title: "Status updated" }),
      onError: () => toast({ title: "Failed to update", variant: "destructive" })
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
                      <Badge variant="outline" className={getStatusColor(pkg.status)}>
                        {pkg.status}
                      </Badge>
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

                        {pkg.status === OutreachStatus.Needs_Review && (
                          <>
                            <Button 
                              variant="outline" size="sm" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => updateMut.mutate({ id: pkg.id, data: { status: OutreachStatus.Approved } })}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="outline" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => updateMut.mutate({ id: pkg.id, data: { status: OutreachStatus.Rejected } })}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        
                        {(pkg.status === OutreachStatus.Approved || pkg.status === OutreachStatus.Generated) && (
                          <Button 
                            variant="default" size="sm" className="h-8"
                            onClick={() => updateMut.mutate({ id: pkg.id, data: { status: OutreachStatus.Sent } })}
                          >
                            Mark Sent
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
            The exact JSON structure that will be sent to the Attio API.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">Loading payload...</div>
        ) : data ? (
          <Tabs defaultValue="person" className="flex-1 flex flex-col min-h-0 mt-4">
            <TabsList>
              <TabsTrigger value="person">Person Record</TabsTrigger>
              <TabsTrigger value="company">Company Record</TabsTrigger>
              <TabsTrigger value="email">GenAI Email</TabsTrigger>
            </TabsList>
            
            {["person", "company", "email"].map((key) => (
              <TabsContent key={key} value={key} className="flex-1 min-h-0 m-0 mt-2 border rounded-md overflow-hidden">
                <pre className="p-4 bg-muted/30 h-full overflow-auto text-xs font-mono">
                  {JSON.stringify((data as any)[key], null, 2)}
                </pre>
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
