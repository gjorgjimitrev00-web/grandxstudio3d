import { productPrice, type PricedProduct, type PricedVariant } from './campaign-rules';

export const occasions = {
  birthday: ['Роденден', 'Birthday'],
  anniversary: ['Годишнина', 'Anniversary'],
  home: ['Нов дом', 'Housewarming'],
  celebration: ['Свадба или крштевка', 'Wedding or baptism'],
  holidays: ['Празници', 'Holidays'],
  everyday: ['Мало внимание', 'Just because'],
} as const;
export const recipients = {
  partner: ['Партнер', 'Partner'],
  friend: ['Пријател', 'Friend'],
  family: ['Семејство', 'Family'],
  child: ['Дете', 'Child'],
  colleague: ['Колега', 'Colleague'],
} as const;
export type Occasion = keyof typeof occasions;
export type Recipient = keyof typeof recipients;
export type GiftTags = { occasions: Occasion[]; recipients: Recipient[] };
type CatalogGift = {
  name: string;
  slug: string;
  categories: { category: { name: string; slug: string } }[];
  giftProfile: { occasions: unknown; recipients: unknown } | null;
};

export function giftTags(product: CatalogGift): GiftTags {
  if (product.giftProfile) {
    const { occasions: savedOccasions, recipients: savedRecipients } = product.giftProfile;
    return {
      occasions: Array.isArray(savedOccasions)
        ? savedOccasions.filter((k): k is Occasion => Object.hasOwn(occasions, k))
        : [],
      recipients: Array.isArray(savedRecipients)
        ? savedRecipients.filter((k): k is Recipient => Object.hasOwn(recipients, k))
        : [],
    };
  }
  const words = [
    product.name,
    product.slug,
    ...product.categories.flatMap(({ category }) => [category.name, category.slug]),
  ]
    .join(' ')
    .toLowerCase();
  const when = new Set<Occasion>(['birthday', 'everyday']);
  const who = new Set<Recipient>(['friend', 'family']);
  if (/ваз[ан]|вазн|vase|vazna|vazni|lampa|lamp|ламб|lighting|decor|декор|home/.test(words))
    when.add('home');
  if (/цвет|flower|rose|roza|роза|love|љубов|personaliz|персонализ|lithophane/.test(words)) {
    when.add('anniversary');
    when.add('celebration');
    who.add('partner');
  }
  if (
    /desk|office|организ|organiz|телефон|phone|stand|држач|holder|keychain|приврзок|privrzok/.test(
      words,
    )
  )
    who.add('colleague');
  if (/меч[ек]|meche|balloon|балон|зајаче|zajache|tigarche|тигарче|животн|animal/.test(words))
    who.add('child');
  if (/christmas|holiday|божи[ќк]|новогод|елка|елки/.test(words)) when.add('holidays');
  return { occasions: [...when], recipients: [...who] };
}

type Variant = PricedVariant & { enabled: boolean; stock: number };
export function giftPricing(
  p: PricedProduct & {
    trackInventory: boolean;
    stock: number;
    inventoryMode: string;
    variants: Variant[];
  },
) {
  if (p.inventoryMode === 'OUT_OF_STOCK') return null;
  if (!p.variants.length)
    return !p.trackInventory || p.stock > 0
      ? { price: productPrice(p).price, varies: false }
      : null;
  const prices = p.variants
    .filter((v) => v.enabled && (!p.trackInventory || v.stock > 0))
    .map((v) => productPrice(p, v).price);
  return prices.length
    ? { price: Math.min(...prices), varies: Math.max(...prices) !== Math.min(...prices) }
    : null;
}
