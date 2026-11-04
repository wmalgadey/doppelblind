/**
 * Finds a field marker such as `**Answer:**` at the start of a line, from `from` on; the field's text may follow on the
 * same line. The same words inside a question's or an assumption's text are not the field. `start` and `end` are the
 * offsets of the marker itself.
 */
export function findField(text: string, mark: string, from = 0): { start: number; end: number } | undefined {
  const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = new RegExp(`^${escaped}`, "gm");
  line.lastIndex = from;
  const match = line.exec(text);
  return match ? { start: match.index, end: match.index + mark.length } : undefined;
}
