import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 1. CRUD DOS PLANOS (Templates que a loja monta do jeito dela)
  // =========================================================================
  async criar(tenantId: string, data: {
    nome: string;
    valorMensal: number;
    ilimitado?: boolean;
    qtdCreditos?: number;
    servicoIds?: number[];
    diasPermitidos?: number[];
  }) {
    return await this.prisma.planoAssinatura.create({
      data: {
        tenantId,
        nome: data.nome,
        valorMensal: Number(data.valorMensal),
        ilimitado: data.ilimitado || false,
        qtdCreditos: data.ilimitado ? 0 : Number(data.qtdCreditos || 0),
        diasPermitidos: data.diasPermitidos && data.diasPermitidos.length > 0 ? data.diasPermitidos : null,
        servicos: data.servicoIds && data.servicoIds.length > 0
          ? { connect: data.servicoIds.map(id => ({ id })) }
          : undefined,
      },
      include: { servicos: true }
    });
  }

  async listarTodos(tenantId: string) {
    return await this.prisma.planoAssinatura.findMany({
      where: { tenantId },
      include: {
        servicos: true,
        _count: { select: { assinaturas: true } }
      },
      orderBy: { nome: 'asc' }
    });
  }

  async atualizar(tenantId: string, id: number, data: {
    nome?: string;
    valorMensal?: number;
    ilimitado?: boolean;
    qtdCreditos?: number;
    servicoIds?: number[];
    diasPermitidos?: number[];
    ativo?: boolean;
  }) {
    const plano = await this.prisma.planoAssinatura.findFirst({ where: { id, tenantId } });
    if (!plano) throw new NotFoundException('Plano não encontrado ou não pertence a este estabelecimento.');

    return await this.prisma.planoAssinatura.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.valorMensal !== undefined && { valorMensal: Number(data.valorMensal) }),
        ...(data.ilimitado !== undefined && { ilimitado: data.ilimitado }),
        ...(data.qtdCreditos !== undefined && { qtdCreditos: Number(data.qtdCreditos) }),
        ...(data.diasPermitidos !== undefined && {
          diasPermitidos: data.diasPermitidos && data.diasPermitidos.length > 0 ? data.diasPermitidos : null
        }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(data.servicoIds !== undefined && {
          servicos: { set: data.servicoIds.map(sid => ({ id: sid })) }
        }),
      },
      include: { servicos: true }
    });
  }

  async deletar(tenantId: string, id: number) {
    const plano = await this.prisma.planoAssinatura.findFirst({ where: { id, tenantId } });
    if (!plano) throw new NotFoundException('Plano não encontrado.');

    const assinaturasAtivas = await this.prisma.assinaturaCliente.count({
      where: { planoId: id, ativo: true }
    });

    if (assinaturasAtivas > 0) {
      throw new ConflictException('Não é possível excluir um plano com assinaturas ativas. Cancele-as primeiro.');
    }

    await this.prisma.planoAssinatura.delete({ where: { id } });
    return { message: 'Plano excluído com sucesso.' };
  }

  // =========================================================================
  // 2. ASSINATURAS (Vincular um Cliente a um dos Planos)
  // =========================================================================
  async assinarCliente(tenantId: string, data: {
    clienteId: number;
    planoId: number;
    dataInicio: string | Date;
    mesesDePlano?: number;
    formaPagamento?: string;
  }) {
    const [cliente, plano] = await Promise.all([
      this.prisma.cliente.findFirst({ where: { id: data.clienteId, tenantId } }),
      this.prisma.planoAssinatura.findFirst({ where: { id: data.planoId, tenantId } }),
    ]);

    if (!cliente) throw new NotFoundException('Cliente não encontrado.');
    if (!plano) throw new NotFoundException('Plano não encontrado.');
    if (!plano.ativo) throw new BadRequestException('Este plano está inativo.');

    const mesesDePlano = Number(data.mesesDePlano || 1);
    const inicio = new Date(data.dataInicio);
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + mesesDePlano);

    // clienteId é @unique em AssinaturaCliente (um cliente só tem UMA linha na vida toda),
    // então trocar/renovar plano é sempre upsert, nunca create puro.
    const payload = {
      planoId: plano.id,
      limiteCreditos: plano.qtdCreditos,
      creditosUsados: 0,
      ilimitado: plano.ilimitado,
      dataInicio: inicio,
      dataFim: fim,
      mesesDePlano,
      ativo: true,
      status: 'Ativo',
      formaPagamento: data.formaPagamento || '',
      tenantId,
      clienteId: cliente.id,
    };

    const assinatura = await this.prisma.assinaturaCliente.upsert({
      where: { clienteId: cliente.id },
      create: payload,
      update: payload,
      include: { plano: true }
    });

    // Registra a renovação/assinatura no histórico (aparece na aba de Renovações
    // e conta como receita no Financeiro).
    await this.prisma.historicoRenovacao.create({
      data: {
        assinaturaId: assinatura.id,
        dataRenovacao: inicio,
        valor: Number(plano.valorMensal),
        tipoPlano: plano.nome,
      }
    });

    return assinatura;
  }

  async cancelarAssinatura(tenantId: string, clienteId: number) {
    const assinatura = await this.prisma.assinaturaCliente.findFirst({ where: { clienteId, tenantId } });
    if (!assinatura) throw new NotFoundException('Assinatura não encontrada.');

    return await this.prisma.assinaturaCliente.update({
      where: { clienteId },
      data: { ativo: false, status: 'Cancelado' }
    });
  }

  // =========================================================================
  // 3. HISTÓRICO DE RENOVAÇÕES (Auditoria de assinaturas/renovações)
  // =========================================================================
  async listarHistoricoRenovacoes(tenantId: string) {
    return await this.prisma.historicoRenovacao.findMany({
      where: { assinatura: { tenantId } },
      include: { assinatura: { include: { cliente: true, plano: true } } },
      orderBy: { dataRenovacao: 'desc' }
    });
  }
}
