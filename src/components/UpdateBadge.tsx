import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkForUpdate, type AvailableUpdate } from "../engine/updateCheck";
import "./UpdateBadge.css";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function UpdateBadge() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const current = await getVersion();
        const found = await checkForUpdate(current);
        if (!cancelled && found) setUpdate(found);
      } catch {
        // Offline, rate-limited, or no release yet — silently retry next interval.
      }
    }

    run();
    const id = setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!update) return null;

  return (
    <button
      className="update-badge"
      onClick={() => void openUrl(update.url)}
      title={`Nuova versione disponibile: v${update.version}`}
    >
      <span className="update-badge-dot" />
      Update AURA
    </button>
  );
}
