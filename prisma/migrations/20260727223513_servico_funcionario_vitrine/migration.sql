-- AlterTable
ALTER TABLE `funcionario` ADD COLUMN `descricao` TEXT NULL;

-- AlterTable
ALTER TABLE `servico` ADD COLUMN `descricao` TEXT NULL,
    ADD COLUMN `fotoUrl` VARCHAR(500) NULL;
