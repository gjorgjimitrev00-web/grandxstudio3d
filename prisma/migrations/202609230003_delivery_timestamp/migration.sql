ALTER TABLE `Order` ADD COLUMN `deliveredAt` DATETIME(3) NULL;
UPDATE `Order` o SET deliveredAt = (SELECT MIN(h.createdAt) FROM OrderStatusHistory h WHERE h.orderId=o.id AND h.status='DELIVERED') WHERE o.status='DELIVERED';
CREATE INDEX Order_deliveredAt_idx ON `Order`(deliveredAt);
