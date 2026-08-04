-- CreateTable
CREATE TABLE `RegraComissao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `percentualProduto` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `percentualConsumivel` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `percentualAvulso` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `valorFixoPlano` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `RegraComissao_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RegraComissao` ADD CONSTRAINT `RegraComissao_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
