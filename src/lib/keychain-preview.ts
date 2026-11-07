export const KEYCHAIN_STARTER_ID = 'gx-name-keychain-starter';
export const MAX_KEYCHAIN_NAME = 16;
export const colorHex = /^#[a-f\d]{6}$/i;
const nameCharacters = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .’'-]*$/u;

export function keychainName(value: string) {
  return value.trim().normalize('NFC');
}

export function validKeychainName(value: string) {
  return Array.from(value).length <= MAX_KEYCHAIN_NAME && nameCharacters.test(value);
}

export type KeychainApproval = { name: string; color: string; hex: string };
export type PreviewOption = {
  id: string;
  name: string;
  required: boolean;
  kind: string;
  keychainRole: string | null;
  values: { value: string; swatch: string | null }[];
};

export function supportsKeychainColor(option: Pick<PreviewOption, 'required' | 'kind' | 'values'>) {
  return (
    option.required &&
    option.kind === 'SELECT' &&
    option.values.length > 0 &&
    option.values.every((item) => colorHex.test(item.swatch || ''))
  );
}

export function keychainOptions<T extends PreviewOption>(options: readonly T[]) {
  const text = options.find((option) => option.keychainRole === 'NAME');
  const color = options.find((option) => option.keychainRole === 'COLOR');
  if (!text || !color || !text.required || text.kind !== 'TEXT' || !supportsKeychainColor(color))
    return null;
  return { text, color };
}

export function keychainSelection(
  options: NonNullable<ReturnType<typeof keychainOptions>>,
  selected: Record<string, string>,
  variantValues: readonly { value: { optionId: string; value: string } }[] = [],
) {
  const value =
    variantValues.find((entry) => entry.value.optionId === options.color.id)?.value.value ||
    selected[options.color.id];
  const swatch = options.color.values.find((item) => item.value === value);
  return {
    name: keychainName(selected[options.text.id] || ''),
    color: swatch?.value ?? '',
    hex: swatch?.swatch?.toUpperCase() ?? '',
  };
}

export function sameKeychain(a: KeychainApproval | null | undefined, b: KeychainApproval) {
  return !!a && a.name === b.name && a.color === b.color && a.hex === b.hex;
}
