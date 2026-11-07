-- An unpublished starter requested by the studio. Choose the price and palette in admin.
START TRANSACTION;
SET @gx_keychain_suffix = IF(EXISTS(
  SELECT 1 FROM `Product` WHERE slug = 'privrzok-so-ime' OR sku = 'GX-NAME-KEYCHAIN'
), CONCAT('-', LEFT(UUID(), 8)), '');
INSERT INTO `Product` (
  id, name, slug, sku, shortDescription, description, price, published, isNew, inventoryMode, updatedAt
) SELECT
  'gx-name-keychain-starter', 'Приврзок со име', CONCAT('privrzok-so-ime', @gx_keychain_suffix),
  CONCAT('GX-NAME-KEYCHAIN', @gx_keychain_suffix),
  'Персонализиран приврзок со име и боја по избор.',
  'Внеси име, избери боја и прегледај го натписот пред нарачка.',
  0, FALSE, FALSE, 'MADE_TO_ORDER', NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `Product` WHERE id = 'gx-name-keychain-starter');
SET @gx_keychain_created = ROW_COUNT();
INSERT INTO `ProductOption` (id, productId, name, kind, required, sortOrder)
SELECT 'gx-name-keychain-starter-name', 'gx-name-keychain-starter', 'Име / Name', 'TEXT', TRUE, 0
WHERE @gx_keychain_created = 1;
COMMIT;
