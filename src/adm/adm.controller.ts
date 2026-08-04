import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdmService } from './adm.service';
import { FaturamentoCronService } from './faturamento-cron.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformOwnerGuard } from '../guard/platform-owner.guard';
import { PlanoSaaS } from '@prisma/client';

// Esta rota expõe dados de TODOS os tenants da plataforma (lojas, funcionários, clientes).
// Só quem tem Funcionario.isPlatformOwner = true (dono da própria ZenCut) passa aqui —
// dono/admin (role=1) de uma loja comum não tem acesso, mesmo logado.
@UseGuards(JwtAuthGuard, PlatformOwnerGuard)
@Controller('adm')
export class AdmController {
  constructor(
    private readonly admService: AdmService,
    private readonly faturamentoCronService: FaturamentoCronService,
  ) {}

  @Get('tenants')
  async getTenants() {
    return this.admService.getAllTenants();
  }

  @Get('funcionarios')
  async getFuncionarios() {
    return this.admService.getAllFuncionarios();
  }

  @Get('clientes')
  async getClientes() {
    return this.admService.getAllClientes();
  }

  @Patch('tenants/:id/plano')
  async atualizarPlano(
    @Param('id') id: string,
    @Body() body: { planoSaaS: PlanoSaaS; moduloAgendamento: boolean; moduloFinanceiro: boolean; moduloProdutos: boolean; moduloVendas: boolean; moduloAssinaturas: boolean }
  ) {
    return this.admService.atualizarPlanoLoja(id, body);
  }

  // Histórico de faturas/pagamentos de uma loja específica
  @Get('tenants/:id/historico-pagamentos')
  async historicoPagamentos(@Param('id') id: string) {
    return this.admService.historicoPagamentos(id);
  }

  // Preço e nome de cada plano — o ADM edita livremente, sem precisar mexer em código
  @Get('planos')
  async listarPlanos() {
    return this.admService.listarPlanosPreco();
  }

  @Patch('planos/:plano')
  async atualizarPlanoPreco(
    @Param('plano') plano: PlanoSaaS,
    @Body() body: { nome?: string; valorMensal?: number }
  ) {
    return this.admService.atualizarPlanoPreco(plano, body);
  }

  @Patch('tenants/:id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('ativo') ativo: boolean
  ) {
    return this.admService.alterarStatusLoja(id, ativo);
  }

  // Confirma que o pagamento (fatura mais recente) caiu: libera a loja e projeta o próximo vencimento
  @Patch('tenants/:id/confirmar-pagamento')
  async confirmarPagamento(@Param('id') id: string) {
    return this.admService.confirmarPagamento(id);
  }

  // Dispara manualmente a rotina diária de cobrança (renovação + bloqueio de inadimplentes),
  // útil pra testar sem esperar o horário do cron (3h da manhã).
  @Post('faturamento/executar-agora')
  async executarFaturamentoAgora() {
    await this.faturamentoCronService.executarRotinaDiaria();
    return { message: 'Rotina de faturamento executada com sucesso.' };
  }

}
