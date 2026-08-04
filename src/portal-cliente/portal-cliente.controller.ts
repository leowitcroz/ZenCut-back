import { Controller, Post, Get, Patch, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { IsPublic } from '../decorator/public.decorator';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';

@Controller('portal-cliente')
export class PortalClienteController {
    constructor(private readonly portalClienteService: PortalClienteService) {}

    @IsPublic() // Permite acessar sem token JWT
    @Post('registro')
    async registrar(
        @TenantId() tenantId: string, // O header x-tenant-id do front
        @Body() body: any
    ) {
        return this.portalClienteService.registrarCliente(tenantId, body);
    }

    @IsPublic()
    @Post('login')
    async login(
        @TenantId() tenantId: string,
        @Body() body: { email: string; senha: string }
    ) {
        return this.portalClienteService.loginCliente(tenantId, body.email, body.senha);
    }

    @UseGuards(JwtAuthGuard, TenantMatchGuard) // Exige que o cliente esteja logado e no tenant certo
    @Get('perfil')
    async obterMeuPerfil(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any
    ) {
        // usuarioLogado.sub é o ID que colocamos no token
        return this.portalClienteService.obterPerfilCompleto(tenantId, usuarioLogado.sub);
    }

    // O próprio cliente marca um horário pra ele mesmo — clienteId sempre vem
    // do token, nunca do body.
    @UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
    @RequireFeatures(SaasFeature.AGENDAMENTO)
    @Post('agendar')
    async agendar(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body() body: { funcionarioId: number; horarioId: number; servicoIds: number[]; cupomAplicado?: boolean }
    ) {
        return this.portalClienteService.criarAgendamento(tenantId, usuarioLogado.sub, body);
    }

    // Cancela um agendamento — só o dono dele consegue (checado dentro do service).
    @UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
    @RequireFeatures(SaasFeature.AGENDAMENTO)
    @Patch('agendamentos/:id/cancelar')
    async cancelarMeuAgendamento(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Param('id', ParseIntPipe) id: number
    ) {
        return this.portalClienteService.cancelarMeuAgendamento(tenantId, usuarioLogado.sub, id);
    }

    // Atualiza telefone/e-mail do próprio cliente.
    @UseGuards(JwtAuthGuard, TenantMatchGuard)
    @Patch('perfil')
    async atualizarPerfil(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body() body: { telefone?: string; email?: string }
    ) {
        return this.portalClienteService.atualizarPerfil(tenantId, usuarioLogado.sub, body);
    }

    // Troca a própria senha (exige a senha atual).
    @UseGuards(JwtAuthGuard, TenantMatchGuard)
    @Patch('senha')
    async alterarSenha(
        @TenantId() tenantId: string,
        @CurrentUser() usuarioLogado: any,
        @Body() body: { senhaAtual: string; novaSenha: string }
    ) {
        return this.portalClienteService.alterarSenha(tenantId, usuarioLogado.sub, body.senhaAtual, body.novaSenha);
    }
}