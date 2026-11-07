ALTER TABLE `ProductOption`
  ADD COLUMN `keychainRole` VARCHAR(8) NULL,
  ADD UNIQUE INDEX `ProductOption_productId_keychainRole_key` (`productId`, `keychainRole`);

-- Enable only the known development sample that already has both kinds of required option.
-- The explicit SKU, slug and option definitions avoid changing the merchant's other keychains.
UPDATE `ProductOption` AS opt
JOIN `Product` AS p ON p.id = opt.productId
JOIN (
  SELECT productId,
    MAX(CASE WHEN kind = 'TEXT' AND name = 'Персонализиран текст' THEN id END) AS nameId,
    MAX(CASE WHEN kind = 'SELECT' AND name = 'Боја / Color' THEN id END) AS colorId
  FROM ProductOption WHERE required = TRUE GROUP BY productId
  HAVING COUNT(CASE WHEN kind = 'TEXT' AND name = 'Персонализиран текст' THEN 1 END) = 1
     AND COUNT(CASE WHEN kind = 'SELECT' AND name = 'Боја / Color' THEN 1 END) = 1
) AS pair ON pair.productId = p.id
SET opt.keychainRole = IF(opt.id = pair.nameId, 'NAME', 'COLOR')
WHERE p.slug = 'personalized-keychain' AND p.sku = 'GX-SAMPLE-8'
  AND opt.id IN (pair.nameId, pair.colorId)
  AND EXISTS (SELECT 1 FROM ProductOptionValue WHERE optionId = pair.colorId)
  AND NOT EXISTS (SELECT 1 FROM ProductOptionValue WHERE optionId = pair.colorId AND
    (swatch IS NULL OR swatch NOT REGEXP '^#[[:xdigit:]]{6}$'));
