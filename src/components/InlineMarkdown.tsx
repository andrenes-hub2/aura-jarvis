import type { ReactNode } from "react";

const INLINE_PATTERN = /\*\*(.+?)\*\*|`([^`]+)`/g;

/** Renders **bold** and `code` spans from Claude's plain-text replies as real formatting, instead of showing the literal markdown characters. */
export function InlineMarkdown({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<code key={key++}>{match[2]}</code>);
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return <>{nodes}</>;
}
