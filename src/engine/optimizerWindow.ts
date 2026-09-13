import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";

const LABEL = "prompt-optimizer";

/** Opens the standalone prompt-optimizer chat window, or focuses it if it's already open. */
export async function openPromptOptimizer() {
  const existing = (await getAllWebviewWindows()).find((w) => w.label === LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }

  new WebviewWindow(LABEL, {
    url: "index.html?window=prompt-optimizer",
    title: "Ottimizzatore prompt — ruflo",
    width: 480,
    height: 700,
    minWidth: 380,
    minHeight: 480,
  });
}
