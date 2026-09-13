export interface CheckResult {
  ok: boolean;
  detail: string;
}

export interface Diagnostics {
  node: CheckResult;
  npm: CheckResult;
  claude: CheckResult;
  claudeAuth: CheckResult;
  ruflo: CheckResult;
  playwright: CheckResult;
  skills: CheckResult;
}

export function needsSetup(d: Diagnostics | null): boolean {
  if (!d) return false;
  return !d.node.ok || !d.npm.ok || !d.claude.ok || !d.claudeAuth.ok || !d.ruflo.ok;
}
