/*
  Warnings:

  - You are about to drop the column `centroCustoId` on the `despesa` table. All the data in the column will be lost.
  - You are about to drop the column `centroCustoId` on the `entrada` table. All the data in the column will be lost.
  - You are about to drop the `centrocusto` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `centrocusto` DROP FOREIGN KEY `CentroCusto_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `despesa` DROP FOREIGN KEY `Despesa_centroCustoId_fkey`;

-- DropForeignKey
ALTER TABLE `entrada` DROP FOREIGN KEY `Entrada_centroCustoId_fkey`;

-- DropIndex
DROP INDEX `Despesa_centroCustoId_fkey` ON `despesa`;

-- DropIndex
DROP INDEX `Entrada_centroCustoId_fkey` ON `entrada`;

-- AlterTable
ALTER TABLE `despesa` DROP COLUMN `centroCustoId`;

-- AlterTable
ALTER TABLE `entrada` DROP COLUMN `centroCustoId`;

-- DropTable
DROP TABLE `centrocusto`;
