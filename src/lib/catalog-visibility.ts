import { Prisma } from '@prisma/client';

export const CHRISTMAS_CATEGORY_SLUG = 'christmas-decorations';

// A disabled category pauses every product in it, even if it also has another category.
// Keep publication flags intact so enabling the category restores the collection.
export const storefrontProductWhere = {
  published: true,
  categories: { none: { category: { enabled: false } } },
} satisfies Prisma.ProductWhereInput;

// Product alias is always `p` in storefront catalog queries.
export const storefrontProductSql = Prisma.sql`p.published = true AND NOT EXISTS (
  SELECT 1 FROM ProductCategory hiddenPc
  JOIN Category hiddenCategory ON hiddenCategory.id = hiddenPc.categoryId
  WHERE hiddenPc.productId = p.id AND hiddenCategory.enabled = false
)`;
