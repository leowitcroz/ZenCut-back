import { 
    Controller, 
    Get, 
    Post, 
    Patch, 
    Delete, 
    Body, 
    Param, 
    Query, 
    UseGuards,
    ForbiddenException,
    BadRequestException
} from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.FINANCEIRO) // <-- BLINDAGEM TOTAL DO ARQUIVO!
@Controller('financeiro')
export class FinanceiroController {
    constructor(private readonly financeiroService: FinanceiroService) {}

    // Trava global para administradores:
    private validarAdmin(usuarioLogado: any) {
        // Verifica se é Dono/Admin (1) ou Espectador/Sócio (6)
        if (usuarioLogado.role !== 1 && usuarioLogado.role !== 6) {
            throw new ForbiddenException('Apenas donos/administradores podem acessar o módulo financeiro.');
        }
    }

    // =========================================================================
    // RESUMO GLOBAL (DASHBOARD) E EQUIPE
    // =========================================================================
    @Get('resumo')
    async obterResumo(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio?: string, 
        @Query('fim') fim?: string,       
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.obterResumoFinanceiro(tenantId, inicio, fim);
    }

    // Série histórica mês a mês pros gráficos do dashboard (faturamento,
    // serviços mais usados, crescimento de assinaturas e de clientes).
    @Get('graficos')
    async obterGraficos(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('meses') meses?: string,
    ) {
        this.validarAdmin(usuario);
        const qtdMeses = meses ? Math.min(Math.max(parseInt(meses), 1), 24) : 6;
        return this.financeiroService.obterGraficos(tenantId, qtdMeses);
    }

    @Get('equipe')
    async obterRelatorioEquipe(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        const dataInicio = new Date(inicio);
        const dataFim = new Date(fim);
        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
            throw new BadRequestException('Datas de início e fim inválidas');
        }

        return this.financeiroService.obterRelatorioEquipe(tenantId, dataInicio, dataFim);
    }

    // =========================================================================
    // 👉 AUTOATENDIMENTO DO FUNCIONÁRIO ("Meu Financeiro")
    // Roda a MESMA função do relatório do dono (obterRelatorioEquipe), só que
    // filtrada pelo id que vem do TOKEN — nunca de um parâmetro que o front possa
    // manipular. Garante que os números batem com o que o dono vê pra esse
    // funcionário, e que ninguém vê o financeiro de outro colega.
    // =========================================================================
    @Get('meu-relatorio')
    async obterMeuRelatorio(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
    ) {
        if (usuario.tipo !== 'FUNCIONARIO') {
            throw new ForbiddenException('Apenas funcionários têm relatório individual.');
        }
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        const dataInicio = new Date(inicio);
        const dataFim = new Date(fim);
        if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
            throw new BadRequestException('Datas de início e fim inválidas');
        }

        const relatorio = await this.financeiroService.obterRelatorioEquipe(
            tenantId, dataInicio, dataFim, usuario.id
        );

        return relatorio[0] || {
            barbeiroId: usuario.id,
            nomeBarbeiro: '',
            totalServicosRealizados: 0,
            totalFaturamento: 0,
            comissaoTotal: 0
        };
    }

    // =========================================================================
    // ROTAS SAAS (SUPER ADMIN)
    // =========================================================================
    @Get('saas/resumo')
    async obterResumoSaaS(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        
        return this.financeiroService.obterResumoFinanceiroSaaS(tenantId, new Date(inicio), new Date(fim));
    }

    @Get('saas/lojas')
    async obterLojasSaaS(@CurrentUser() usuario: any) {
        this.validarAdmin(usuario);
        return this.financeiroService.obterLojasRelatorioFinanceiro();
    }

    // =========================================================================
    // 💸 ENTRADAS (RECEITAS MANUAIS)
    // =========================================================================
    @Post('entradas')
    async criarEntrada(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Body() body: { description: string; amount: number; date: string; isPaid?: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.criarEntrada(tenantId, body);
    }

    @Patch('entradas/:id')
    async atualizarEntrada(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body() body: { description: string; amount: number; date: string; isPaid: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.atualizarEntrada(tenantId, id, body);
    }

    @Patch('entradas/:id/status')
    async atualizarStatusEntrada(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body('isPaid') isPaid: boolean
    ) {
        this.validarAdmin(usuario);
        // Reutilizando o serviço de atualização para focar apenas no status
        return this.financeiroService.atualizarEntrada(tenantId, id, { isPaid } as any);
    }

    @Delete('entradas/:id')
    async deletarEntrada(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.deletarEntrada(tenantId, id);
    }

    // =========================================================================
    // 🛒 DESPESAS (CUSTOS)
    // =========================================================================
    @Get('despesas')
    async listarDespesas(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Query('inicio') inicio: string,
        @Query('fim') fim: string,
        @Query('tipo') tipo?: 'FIXED' | 'VARIABLE'
    ) {
        this.validarAdmin(usuario);
        if (!inicio || !fim) throw new BadRequestException('Datas de início e fim são obrigatórias');
        
        return this.financeiroService.listarDespesas(tenantId, {
            startDate: new Date(inicio),
            endDate: new Date(fim),
            type: tipo
        });
    }

    @Post('despesas/variavel')
    async criarVariavel(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Body() body: { description: string; amount: number; date: string; isPaid?: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.criarDespesaVariavel(tenantId, body);
    }

    @Post('despesas/recorrente')
    async criarRecorrente(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Body() body: { description: string; amount: number; dayOfMonth: number; date: string } 
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.criarDespesaRecorrente(tenantId, body);
    }

    @Patch('despesas/:id')
    async atualizarDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body() body: { description: string; amount: number; date: string; isPaid: boolean }
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.atualizarDespesa(tenantId, id, body);
    }

    @Patch('despesas/:id/status')
    async atualizarStatusDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string,
        @Body('isPaid') isPaid: boolean
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.atualizarStatusPagamento(tenantId, id, isPaid);
    }

    @Patch('despesas/:id/tipo')
    async alterarTipoDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.alterarTipoDespesa(tenantId, id);
    }

    @Delete('despesas/:id')
    async deletarDespesa(
        @TenantId() tenantId: string,
        @CurrentUser() usuario: any,
        @Param('id') id: string
    ) {
        this.validarAdmin(usuario);
        return this.financeiroService.deletarDespesa(tenantId, id);
    }
}