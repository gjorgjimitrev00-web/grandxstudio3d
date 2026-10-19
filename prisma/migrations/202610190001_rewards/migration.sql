-- AlterTable
ALTER TABLE `Order` ADD COLUMN `earnEveryMkd` INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN `giftPoints` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `giftReturned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `pointsCredited` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pointsEarned` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pointsRestored` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `refundedProducts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `rewardDiscount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `rewardsUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `OrderItem` ADD COLUMN `rewardGift` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `RewardsAccount` (
    `userId` VARCHAR(191) NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardsEntry` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `eventKey` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `points` INTEGER NOT NULL,
    `note` VARCHAR(500) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RewardsEntry_eventKey_key`(`eventKey`),
    INDEX `RewardsEntry_accountId_createdAt_idx`(`accountId`, `createdAt`),
    INDEX `RewardsEntry_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardGift` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RewardGift_productId_key`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_rewardsUserId_status_idx` ON `Order`(`rewardsUserId`, `status`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_rewardsUserId_fkey` FOREIGN KEY (`rewardsUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardsAccount` ADD CONSTRAINT `RewardsAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardsEntry` ADD CONSTRAINT `RewardsEntry_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `RewardsAccount`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardsEntry` ADD CONSTRAINT `RewardsEntry_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardGift` ADD CONSTRAINT `RewardGift_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

