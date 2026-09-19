import { lazy, Suspense, useMemo } from 'react';
import { useProject } from '../pages/ProjectPage.tsx';

/** How a mention reaches the renderer: a Markdown link whose address names the member. */
export const MENTION_PREFIX = 'mention:';

// The Markdown renderer is a good part of the application's size and only matters once there is
// text to show, so it loads on its own the first time it is needed.
const RichTextMarkdown = lazy(() => import('./RichTextMarkdown.tsx'));

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Markdown text of a project. A mention is kept in the text as it reads, "@Devin Developer";
 * here the names of the project's members are found and marked, longest first so that one
 * member's name inside another's does not win. Until the renderer has loaded, the text shows as
 * it was written.
 */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const { project } = useProject();
  const marked = useMemo(() => {
    const members = [...project.members].sort(
      (a, b) => b.displayName.length - a.displayName.length,
    );
    if (members.length === 0 || !text.includes('@')) return text;
    const names = new RegExp(
      `(?<![\\p{L}\\p{N}])@(${members.map((m) => escapeRegExp(m.displayName)).join('|')})(?![\\p{L}\\p{N}])`,
      'giu',
    );
    return text.replace(names, (whole, name: string) => {
      const member = members.find((m) => m.displayName.toLowerCase() === name.toLowerCase());
      return member ? `[@${member.displayName}](${MENTION_PREFIX}${member.userId})` : whole;
    });
  }, [text, project.members]);
  return (
    <Suspense fallback={<div className={`rich-text plain ${className}`.trim()}>{text}</div>}>
      <RichTextMarkdown text={marked} className={className} />
    </Suspense>
  );
}
