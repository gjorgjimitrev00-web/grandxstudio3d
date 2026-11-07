CREATE TABLE `GiftProfile` (
  `productId` VARCHAR(191) NOT NULL,
  `occasions` JSON NOT NULL,
  `recipients` JSON NOT NULL,
  PRIMARY KEY (`productId`),
  CONSTRAINT `GiftProfile_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
