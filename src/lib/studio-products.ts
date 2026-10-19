/** Give each collection a place before filling the remaining slots with recent products. */
export function selectStudioProducts<T extends { id: string }>(
  collections: T[][],
  recent: T[],
  limit = 8,
): T[] {
  const selected = new Map<string, T>();
  const add = (product: T) => {
    if (selected.size < limit && !selected.has(product.id)) selected.set(product.id, product);
  };

  const depth = Math.max(0, ...collections.map((products) => products.length));
  for (let index = 0; index < depth && selected.size < limit; index++) {
    for (const products of collections) {
      if (products[index]) add(products[index]);
    }
  }
  recent.forEach(add);
  return [...selected.values()];
}
