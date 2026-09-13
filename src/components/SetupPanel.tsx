import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CheckResult, Diagnostics } from "../engine/setup";
import "./SetupPanel.css";

type ComponentId = "node" | "claude" | "ruflo" | "playwright";

const ROWS: { id: ComponentId; label: string; installLabel: string; result: (d: Diagnostics) => CheckResult }[] = [
  { id: "node", label: "Node.js / npm", installLabel: "Installa Node.js", result: (d) => d.node },
  { id: "claude", label: "Claude Code", installLabel: "Installa Claude Code", result: (d) => d.claude },
  { id: "ruflo", label: "Ruflo (swarm)", installLabel: "Installa Ruflo", result: (d) => d.ruflo },
  { id: "playwright", label: "Playwright (test automatici)", installLabel: "Registra Playwright", result: (d) => d.playwright },
];

export function SetupPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState<ComponentId | "login" | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeyBusy, setApiKeyBusy] = useState<"save" | "test" | null>(null);
  const [apiKeyResult, setApiKeyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runDiagnostics = useCallback(async () => {
    setChecking(true);
    try {
      const result = await invoke<Diagnostics>("run_diagnostics");
      setDiagnostics(result);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void runDiagnostics();
      invoke<boolean>("has_api_key")
        .then(setApiKeyConfigured)
        .catch((err) => {
          setApiKeyConfigured(false);
          setApiKeyResult({ ok: false, message: `Impossibile leggere il gestore credenziali: ${String(err)}` });
        });
    }
  }, [open, runDiagnostics]);

  async function saveApiKey() {
    setApiKeyBusy("save");
    setApiKeyResult(null);
    try {
      await invoke("save_api_key", { key: apiKeyInput });
      setApiKeyConfigured(true);
      setApiKeyInput("");
      setApiKeyResult({ ok: true, message: "Chiave salvata nel gestore credenziali del sistema." });
    } catch (err) {
      setApiKeyResult({ ok: false, message: String(err) });
    } finally {
      setApiKeyBusy(null);
    }
  }

  async function testApiKey() {
    setApiKeyBusy("test");
    setApiKeyResult(null);
    try {
      const message = await invoke<string>("test_api_key", { key: apiKeyInput });
      setApiKeyResult({ ok: true, message });
    } catch (err) {
      setApiKeyResult({ ok: false, message: String(err) });
    } finally {
      setApiKeyBusy(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<{ step: string; line: string }>("setup-event", (e) => {
      setLog((prev) => [...prev.slice(-80), `[${e.payload.step}] ${e.payload.line}`]);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log.length]);

  async function install(id: ComponentId) {
    setRunning(id);
    setManualUrl(null);
    setLog((prev) => [...prev, `— avvio installazione: ${id} —`]);
    try {
      await invoke("install_component", { component: id });
      setLog((prev) => [...prev, `— ${id} installato —`]);
    } catch (err) {
      const message = String(err);
      const manual = message.match(/^MANUAL:(.+)$/);
      if (manual) setManualUrl(manual[1]);
      else setLog((prev) => [...prev, `— errore: ${message} —`]);
    } finally {
      setRunning(null);
      await runDiagnostics();
    }
  }

  async function login() {
    setRunning("login");
    try {
      await invoke("open_login_terminal");
    } catch (err) {
      setLog((prev) => [...prev, `— errore apertura terminale: ${String(err)} —`]);
    } finally {
      setRunning(null);
    }
  }

  if (!open) return null;

  return (
    <div className="setup-overlay">
      <div className="setup-panel">
        <div className="setup-header">
          <h2>Setup AURA</h2>
          <button className="setup-close" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <p className="setup-intro">
          AURA usa Claude Code (autenticato via il tuo abbonamento, nessuna API key) e opzionalmente ruflo per lo swarm
          di sub-agenti, più Playwright per i test automatici. Vanno registrati una volta sola su questa macchina.
        </p>

        <div className="setup-rows">
          {ROWS.map((row) => {
            const result: CheckResult | undefined = diagnostics ? row.result(diagnostics) : undefined;
            const isRunning = running === row.id;
            return (
              <div className="setup-row" key={row.id}>
                <span className="setup-row-status" data-ok={result?.ok} />
                <div className="setup-row-text">
                  <span className="setup-row-label">{row.label}</span>
                  <span className="setup-row-detail">{result?.detail ?? "in verifica…"}</span>
                </div>
                {result && !result.ok && (
                  <button className="setup-row-action" disabled={isRunning} onClick={() => install(row.id)}>
                    {isRunning ? "In corso…" : row.installLabel}
                  </button>
                )}
              </div>
            );
          })}

          <div className="setup-row">
            <span className="setup-row-status" data-ok={diagnostics?.claudeAuth.ok} />
            <div className="setup-row-text">
              <span className="setup-row-label">Autenticazione Claude</span>
              <span className="setup-row-detail">{diagnostics?.claudeAuth.detail ?? "in verifica…"}</span>
            </div>
            {diagnostics?.claude.ok && !diagnostics?.claudeAuth.ok && (
              <button className="setup-row-action" disabled={running === "login"} onClick={login}>
                {running === "login" ? "Apertura…" : "Accedi"}
              </button>
            )}
          </div>

          <div className="setup-row">
            <span className="setup-row-status" data-ok={diagnostics?.skills.ok} />
            <div className="setup-row-text">
              <span className="setup-row-label">Skill extra (impeccable, design taste, …)</span>
              <span className="setup-row-detail">{diagnostics?.skills.detail ?? "in verifica…"}</span>
            </div>
          </div>
        </div>

        <div className="setup-apikey">
          <div className="setup-apikey-header">
            <span className="setup-row-label">Chiave API Anthropic (opzionale)</span>
            <span className={`setup-apikey-badge ${apiKeyConfigured ? "is-set" : ""}`}>
              {apiKeyConfigured ? "configurata" : "non configurata"}
            </span>
          </div>
          <p className="setup-apikey-hint">
            Serve solo perché ruflo funzioni davvero in autonomia (il suo tool <code>agent_execute</code> chiama
            l'API Anthropic direttamente, a consumo — non passa dal tuo abbonamento). Senza questa chiave, Aura
            continua comunque a lavorare via OAuth, gratis: ruflo tiene solo traccia di swarm e task.
          </p>
          <div className="setup-apikey-row">
            <input
              type="password"
              className="setup-apikey-input"
              placeholder="sk-ant-…"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              autoComplete="off"
            />
            <button
              className="setup-row-action"
              disabled={!apiKeyInput.trim() || apiKeyBusy !== null}
              onClick={() => void testApiKey()}
            >
              {apiKeyBusy === "test" ? "Verifica…" : "Testa"}
            </button>
            <button
              className="setup-row-action setup-row-action-primary"
              disabled={!apiKeyInput.trim() || apiKeyBusy !== null}
              onClick={() => void saveApiKey()}
            >
              {apiKeyBusy === "save" ? "Salvo…" : "Salva"}
            </button>
          </div>
          {apiKeyResult && (
            <p className={`setup-apikey-result ${apiKeyResult.ok ? "is-ok" : "is-error"}`}>{apiKeyResult.message}</p>
          )}
        </div>

        {manualUrl && (
          <div className="setup-manual">
            <span>Installazione automatica non disponibile qui.</span>
            <button className="setup-row-action" onClick={() => void openUrl(manualUrl)}>
              Apri pagina di download
            </button>
          </div>
        )}

        {log.length > 0 && (
          <div className="setup-log" ref={logRef}>
            {log.map((line, i) => (
              <div key={i} className="setup-log-line">
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="setup-footer">
          <button className="setup-recheck" disabled={checking} onClick={() => void runDiagnostics()}>
            {checking ? "Verifica…" : "Ricontrolla tutto"}
          </button>
        </div>
      </div>
    </div>
  );
}
