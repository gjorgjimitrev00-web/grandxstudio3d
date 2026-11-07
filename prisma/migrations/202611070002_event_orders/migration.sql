CREATE TABLE `EventOrderRequest` (
    `id` VARCHAR(191) NOT NULL, `requestKey` CHAR(36) NOT NULL, `fingerprint` CHAR(64) NOT NULL,
    `userId` VARCHAR(191) NULL, `productId` VARCHAR(191) NULL, `productName` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL, `company` VARCHAR(191) NULL, `phone` VARCHAR(40) NOT NULL, `email` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL, `eventDate` CHAR(10) NOT NULL, `notes` TEXT NOT NULL, `names` MEDIUMTEXT NULL,
    `status` ENUM('NEW','REVIEWING','QUOTE_SENT','APPROVED','PRINTING','COMPLETED','REJECTED') NOT NULL DEFAULT 'NEW',
    `revision` INTEGER NOT NULL DEFAULT 0, `unitPrice` INTEGER NULL, `shipping` INTEGER NULL,
    `shippingId` VARCHAR(191) NULL, `shippingName` VARCHAR(191) NULL, `readyBy` CHAR(10) NULL,
    `quoteNotes` TEXT NULL, `orderId` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `EventOrderRequest_requestKey_key`(`requestKey`),
    UNIQUE INDEX `EventOrderRequest_orderId_key`(`orderId`),
    INDEX `EventOrderRequest_status_eventDate_idx`(`status`, `eventDate`),
    PRIMARY KEY (`id`),
    CONSTRAINT `EventOrderRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EventOrderAsset` (
    `requestId` VARCHAR(191) NOT NULL, `kind` VARCHAR(12) NOT NULL, `data` MEDIUMBLOB NOT NULL,
    PRIMARY KEY (`requestId`, `kind`),
    CONSTRAINT `EventOrderAsset_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `EventOrderRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
