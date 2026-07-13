import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, FlaskConical, Send, Settings, Database, Beaker, Play } from "lucide-react";
import { DemoControls } from "@/components/demo-controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/prospects", label: "Prospects", icon: Users },
    { href: "/outreach", label: "Outreach Queue", icon: Send },
    { href: "/hypothesis", label: "Growth Hypothesis", icon: FlaskConical },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border/40 bg-sidebar flex flex-col hidden md:flex">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2">
          <Database className="w-5 h-5 text-sidebar-primary" />
          <span className="font-bold text-sidebar-foreground tracking-tight text-sm uppercase">GTM SIGNAL ENGINE</span>
        </div>
        
        <div className="px-4 py-3 border-b border-sidebar-border bg-sidebar-accent/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-sidebar-foreground/70 uppercase tracking-wider">Environment</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-mono text-primary font-semibold uppercase tracking-wider">Synthetic Demo Data</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2 bg-sidebar-accent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground">
                <Settings className="w-4 h-4" />
                Demo Controls
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-primary" />
                  Synthetic Data & Demo Controls
                </DialogTitle>
              </DialogHeader>
              <DemoControls />
            </DialogContent>
          </Dialog>
        </div>
      </aside>

      {/* Mobile Nav Header */}
      <header className="md:hidden h-14 border-b border-border/40 bg-sidebar flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-sidebar-primary" />
          <span className="font-bold text-sidebar-foreground text-sm">GTM ENGINE</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[10px] font-mono text-primary font-semibold">DEMO DATA</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-sidebar-foreground">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Demo Controls</DialogTitle>
              </DialogHeader>
              <DemoControls />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Mobile Nav Links */}
      <nav className="md:hidden flex overflow-x-auto border-b border-border/40 bg-sidebar/50 px-2 py-1 scrollbar-hide">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-foreground" 
                  : "text-sidebar-foreground/70"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
