const REPO = "andrenes-hub2/aura-jarvis";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function parseVersion(tag: string): string | null {
  const match = tag.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function isNewer(remote: string, local: string): boolean {
  const r = remote.split(".").map(Number);
  const l = local.split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] ?? 0;
    const lv = l[i] ?? 0;
    if (rv !== lv) return rv > lv;
  }
  return false;
}

export interface AvailableUpdate {
  version: string;
  url: string;
}

export async function checkForUpdate(currentVersion: string): Promise<AvailableUpdate | null> {
  const res = await fetch(LATEST_RELEASE_URL);
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string; html_url?: string };
  const remoteVersion = data.tag_name ? parseVersion(data.tag_name) : null;
  if (!remoteVersion || !data.html_url) return null;
  return isNewer(remoteVersion, currentVersion) ? { version: remoteVersion, url: data.html_url } : null;
}
