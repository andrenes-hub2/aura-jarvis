import { useState } from "react";
import { AppStateProvider } from "./state/AppState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { JarvisCore } from "./components/JarvisCore";
import { CommandBar } from "./components/CommandBar";
import { LogDrawer } from "./components/LogDrawer";
import { AgentDetail } from "./components/AgentDetail";
import type { SubAgent } from "./types";
import "./App.css";

function Shell() {
  const [logOpen, setLogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null);

  return (
    <div className="app-shell">
      <TopBar onToggleLog={() => setLogOpen((v) => !v)} logOpen={logOpen} />
      <Sidebar />
      <div className="app-stage-wrap">
        <JarvisCore onSelectAgent={setSelectedAgent} />
        <CommandBar />
        {selectedAgent && <AgentDetail agent={selectedAgent} onClose={() => setSelectedAgent(null)} />}
      </div>
      <LogDrawer open={logOpen} />
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
