import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { MENTION_PREFIX } from './RichText.tsx';

/**
 * Descriptions and comments are Markdown (GitHub's flavour: lists, task lists, tables, code,
 * strikethrough, bare links). A line break in the text is a line break on screen, as it was
 * when these were plain text, so what people wrote before reads the same. Raw HTML in the text
 * is shown as text, never run. A picture is shown as a link to it: attachments are the place
 * for pictures, and a remote one would tell its server who is reading.
 */
export default function RichTextMarkdown({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={`rich-text ${className}`.trim()}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => (url.startsWith(MENTION_PREFIX) ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) =>
            href?.startsWith(MENTION_PREFIX) ? (
              <span className="mention" data-user={href.slice(MENTION_PREFIX.length)}>
                {children}
              </span>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ),
          img: ({ src, alt }) => (
            <a
              href={typeof src === 'string' ? src : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              {alt || 'image'}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
