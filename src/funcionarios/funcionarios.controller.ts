import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    ForbiddenException,
    BadRequestException,
    Param,
    Query,
    Delete
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FuncionariosService } from './funcionarios.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';

// 👉 IMPORTS DA BLINDAGEM SAAS COM OS SEUS CAMINHOS CORRETOS
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';

// 👉 ADICIONAMOS O GUARD DO SAAS AQUI
@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@Controller('funcionarios')
export class FuncionariosController {
    constructor(private readonly funcionariosService: FuncionariosService) { }

    // =========================================================================
    // CRIAR FUNCIONÁRIO (Apenas Admins/Donos devem acessar)
    // (Módulo Base - Sem restrição de Feature)
    // =========================================================================
    @Post()
    @UseInterceptors(FileInterceptor('foto'))
    async criar(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body() dados: any,
        @UploadedFile() foto?: Express.Multer.File,
    ) {
        if (usuarioLogado.role !== 1) {
            throw new ForbiddenException('Apenas administradores podem criar funcionários.');
        }
        return this.funcionariosService.criar(tenantId, dados, foto);
    }

    // =========================================================================
    // LISTAR TODOS DA BARBEARIA
    // (Módulo Base - Sem restrição de Feature)
    // =========================================================================
    @Get()
    async listarTodos(@TenantId() tenantId: string) {
        return this.funcionariosService.listarTodos(tenantId);
    }

    // =========================================================================
    // ABRIR AGENDA DO(S) FUNCIONÁRIO(S)
    // 👉 BLINDADO: Só passa se a barbearia tiver o módulo AGENDAMENTO ativo!
    // =========================================================================
    @Post('abrir-agenda')
    @RequireFeatures(SaasFeature.AGENDAMENTO) // <-- A MÁGICA AQUI!
    async abrirAgendaEmMassa(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body('agendas') agendas: Array<{
            funcionarioId: number;
            horarios: Array<{ data: string | Date; horas: string[] }>;
        }>
    ) {
        if (!agendas || agendas.length === 0) {
            throw new BadRequestException('Envie o array de agendas.');
        }

        // TRAVA DE SEGURANÇA:
        // Se não for Admin/Dono (role 1), ele não pode abrir a agenda de outros.
        if (usuarioLogado.role !== 1) {
            const tentouAbrirDeOutro = agendas.some(agenda => agenda.funcionarioId !== usuarioLogado.id);
            if (tentouAbrirDeOutro) {
                throw new ForbiddenException('Você só tem permissão para abrir a sua própria agenda.');
            }
        }

        return this.funcionariosService.abrirAgendaEmMassa(tenantId, agendas);
    }

    // =========================================================================
    // PAINEL DE MÉTRICAS (O Dashboard do Aplicativo do Profissional)
    // (Módulo Base - Deixamos aberto, pois o painel se adapta ao que ele vende)
    // =========================================================================
    @Get('meu-painel')
    async obterPainel(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any
    ) {
        // Garante que só Funcionários acessem essa rota
        if (usuarioLogado.tipo !== 'FUNCIONARIO') {
            throw new ForbiddenException('Acesso restrito a profissionais.');
        }

        return this.funcionariosService.obterPainel(tenantId, usuarioLogado.id);
    }

    // =========================================================================
    // MEU PERFIL (Dados do próprio funcionário logado)
    // =========================================================================
    @Get('me')
    async buscarMeuPerfil(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any
    ) {
        if (usuarioLogado.tipo !== 'FUNCIONARIO') {
            throw new ForbiddenException('Acesso restrito a profissionais.');
        }
        return this.funcionariosService.buscarMeuPerfil(tenantId, usuarioLogado.id);
    }

    // =========================================================================
    // ALTERAR A PRÓPRIA SENHA
    // =========================================================================
    @Patch('senha')
    async alterarSenha(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body() dto: AlterarSenhaDto
    ) {
        if (usuarioLogado.tipo !== 'FUNCIONARIO') {
            throw new ForbiddenException('Acesso restrito a profissionais.');
        }
        return this.funcionariosService.alterarSenha(tenantId, usuarioLogado.id, dto.senhaAtual, dto.novaSenha);
    }

    // =========================================================================
    // EDITAR DADOS BÁSICOS (nome, bio, foto) — Apenas Admins/Donos
    // =========================================================================
    @Patch(':id')
    @UseInterceptors(FileInterceptor('foto'))
    async atualizar(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Param('id') id: string,
        @Body() dados: { nome?: string; descricao?: string },
        @UploadedFile() foto?: Express.Multer.File,
    ) {
        if (usuarioLogado.role !== 1) {
            throw new ForbiddenException('Apenas administradores podem editar funcionários.');
        }
        return this.funcionariosService.atualizar(tenantId, Number(id), dados, foto);
    }

    // =========================================================================
    // DESLIGAR / REATIVAR FUNCIONÁRIO (Apenas Admins/Donos)
    // =========================================================================
    @Patch(':id/status')
    async atualizarStatus(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Param('id') id: string,
        @Body('ativo') ativo: boolean
    ) {
        if (usuarioLogado.role !== 1) {
            throw new ForbiddenException('Apenas administradores podem desligar ou reativar funcionários.');
        }
        return this.funcionariosService.atualizarStatus(tenantId, Number(id), ativo);
    }

    // =========================================================================
    // EXCLUIR FUNCIONÁRIO DEFINITIVAMENTE (Apenas Admins/Donos)
    // =========================================================================
    @Delete(':id')
    async deletar(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Param('id') id: string
    ) {
        if (usuarioLogado.role !== 1) {
            throw new ForbiddenException('Apenas administradores podem excluir funcionários.');
        }
        return this.funcionariosService.deletar(tenantId, Number(id));
    }

    @Get(':id/horarios')
    async buscarHorarios(
        @TenantId() tenantId: string,
        @Param('id') funcionarioId: string, // Pegando da URL
        @Query('inicio') inicio: string,
        @Query('fim') fim: string
    ) {
        // Chamada para o Service que criaremos/ajustaremos depois
        return this.funcionariosService.listarHorarios(tenantId, Number(funcionarioId), inicio, fim);
    }

    // =========================================================================
    // DELETAR UM HORÁRIO ESPECÍFICO (Que não foi agendado ainda)
    // =========================================================================
    @Delete('horarios/:idHorario')
    async deletarHorario(
        @TenantId() tenantId: string,
        @Param('idHorario') idHorario: string
    ) {
        // Chamada para o Service
        return this.funcionariosService.deletarHorario(tenantId, Number(idHorario));
    }
}