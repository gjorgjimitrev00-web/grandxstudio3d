CREATE TABLE `ProductReview` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `consentAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ProductReview_orderId_productId_key`(`orderId`, `productId`),
    INDEX `ProductReview_productId_status_createdAt_idx`(`productId`, `status`, `createdAt`),
    INDEX `ProductReview_status_createdAt_idx`(`status`, `createdAt`),
    CONSTRAINT `ProductReview_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ProductReview_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProductReviewPhoto` (
    `reviewId` VARCHAR(191) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    PRIMARY KEY (`reviewId`),
    CONSTRAINT `ProductReviewPhoto_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `ProductReview`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
