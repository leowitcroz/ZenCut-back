import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanoSaaS } from '@prisma/client';
import { NOME_PADRAO_PLANO, VALOR_PADRAO_PLANO } from './planos.constants';

@Injectable()
export class AdmService {
  constructor(private prisma: PrismaService) {}

  // Busca todos os estabelecimentos da plataforma
  async getAllTenants() {
    return this.prisma.tenant.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      // 👇 Inclusão obrigatória para o seu Frontend conseguir mostrar as etiquetas de "Pendente" / "Pago"
      include: {
        faturasSaaS: {
          orderBy: { createdAt: 'desc' },
          take: 1, 
        }
      }
    });
  }

  // Busca todos os funcionários/barbeiros de todas as lojas
  async getAllFuncionarios() {
    return this.prisma.funcionario.findMany({
      orderBy: {
        nome: 'asc',
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        ativo: true,
        tenantId: true,
      }
    });
  }

  // Busca todos os clientes finais cadastrados na plataforma
  async getAllClientes() {
    return this.prisma.cliente.findMany({
      orderBy: {
        nome: 'asc',
      },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        tenantId: true,
      }
    });
  }

  // =========================================================
  // PREÇOS DOS PLANOS (editável pelo ADM, sem precisar mexer em código)
  // =========================================================

  // Garante que sempre existe um preço configurado pra cada plano (auto-seed com valores padrão)
  async listarPlanosPreco() {
    const planos = Object.values(PlanoSaaS);

    await Promise.all(planos.map(plano =>
      this.prisma.planoPreco.upsert({
        where: { plano },
        update: {},
        create: {
          plano,
          nome: NOME_PADRAO_PLANO[plano],
          valorMensal: VALOR_PADRAO_PLANO[plano],
        },
      })
    ));

    return this.prisma.planoPreco.findMany({ orderBy: { valorMensal: 'asc' } });
  }

  async atualizarPlanoPreco(plano: PlanoSaaS, dados: { nome?: string; valorMensal?: number }) {
    return this.prisma.planoPreco.upsert({
      where: { plano },
      update: {
        ...(dados.nome !== undefined && { nome: dados.nome }),
        ...(dados.valorMensal !== undefined && { valorMensal: dados.valorMensal }),
      },
      create: {
        plano,
        nome: dados.nome || NOME_PADRAO_PLANO[plano],
        valorMensal: dados.valorMensal ?? VALOR_PADRAO_PLANO[plano],
      },
    });
  }

  // Valor mensal vigente de um plano (usado ao gerar faturas — nunca hardcoded)
  async buscarValorVigentePlano(plano: PlanoSaaS): Promise<number> {
    const preco = await this.prisma.planoPreco.findUnique({ where: { plano } });
    return preco ? Number(preco.valorMensal) : VALOR_PADRAO_PLANO[plano];
  }

  // =========================================================
  // HISTÓRICO DE PAGAMENTOS DE UMA LOJA
  // =========================================================
  async historicoPagamentos(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    return this.prisma.faturaSaaS.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // =========================================================
  // GESTÃO DOS TENANTS (LOJAS) E RENOVAÇÕES
  // =========================================================

  // 1. Atualizar o Plano, Módulos e o Financeiro (Renovação) do Cliente
  async atualizarPlanoLoja(tenantId: string, dadosPlano: { 
    planoSaaS: PlanoSaaS; 
    moduloAgendamento?: boolean; 
    moduloFinanceiro?: boolean; 
    moduloProdutos?: boolean;
    moduloVendas?: boolean;
    moduloAssinaturas?: boolean;
    // 👇 Novos campos opcionais para o controle financeiro do Admin Master
    statusFinanceiro?: string; // Ex: 'ATIVO', 'PENDENTE', 'ATRASADO'
    gerarNovaFatura?: boolean; // Passar 'true' quando for uma renovação mensal
    valorFatura?: number;      // O valor que foi cobrado nesta renovação
  }) {
    const lojaExiste = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!lojaExiste) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    // Executamos tudo dentro de uma transação para proteger a integridade dos dados
    return await this.prisma.$transaction(async (tx) => {
      
      // A. Atualiza as permissões e o plano da loja (O que você já tinha feito)
      const tenantAtualizado = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          planoSaaS: dadosPlano.planoSaaS,
          ...(dadosPlano.moduloAgendamento !== undefined && { moduloAgendamento: dadosPlano.moduloAgendamento }),
          ...(dadosPlano.moduloFinanceiro !== undefined && { moduloFinanceiro: dadosPlano.moduloFinanceiro }),
          ...(dadosPlano.moduloProdutos !== undefined && { moduloProdutos: dadosPlano.moduloProdutos }),
          ...(dadosPlano.moduloVendas !== undefined && { moduloVendas: dadosPlano.moduloVendas }),
          ...(dadosPlano.moduloAssinaturas !== undefined && { moduloAssinaturas: dadosPlano.moduloAssinaturas }),
        },
      });

      const hoje = new Date();

      // B. Cria um NOVO registro no histórico de renovação
      if (dadosPlano.gerarNovaFatura) {
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 30); // Projeta o próximo vencimento para 30 dias

        const valor = dadosPlano.valorFatura ?? await this.buscarValorVigentePlano(dadosPlano.planoSaaS);

        await tx.faturaSaaS.create({
          data: {
            tenantId: tenantId,
            valor,
            status: dadosPlano.statusFinanceiro || 'ATIVO', // Se está gerando, normalmente já entra como ATIVO
            dataInicio: hoje,
            dataVencimento: vencimento,
            dataPagamento: dadosPlano.statusFinanceiro === 'ATIVO' ? hoje : null,
          }
        });
      }
      
      // C. Se não mandou gerar nova, mas mandou mudar o status (Ex: Dar baixa manual em uma fatura PENDENTE)
      else if (dadosPlano.statusFinanceiro) {
        const ultimaFatura = await tx.faturaSaaS.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' }
        });

        if (ultimaFatura) {
          await tx.faturaSaaS.update({
            where: { id: ultimaFatura.id },
            data: {
              status: dadosPlano.statusFinanceiro,
              // Grava a data de hoje apenas se estiver mudando para ATIVO agora
              dataPagamento: dadosPlano.statusFinanceiro === 'ATIVO' && ultimaFatura.status !== 'ATIVO' 
                ? hoje 
                : ultimaFatura.dataPagamento
            }
          });
        }
      }

      return tenantAtualizado;
    });
  }

  // 1.1 Confirmar o pagamento da fatura mais recente e liberar/renovar o acesso da loja
  async confirmarPagamento(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    const ultimaFatura = await this.prisma.faturaSaaS.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });

    if (!ultimaFatura) {
      throw new NotFoundException('Nenhuma fatura encontrada para esta loja.');
    }

    const hoje = new Date();
    const proximoVencimento = new Date(hoje);
    proximoVencimento.setDate(proximoVencimento.getDate() + 30); // Próximo ciclo: 30 dias a partir de hoje

    return await this.prisma.$transaction(async (tx) => {
      const faturaAtualizada = await tx.faturaSaaS.update({
        where: { id: ultimaFatura.id },
        data: {
          status: 'ATIVO',
          dataPagamento: hoje,
          dataVencimento: proximoVencimento,
        }
      });

      const tenantAtualizado = await tx.tenant.update({
        where: { id: tenantId },
        data: { ativo: true }
      });

      return { tenant: tenantAtualizado, fatura: faturaAtualizada };
    });
  }

  // 2. Bloquear ou Desbloquear a Loja (Acesso ao Sistema)
  async alterarStatusLoja(tenantId: string, status: boolean) {
    const lojaExiste = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!lojaExiste) {
      throw new NotFoundException('Estabelecimento não encontrado no sistema.');
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ativo: status,
      },
    });
  }
}