ALTER TABLE `Order`
    ADD COLUMN `source` ENUM('ONLINE', 'MANUAL') NOT NULL DEFAULT 'ONLINE',
    ADD COLUMN `orderedAt` DATETIME(3) NULL,
    ADD COLUMN `enteredById` VARCHAR(191) NULL,
    ADD COLUMN `entryFingerprint` CHAR(64) NULL;

UPDATE `Order` SET `orderedAt` = `createdAt` WHERE `orderedAt` IS NULL;

ALTER TABLE `Order`
    MODIFY `orderedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD CONSTRAINT `Order_enteredById_fkey` FOREIGN KEY (`enteredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `Order_orderedAt_idx` ON `Order`(`orderedAt`);
CREATE INDEX `Order_source_orderedAt_idx` ON `Order`(`source`, `orderedAt`);
CREATE INDEX `Order_paidAt_idx` ON `Order`(`paidAt`);

CREATE TABLE `VisitorDay` (
    `id` VARCHAR(191) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `visitorHash` CHAR(64) NOT NULL,
    `country` VARCHAR(2) NOT NULL DEFAULT '',
    `city` VARCHAR(120) NOT NULL DEFAULT '',
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `VisitorDay_day_visitorHash_key`(`day`, `visitorHash`),
    INDEX `VisitorDay_day_country_city_idx`(`day`, `country`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
