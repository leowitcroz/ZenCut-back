import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards, 
  ParseIntPipe 
} from '@nestjs/common';
import { ProdutosService } from './produtos.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';
import { TipoProduto } from '@prisma/client';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.PRODUTOS) // Garante que a loja tem o plano com Produtos ativado
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly produtosService: ProdutosService) {}

  // =========================================================================
  // CRIAR PRODUTO / ESTOQUE COMPLEXO
  // =========================================================================
  @Post()
  async criarProduto(
    @TenantId() tenantId: string,
    @Body() body: { 
      nome: string; 
      valor: number; 
      estoque?: number; 
      tipo: TipoProduto; 
      caracteristicas?: any 
    }
  ) {
    return this.produtosService.criar(tenantId, body);
  }

  // =========================================================================
  // LISTAR TODOS OS PRODUTOS
  // =========================================================================
  @Get()
  async listarProdutos(@TenantId() tenantId: string) {
    return this.produtosService.listarTodos(tenantId);
  }

  // =========================================================================
  // ATUALIZAR PRODUTO / ATRIBUTOS / ESTOQUE
  // =========================================================================
  @Put(':id')
  async atualizarProduto(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { 
      nome?: string; 
      valor?: number; 
      estoque?: number; 
      tipo?: TipoProduto; 
      caracteristicas?: any 
    }
  ) {
    return this.produtosService.atualizar(tenantId, id, body);
  }

  // =========================================================================
  // EXCLUIR PRODUTO
  // =========================================================================
  @Delete(':id')
  async deletarProduto(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.produtosService.deletar(tenantId, id);
  }

  // =========================================================================
  // REALIZAR VENDA
  // =========================================================================
  @Post('venda')
  async realizarVenda(
    @TenantId() tenantId: string,
    @Body() body: {
      produtoId: number;
      funcionarioId: string | number;
      nomeItem: string;
      tipoOrigem: TipoProduto;
      quantidade: number;
      valorUnitario: number;
      formaPagamento: string;
    }
  ) {
    return this.produtosService.realizarVenda(tenantId, {
      produtoId: Number(body.produtoId),
      funcionarioId: Number(body.funcionarioId),
      nomeItem: body.nomeItem,
      tipoOrigem: body.tipoOrigem,
      quantidade: Number(body.quantidade),
      valorUnitario: Number(body.valorUnitario),
      formaPagamento: body.formaPagamento,
    });
  }

  // =========================================================================
  // HISTÓRICO DE VENDAS
  // =========================================================================
  @Get('item-venda')
  async listarHistoricoVendas(
    @TenantId() tenantId: string,
    @Query('inicio') inicio?: string,
    @Query('fim') fim?: string
  ) {
    // Utilizando o Prisma diretamente aqui para facilitar, ou você pode mover para o Service
    const dataInicio = inicio ? new Date(inicio + 'T00:00:00-03:00') : new Date();
    const dataFim = fim ? new Date(fim + 'T23:59:59-03:00') : new Date();

    if (!inicio) dataInicio.setHours(0, 0, 0, 0);
    if (!fim) dataFim.setHours(23, 59, 59, 999);

    return this.produtosService['prisma'].itemVenda.findMany({
      where: {
        tenantId,
        dataVenda: {
          gte: dataInicio,
          lte: dataFim,
        },
      },
      include: {
        funcionario: {
          select: { nome: true }
        }
      },
      orderBy: { dataVenda: 'desc' }
    });
  }
}