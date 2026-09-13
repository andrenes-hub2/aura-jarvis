import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "error";

export async function checkForUpdate(): Promise<Update | null> {
  return check();
}
