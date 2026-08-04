-- AlterTable
ALTER TABLE `tenant` ADD COLUMN `bannerUrl` VARCHAR(500) NULL,
    ADD COLUMN `descricaoLoja` TEXT NULL,
    ADD COLUMN `endereco` VARCHAR(255) NULL,
    ADD COLUMN `instagram` VARCHAR(100) NULL;
