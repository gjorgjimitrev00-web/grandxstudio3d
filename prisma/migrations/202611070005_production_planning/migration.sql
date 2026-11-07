ALTER TABLE `Order` ADD COLUMN `productionDue` CHAR(10) NULL, ADD COLUMN `productionStation` VARCHAR(12) NULL, ADD COLUMN `productionMaterial` VARCHAR(120) NULL;
ALTER TABLE `CustomPrintRequest` ADD COLUMN `productionDue` CHAR(10) NULL, ADD COLUMN `productionStation` VARCHAR(12) NULL, ADD COLUMN `productionMaterial` VARCHAR(120) NULL;
ALTER TABLE `FrameOrder` ADD COLUMN `productionDue` CHAR(10) NULL, ADD COLUMN `productionStation` VARCHAR(12) NULL, ADD COLUMN `productionMaterial` VARCHAR(120) NULL;
