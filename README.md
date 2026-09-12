# AURA

Interfaccia desktop "Jarvis" per orchestrare agenti AI — un guscio grafico portable (Tauri) attorno a [ruflo](https://github.com/ruvnet/ruflo), al posto della sua CLI da terminale.

Il "core" al centro della UI rappresenta Claude Code, autenticato via OAuth con l'account/abbonamento esistente dell'utente (nessuna API key a consumo). ruflo viene installato come plugin di Claude Code (`ruflo-core`, `ruflo-swarm`) e fornisce lo swarm di sub-agenti che orbitano intorno al core.

## Stack

- **Tauri 2** (Rust + WebView2) — eseguibile nativo Windows, pensato per una build `portable` (nessuna installazione).
- **React 19 + TypeScript**, bundler **Vite 6**.
- Font: Orbitron (display/HUD), Manrope (UI), JetBrains Mono (log/console).

## Stato attuale

Interfaccia completa con **dati di esempio** (`src/data/mockData.ts`):

- Sidebar multi-progetto (crea/seleziona progetti).
- Vista centrale "Jarvis": core pulsante + agenti disposti a raggiera, collegati da fasci animati (canvas) colorati per stato (idle/attivo/attenzione/errore).
- Command bar in stile HUD per inviare obiettivi al core.
- Pannello di dettaglio agente al click su un nodo.
- Drawer log/console collassabile per chi vuole comunque vedere l'output grezzo.

Nessuna integrazione reale con ruflo/Claude Code è ancora collegata: è il prossimo passo.

## Sviluppo

```bash
npm install
npm run tauri dev
```

Anteprima solo browser (più veloce per iterare sulla UI, senza aprire la finestra nativa):

```bash
npm run dev
```

## Prossimi passi (motore reale)

1. Gestione processi: spawnare/collegarsi a `claude` (Claude Code CLI, già autenticato via OAuth sulla macchina) per progetto, dal processo Rust (`src-tauri`) tramite `std::process` o il plugin `tauri-plugin-shell`.
2. Installare/abilitare il plugin ruflo (`ruflo-core`, `ruflo-swarm`) nella sessione di Claude Code di ogni progetto.
3. Avviare l'MCP server di ruflo (`ruflo mcp start`) e collegarsi da Tauri per leggere in tempo reale stato swarm, agenti attivi, task e log — sostituendo `mockData.ts` con dati live.
4. Mappare gli eventi MCP (agent_spawn, task update, memory ops) sugli stati visivi dei nodi (idle/active/warning/error) e sul drawer log.
5. Persistere i progetti (percorso workspace, config) su disco invece che in memoria.
6. Build `portable`: `tauri.conf.json` → target NSIS "portable" per generare un singolo `.exe` eseguibile senza installazione.
