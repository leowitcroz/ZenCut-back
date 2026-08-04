-- AlterTable
ALTER TABLE `assinaturacliente` ADD COLUMN `ilimitado` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `planoassinatura` ADD COLUMN `diasPermitidos` JSON NULL,
    ADD COLUMN `ilimitado` BOOLEAN NOT NULL DEFAULT false;
