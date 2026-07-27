const SANS_SERIF_BOLD_LOWERCASE_A = 0x1d5ee;

export function codeLensActionTitle(
  action: string,
  selected: boolean,
  actions: readonly string[]
): string {
  const prefix = action === actions[0] ? '[ ' : '';
  const title = selected ? `✓ ${boldLowercase(action)}` : action;
  const suffix = action === actions[actions.length - 1] ? ' ]' : '';

  return `${prefix}${title}${suffix}`;
}

function boldLowercase(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.charCodeAt(0);
      if (codePoint < 97 || codePoint > 122) {
        return character;
      }
      return String.fromCodePoint(SANS_SERIF_BOLD_LOWERCASE_A + codePoint - 97);
    })
    .join('');
}
