-- CreateTable
CREATE TABLE `ChatConversation` (
    `id` VARCHAR(191) NOT NULL,
    `visitorTokenHash` CHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `preview` VARCHAR(200) NOT NULL,
    `lastVisitorMessageId` INTEGER NOT NULL DEFAULT 0,
    `lastAdminMessageId` INTEGER NOT NULL DEFAULT 0,
    `adminReadThrough` INTEGER NOT NULL DEFAULT 0,
    `visitorReadThrough` INTEGER NOT NULL DEFAULT 0,
    `messageCount` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatConversation_visitorTokenHash_key`(`visitorTokenHash`),
    INDEX `ChatConversation_status_lastMessageAt_idx`(`status`, `lastMessageAt`),
    INDEX `ChatConversation_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` VARCHAR(191) NOT NULL,
    `sender` ENUM('VISITOR', 'ADMIN') NOT NULL,
    `text` TEXT NOT NULL,
    `clientId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_conversationId_id_idx`(`conversationId`, `id`),
    UNIQUE INDEX `ChatMessage_conversationId_clientId_key`(`conversationId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatPresence` (
    `userId` VARCHAR(191) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatPresence_lastSeenAt_idx`(`lastSeenAt`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatPresence` ADD CONSTRAINT `ChatPresence_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

