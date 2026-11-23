/**
 * The server titles a notification with the first line of its text (the
 * create form has a single text box), so title and body usually repeat each
 * other. This returns what to show without the repetition:
 *
 *   - one line ("Hello")           -> heading "Hello", no text
 *   - several lines ("Hi\nMore")   -> heading "Hi", text "More"
 *   - a real, different title      -> heading = title, text = body
 *
 * @param {string} title
 * @param {string} body  The summary (list) or the full body (details)
 * @returns {{ heading: string, text: string }}
 */
export function notificationText(title, body) {
  const heading = String(title || '').trim();
  const text = String(body || '').trim();

  if (!text) return { heading, text: '' };
  if (!heading || text === heading) return { heading: text, text: '' };

  if (text.startsWith(heading)) {
    const rest = text.slice(heading.length);
    if (!rest.trim()) return { heading, text: '' };
    // The title is the first line: show the remaining lines under it.
    if (/^[ \t]*\r?\n/.test(rest)) return { heading, text: rest.trim() };
    // The title was cut mid-line (very long first line): show the text once.
    return { heading: text, text: '' };
  }

  return { heading, text };
}

export default notificationText;
