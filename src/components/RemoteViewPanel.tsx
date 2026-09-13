import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import "./RemoteViewPanel.css";

interface RemoteInfo {
  ip: string;
  port: number;
  pin: string;
  url: string;
}

export function RemoteViewPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const result = await invoke<RemoteInfo>("start_remote_view");
      setInfo(result);
      setQr(await QRCode.toDataURL(result.url, { margin: 1, width: 220 }));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await invoke("stop_remote_view");
      setInfo(null);
      setQr(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the URL is still shown on screen to copy manually */
    }
  }

  if (!open) return null;

  return (
    <div className="setup-overlay">
      <div className="remote-panel">
        <div className="setup-header">
          <h2>Vista remota</h2>
          <button className="setup-close" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <p className="setup-intro">
          Apri l'indirizzo qui sotto dal telefono (stessa rete Wi-Fi del PC) per vedere in tempo reale agenti e chat
          del progetto attivo — nessuna app da installare. Solo lettura, protetto da un PIN mostrato qui.
        </p>

        {!info ? (
          <button className="setup-row-action setup-row-action-primary remote-start" disabled={busy} onClick={() => void start()}>
            {busy ? "Avvio…" : "Avvia vista remota"}
          </button>
        ) : (
          <div className="remote-info">
            {qr && <img className="remote-qr" src={qr} alt="QR code per l'indirizzo remoto" />}
            <div className="remote-url-row">
              <code className="remote-url">{info.url}</code>
              <button className="setup-row-action" onClick={() => void copyUrl()}>
                {copied ? "Copiato ✓" : "Copia"}
              </button>
            </div>
            <div className="remote-pin">
              PIN: <strong>{info.pin}</strong>
            </div>
            <button className="setup-recheck remote-stop" disabled={busy} onClick={() => void stop()}>
              {busy ? "Chiudo…" : "Ferma vista remota"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
