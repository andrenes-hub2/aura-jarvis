import { useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { checkForUpdate, type UpdatePhase } from "../engine/updateCheck";
import "./UpdateBadge.css";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

const LABEL: Record<UpdatePhase, string> = {
  idle: "",
  checking: "",
  available: "Aggiorna AURA",
  downloading: "Scaricamento…",
  installing: "Installazione…",
  error: "Aggiornamento fallito",
};

export function UpdateBadge() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const progressRef = useRef({ downloaded: 0, total: 0 });
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setPhase((p) => (p === "idle" ? "checking" : p));
        const found = await checkForUpdate();
        if (!cancelled) {
          if (found) {
            setUpdate(found);
            setPhase("available");
          } else {
            setPhase("idle");
          }
        }
      } catch {
        // Offline, rate-limited, or no release yet — silently retry next interval.
        if (!cancelled) setPhase("idle");
      }
    }

    run();
    const id = setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleClick() {
    if (!update || phase === "downloading" || phase === "installing") return;
    try {
      setPhase("downloading");
      progressRef.current = { downloaded: 0, total: 0 };
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          progressRef.current.total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          progressRef.current.downloaded += event.data.chunkLength;
          const { downloaded, total } = progressRef.current;
          setProgressPct(total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0);
        } else if (event.event === "Finished") {
          setPhase("installing");
        }
      });
      await relaunch();
    } catch {
      setPhase("error");
    }
  }

  if (phase === "idle" || phase === "checking" || !LABEL[phase]) return null;

  const busy = phase === "downloading" || phase === "installing";

  return (
    <button className="update-badge" onClick={() => void handleClick()} disabled={busy} title="Scarica e installa l'ultima versione di AURA, poi riavvia">
      <span className="update-badge-dot" />
      {LABEL[phase]}
      {phase === "downloading" && progressPct > 0 ? ` ${progressPct}%` : ""}
    </button>
  );
}
