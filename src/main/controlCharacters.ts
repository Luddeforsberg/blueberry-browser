// U+0000 to U+001F and DEL (U+007F). The C1 controls from U+0080 to U+009F stay as they are.
const isControl = (char: string): boolean => {
  const code = char.charCodeAt(0);
  return code < 0x20 || code === 0x7f;
};

// Every control character in `text`, each one put back as `replacement`.
export const replaceControlCharacters = (text: string, replacement: string): string =>
  Array.from(text, (char) => (isControl(char) ? replacement : char)).join("");
