import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Render assistant (or any) message text as Markdown. Raw HTML is not enabled. */
export default function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
