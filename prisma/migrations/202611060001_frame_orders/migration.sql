CREATE TABLE `FrameOrder` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(32) NOT NULL,
    `idempotencyKey` CHAR(36) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `paper` VARCHAR(12) NOT NULL,
    `unitPrice` INTEGER NULL,
    `notes` TEXT NOT NULL,
    `design` JSON NOT NULL,
    `effectivePpi` JSON NOT NULL,
    `pdfBytes` INTEGER NOT NULL,
    `previewBytes` INTEGER NOT NULL,
    `status` ENUM('NEW','REVIEWING','QUOTE_SENT','APPROVED','PRINTING','COMPLETED','REJECTED') NOT NULL DEFAULT 'NEW',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `FrameOrder_reference_key`(`reference`),
    UNIQUE INDEX `FrameOrder_idempotencyKey_key`(`idempotencyKey`),
    INDEX `FrameOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FrameAssetChunk` (
    `orderId` VARCHAR(191) NOT NULL,
    `kind` ENUM('PRINT','PREVIEW') NOT NULL,
    `position` INTEGER NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    PRIMARY KEY (`orderId`, `kind`, `position`),
    CONSTRAINT `FrameAssetChunk_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `FrameOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
