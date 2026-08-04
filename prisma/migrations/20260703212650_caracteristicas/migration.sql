-- CreateTable
CREATE TABLE `CentroCusto` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ATIVO',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `subdomain` VARCHAR(191) NOT NULL,
    `nomeNegocio` VARCHAR(255) NOT NULL,
    `documento` VARCHAR(50) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `planoSaaS` ENUM('BASICO', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'BASICO',
    `moduloFinanceiro` BOOLEAN NOT NULL DEFAULT false,
    `moduloAssinaturas` BOOLEAN NOT NULL DEFAULT false,
    `moduloPagamentoWeb` BOOLEAN NOT NULL DEFAULT false,
    `moduloAgendamento` BOOLEAN NOT NULL DEFAULT true,
    `moduloVendas` BOOLEAN NOT NULL DEFAULT false,
    `moduloProdutos` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_subdomain_key`(`subdomain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Entrada` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `centroCustoId` VARCHAR(191) NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    INDEX `Entrada_date_idx`(`date`),
    INDEX `Entrada_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanoAssinatura` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `valorMensal` DECIMAL(10, 2) NOT NULL,
    `qtdCreditos` INTEGER NOT NULL DEFAULT 0,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaturaSaaS` (
    `id` VARCHAR(191) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDENTE',
    `dataInicio` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dataVencimento` DATETIME(3) NOT NULL,
    `dataPagamento` DATETIME(3) NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FaturaSaaS_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Funcionario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` INTEGER NOT NULL DEFAULT 2,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `fotoUrl` VARCHAR(500) NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Funcionario_email_tenantId_key`(`email`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `senha` VARCHAR(255) NULL DEFAULT '',
    `telefone` VARCHAR(20) NULL,
    `role` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Cliente_email_tenantId_key`(`email`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Servico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `valor` DOUBLE NOT NULL DEFAULT 0,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(255) NOT NULL,
    `valor` DECIMAL(10, 2) NOT NULL,
    `estoque` INTEGER NOT NULL DEFAULT 0,
    `tipo` ENUM('PRODUTO', 'CONSUMIVEL') NOT NULL DEFAULT 'PRODUTO',
    `caracteristicas` JSON NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemVenda` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nomeItem` VARCHAR(255) NOT NULL,
    `quantidade` INTEGER NOT NULL DEFAULT 1,
    `valorUnitario` DECIMAL(10, 2) NOT NULL,
    `dataVenda` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tipoOrigem` ENUM('PRODUTO', 'CONSUMIVEL') NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clienteId` INTEGER NULL,
    `funcionarioId` INTEGER NOT NULL,
    `agendamentoId` INTEGER NULL,
    `produtoId` INTEGER NULL,

    INDEX `ItemVenda_clienteId_idx`(`clienteId`),
    INDEX `ItemVenda_funcionarioId_idx`(`funcionarioId`),
    INDEX `ItemVenda_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Disponibilidade` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `data` DATETIME(3) NOT NULL,
    `horaInicio` VARCHAR(5) NOT NULL,
    `horaFim` VARCHAR(5) NOT NULL,
    `disponivel` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenantId` VARCHAR(191) NOT NULL,
    `funcionarioId` INTEGER NOT NULL,

    UNIQUE INDEX `Disponibilidade_funcionarioId_data_horaInicio_key`(`funcionarioId`, `data`, `horaInicio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agendamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nomeCliente` VARCHAR(191) NULL DEFAULT '',
    `servico` VARCHAR(255) NOT NULL,
    `valor` DOUBLE NOT NULL DEFAULT 0,
    `valorServico` DOUBLE NOT NULL DEFAULT 0,
    `tipo` VARCHAR(255) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'agendado',
    `formaPagamento` ENUM('CARTAO', 'PIX', 'DINHEIRO', 'PLANO') NULL,
    `cupom` BOOLEAN NOT NULL DEFAULT false,
    `avaliado` BOOLEAN NOT NULL DEFAULT false,
    `observacoes` TEXT NULL,
    `pago` BOOLEAN NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `creditosGastos` INTEGER NOT NULL DEFAULT 0,
    `tenantId` VARCHAR(191) NOT NULL,
    `clienteId` INTEGER NULL,
    `funcionarioId` INTEGER NOT NULL,
    `horarioId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssinaturaCliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planoId` INTEGER NOT NULL,
    `limiteCreditos` INTEGER NOT NULL DEFAULT 0,
    `creditosUsados` INTEGER NOT NULL DEFAULT 0,
    `dataInicio` DATETIME(3) NOT NULL,
    `dataFim` DATETIME(3) NOT NULL,
    `isAnual` BOOLEAN NOT NULL DEFAULT false,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Ativo',
    `formaPagamento` VARCHAR(191) NOT NULL DEFAULT '',
    `renovacaoAutomatica` BOOLEAN NOT NULL DEFAULT true,
    `mesesDePlano` INTEGER NOT NULL DEFAULT 1,
    `anosDePlano` INTEGER NOT NULL DEFAULT 1,
    `parcelas` INTEGER NOT NULL DEFAULT 1,
    `tenantId` VARCHAR(191) NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `funcionarioId` INTEGER NULL,

    UNIQUE INDEX `AssinaturaCliente_clienteId_key`(`clienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Despesa` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `type` ENUM('FIXED', 'VARIABLE') NOT NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `centroCustoId` VARCHAR(191) NULL,
    `produtoId` INTEGER NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    INDEX `Despesa_date_idx`(`date`),
    INDEX `Despesa_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DespesaRecorrente` (
    `id` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `dayOfMonth` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Indicacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `emailIndicado` VARCHAR(255) NOT NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `convertido` BOOLEAN NOT NULL DEFAULT false,
    `tenantId` VARCHAR(191) NOT NULL,
    `clienteId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Avaliacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nota` INTEGER NOT NULL,
    `comentario` VARCHAR(500) NULL,
    `data` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resposta` VARCHAR(500) NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `agendamentoId` INTEGER NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `funcionarioId` INTEGER NOT NULL,

    UNIQUE INDEX `Avaliacao_agendamentoId_key`(`agendamentoId`),
    INDEX `Avaliacao_funcionarioId_idx`(`funcionarioId`),
    INDEX `Avaliacao_clienteId_idx`(`clienteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricoRenovacao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dataRenovacao` DATETIME(3) NOT NULL,
    `valor` DOUBLE NOT NULL,
    `tipoPlano` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assinaturaId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tabela_afetada` VARCHAR(100) NOT NULL,
    `item_id` INTEGER NOT NULL,
    `item_nome` VARCHAR(255) NULL,
    `estoque_antigo` INTEGER NULL,
    `estoque_novo` INTEGER NULL,
    `quem_fez_id` VARCHAR(100) NULL,
    `quando_mudou` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tenantId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_PlanoAssinaturaToServico` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_PlanoAssinaturaToServico_AB_unique`(`A`, `B`),
    INDEX `_PlanoAssinaturaToServico_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CentroCusto` ADD CONSTRAINT `CentroCusto_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entrada` ADD CONSTRAINT `Entrada_centroCustoId_fkey` FOREIGN KEY (`centroCustoId`) REFERENCES `CentroCusto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Entrada` ADD CONSTRAINT `Entrada_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanoAssinatura` ADD CONSTRAINT `PlanoAssinatura_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaturaSaaS` ADD CONSTRAINT `FaturaSaaS_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Funcionario` ADD CONSTRAINT `Funcionario_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Servico` ADD CONSTRAINT `Servico_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Produto` ADD CONSTRAINT `Produto_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVenda` ADD CONSTRAINT `ItemVenda_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVenda` ADD CONSTRAINT `ItemVenda_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVenda` ADD CONSTRAINT `ItemVenda_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `Funcionario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVenda` ADD CONSTRAINT `ItemVenda_agendamentoId_fkey` FOREIGN KEY (`agendamentoId`) REFERENCES `Agendamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemVenda` ADD CONSTRAINT `ItemVenda_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Disponibilidade` ADD CONSTRAINT `Disponibilidade_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Disponibilidade` ADD CONSTRAINT `Disponibilidade_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `Funcionario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agendamento` ADD CONSTRAINT `Agendamento_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agendamento` ADD CONSTRAINT `Agendamento_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agendamento` ADD CONSTRAINT `Agendamento_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `Funcionario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agendamento` ADD CONSTRAINT `Agendamento_horarioId_fkey` FOREIGN KEY (`horarioId`) REFERENCES `Disponibilidade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssinaturaCliente` ADD CONSTRAINT `AssinaturaCliente_planoId_fkey` FOREIGN KEY (`planoId`) REFERENCES `PlanoAssinatura`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssinaturaCliente` ADD CONSTRAINT `AssinaturaCliente_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssinaturaCliente` ADD CONSTRAINT `AssinaturaCliente_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssinaturaCliente` ADD CONSTRAINT `AssinaturaCliente_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `Funcionario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Despesa` ADD CONSTRAINT `Despesa_centroCustoId_fkey` FOREIGN KEY (`centroCustoId`) REFERENCES `CentroCusto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Despesa` ADD CONSTRAINT `Despesa_produtoId_fkey` FOREIGN KEY (`produtoId`) REFERENCES `Produto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Despesa` ADD CONSTRAINT `Despesa_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DespesaRecorrente` ADD CONSTRAINT `DespesaRecorrente_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Indicacao` ADD CONSTRAINT `Indicacao_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Indicacao` ADD CONSTRAINT `Indicacao_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avaliacao` ADD CONSTRAINT `Avaliacao_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avaliacao` ADD CONSTRAINT `Avaliacao_agendamentoId_fkey` FOREIGN KEY (`agendamentoId`) REFERENCES `Agendamento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avaliacao` ADD CONSTRAINT `Avaliacao_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Avaliacao` ADD CONSTRAINT `Avaliacao_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `Funcionario`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricoRenovacao` ADD CONSTRAINT `HistoricoRenovacao_assinaturaId_fkey` FOREIGN KEY (`assinaturaId`) REFERENCES `AssinaturaCliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Auditoria` ADD CONSTRAINT `Auditoria_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PlanoAssinaturaToServico` ADD CONSTRAINT `_PlanoAssinaturaToServico_A_fkey` FOREIGN KEY (`A`) REFERENCES `PlanoAssinatura`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_PlanoAssinaturaToServico` ADD CONSTRAINT `_PlanoAssinaturaToServico_B_fkey` FOREIGN KEY (`B`) REFERENCES `Servico`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
