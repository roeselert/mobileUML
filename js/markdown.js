import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

export function render(source) {
  const html = marked.parse(source);
  return DOMPurify.sanitize(html);
}
