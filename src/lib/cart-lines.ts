import type { KeychainApproval } from './keychain-preview';

type CartSelection = {
  productId: string;
  variantId?: string;
  quantity: number;
  options: Record<string, string>;
  keychain?: KeychainApproval;
};

// The progress meter, checkout quote and final submission must price the same selection.
export function cartQuoteItems(items: readonly CartSelection[]) {
  return items.map(({ productId, variantId, quantity, options, keychain }) => ({
    productId,
    variantId,
    quantity,
    options,
    keychain,
  }));
}
