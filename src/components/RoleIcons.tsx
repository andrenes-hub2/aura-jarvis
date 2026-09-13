import type { AgentRole } from "../types";

/**
 * A small authored icon set, one consistent stroke weight and cap style
 * across every glyph — deliberately not emoji standing in for icons
 * (inconsistent weight, renders differently per OS/font, reads as a
 * placeholder rather than a designed system).
 */
const PATHS: Record<AgentRole, string> = {
  coordinator: "M12 6.4v3M13.6 13.6l3.8 1.4M10.4 13.6l-3.8 1.4",
  coder: "M14.7 6.3a4 4 0 1 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z",
  reviewer: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z",
  tester: "M15.5 15.5 20 20",
  architect: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  security: "M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z M9 12l2 2 4-4",
  researcher: "",
};

export function RoleIcon({ role }: { role: AgentRole }) {
  return (
    <svg viewBox="0 0 24 24" className="role-icon" aria-hidden="true">
      {role === "coordinator" && (
        <>
          <circle cx="12" cy="12" r="2.4" />
          <circle cx="12" cy="4" r="1.6" />
          <circle cx="19" cy="16" r="1.6" />
          <circle cx="5" cy="16" r="1.6" />
          <path d={PATHS.coordinator} />
        </>
      )}
      {role === "coder" && <path d={PATHS.coder} />}
      {role === "reviewer" && (
        <>
          <path d={PATHS.reviewer} />
          <circle cx="12" cy="12" r="2.6" />
        </>
      )}
      {role === "tester" && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d={PATHS.tester} />
        </>
      )}
      {role === "architect" && <path d={PATHS.architect} />}
      {role === "security" && <path d={PATHS.security} />}
      {role === "researcher" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
