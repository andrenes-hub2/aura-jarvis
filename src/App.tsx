import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppStateProvider } from "./state/AppState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { JarvisCore } from "./components/JarvisCore";
import { CommandBar } from "./components/CommandBar";
import { Transcript } from "./components/Transcript";
import { LogDrawer } from "./components/LogDrawer";
import { AgentDetail } from "./components/AgentDetail";
import { SetupPanel } from "./components/SetupPanel";
import { SidePanel } from "./components/SidePanel";
import { RemoteViewPanel } from "./components/RemoteViewPanel";
import { needsSetup, type Diagnostics } from "./engine/setup";
import type { SubAgent } from "./types";
import "./App.css";

function Shell() {
  const [logOpen, setLogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null);

  useEffect(() => {
    invoke<Diagnostics>("run_diagnostics")
      .then((result) => {
        if (needsSetup(result)) setSetupOpen(true);
      })
      .catch(() => setSetupOpen(true));
  }, []);

  return (
    <div className="app-shell">
      <TopBar
        onToggleLog={() => setLogOpen((v) => !v)}
        logOpen={logOpen}
        onOpenSetup={() => setSetupOpen(true)}
        onOpenRemote={() => setRemoteOpen(true)}
      />
      <Sidebar />
      <div className="app-stage-wrap">
        <JarvisCore onSelectAgent={setSelectedAgent} />
        <Transcript />
        <CommandBar />
        {selectedAgent && <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      </div>
      <LogDrawer open={logOpen} />
      <SetupPanel open={setupOpen} onClose={() => setSetupOpen(false)} />
      <RemoteViewPanel open={remoteOpen} onClose={() => setRemoteOpen(false)} />
      <SidePanel />
    </div>
  );
}

function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

export default App;
