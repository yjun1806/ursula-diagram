// Splits a stream into messages at '\n' only. node:readline also ends a line at U+2028, U+2029 and a lone '\r',
// which JSON allows inside a string, so it would cut one message in two.

/** Feeds chunks of text in and calls `onLine` with each line, without its '\n' or a '\r' before it. */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = '';
  const emit = (line: string): void => onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
  return {
    push(chunk) {
      rest += chunk;
      let at = rest.indexOf('\n');
      while (at >= 0) {
        emit(rest.slice(0, at));
        rest = rest.slice(at + 1);
        at = rest.indexOf('\n');
      }
    },
    end() {
      if (rest !== '') emit(rest);
      rest = '';
    },
  };
}

/** One message as one line of JSON: U+2028 and U+2029 escaped, so no reader that splits at them cuts it. */
export const messageLine = (message: unknown): string => `${JSON.stringify(message).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}\n`;
