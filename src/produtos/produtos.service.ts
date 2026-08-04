import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TipoProduto } from '@prisma/client';

@Injectable()
export class ProdutosService {
  constructor(private readonly prisma: PrismaService) { }

  // =========================================================================
  // CRIAR NOVO PRODUTO COM ESTOQUE COMPLEXO (ATRIBUTOS DINÂMICOS)
  // =========================================================================
  async criar(tenantId: string, data: { nome: string; valor: number; estoque?: number; tipo: TipoProduto; caracteristicas?: any }) {
    return await this.prisma.produto.create({
      data: {
        tenantId,
        nome: data.nome,
        valor: Number(data.valor),
        estoque: data.estoque ? Number(data.estoque) : 0,
        tipo: data.tipo,
        caracteristicas: data.caracteristicas || {} // <-- Guarda as propriedades dinâmicas
      }
    });
}

  // =========================================================================
  // REALIZAR VENDA DE PRODUTO/CONSUMÍVEL
  // =========================================================================
  async realizarVenda(tenantId: string, data: {
    produtoId: number;
    funcionarioId: number;
    nomeItem: string;
    tipoOrigem: TipoProduto;
    quantidade: number;
    valorUnitario: number;
    formaPagamento: string;
}) {
    return await this.prisma.$transaction(async (tx) => {

        // 1. Regista a Venda Avulsa no sistema
        const venda = await tx.itemVenda.create({
            data: {
                tenantId,
                funcionarioId: data.funcionarioId,
                nomeItem: data.nomeItem,
                tipoOrigem: data.tipoOrigem,
                quantidade: data.quantidade,
                valorUnitario: data.valorUnitario,
                produtoId: data.produtoId || null, // <-- NOVO: agora fica salvo pra poder estornar depois
            }
        });

        // 2. Abate do Stock
        if (data.produtoId && data.quantidade > 0) {
            await tx.produto.update({
                where: { id: data.produtoId },
                data: { estoque: { decrement: data.quantidade } }
            });
        }

        return venda;
    });
}

  async listarTodos(tenantId: string) {
    return await this.prisma.produto.findMany({
      where: { tenantId },
      include: {
        despesas: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { nome: 'asc' }
    });
  }

  async atualizar(tenantId: string, id: number, data: { nome?: string; valor?: number; estoque?: number; tipo?: TipoProduto; caracteristicas?: any }) {
    const produto = await this.prisma.produto.findFirst({ where: { id, tenantId } });
    if (!produto) throw new NotFoundException('Produto não encontrado.');

    return await this.prisma.produto.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.valor !== undefined && { valor: Number(data.valor) }),
        ...(data.estoque !== undefined && { estoque: Number(data.estoque) }),
        ...(data.tipo && { tipo: data.tipo }),
        ...(data.caracteristicas !== undefined && { caracteristicas: data.caracteristicas })
      }
    });
  }

  async deletar(tenantId: string, id: number) {
    const produto = await this.prisma.produto.findFirst({ where: { id, tenantId } });
    if (!produto) throw new NotFoundException('Produto não encontrado.');
    await this.prisma.produto.delete({ where: { id } });
    return { message: 'Produto excluído do estoque com sucesso.' };
  }
  
}