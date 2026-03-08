import { useState } from "react";
import { Compass, Mail, Loader2, Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskStatusProvider, useTaskStatus } from "./contexts/TaskStatusContext";
import AdExplorer from "./components/AdExplorer";
import ChatOverlay from "./components/ChatOverlay";
import EmailIntelligence from "./components/EmailIntelligence";
import SettingsScreen from "./components/SettingsScreen";
import { Toaster } from "sonner";
import "./App.css";

const SIDEBAR_WIDTH = 260;

const MODULES = [
  { id: "ad-explorer", label: "Ad Explorer", icon: Compass },
  { id: "email-intelligence", label: "Email Intelligence", icon: Mail },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

const TASK_MODULE_IDS = new Set<string>([]);

function AppContent() {
  const [activeModule, setActiveModule] = useState<string>(MODULES[0].id);
  const { taskStatus } = useTaskStatus();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-6">
        <h1 className="text-lg font-semibold tracking-tight">
          Marketing Intelligence Engine
        </h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card"
          style={{ width: SIDEBAR_WIDTH }}
        >
          <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-3">
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
              Modules
            </p>
            {MODULES.map((m) => {
              const Icon = m.icon;
              const status = TASK_MODULE_IDS.has(m.id) ? taskStatus[m.id] : undefined;
              return (
                <Button
                  key={m.id}
                  variant={activeModule === m.id ? "secondary" : "ghost"}
                  className={cn(
                    "h-11 min-h-[44px] justify-start gap-3 px-3",
                    activeModule === m.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                    status === "success" && "border-l-2 border-l-emerald-500"
                  )}
                  onClick={() => setActiveModule(m.id)}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">{m.label}</span>
                  {status === "running" && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  )}
                  {status === "success" && (
                    <Check className="size-4 shrink-0 text-emerald-500" aria-hidden />
                  )}
                </Button>
              );
            })}
          </nav>
        </aside>
        <main
          className="flex-1 overflow-auto p-6"
          style={{ width: `calc(100% - ${SIDEBAR_WIDTH}px)` }}
        >
          {activeModule === "ad-explorer" && <AdExplorer />}
          {activeModule === "email-intelligence" && <EmailIntelligence />}
          {activeModule === "settings" && <SettingsScreen />}
          {!MODULES.some((m) => m.id === activeModule) && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Marketing Intelligence Engine</h2>
              <p className="text-muted-foreground">
                Local intelligence platform for marketing research. Select a module from the sidebar.
              </p>
            </div>
          )}
        </main>
      </div>
      <ChatOverlay />
      <Toaster richColors position="bottom-right" />
    </div>
  );
}

function App() {
  return (
    <TaskStatusProvider>
      <AppContent />
    </TaskStatusProvider>
  );
}

export default App;
