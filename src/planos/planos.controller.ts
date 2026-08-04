import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PlanosService } from './planos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.ASSINATURAS)
@Controller('planos')
export class PlanosController {
  constructor(private readonly planosService: PlanosService) {}

  // =========================================================================
  // CRUD DOS PLANOS
  // =========================================================================
  @Post()
  async criar(
    @TenantId() tenantId: string,
    @Body() dados: {
      nome: string;
      valorMensal: number;
      ilimitado?: boolean;
      qtdCreditos?: number;
      servicoIds?: number[];
      diasPermitidos?: number[];
    }
  ) {
    return this.planosService.criar(tenantId, dados);
  }

  @Get()
  async listarTodos(@TenantId() tenantId: string) {
    return this.planosService.listarTodos(tenantId);
  }

  @Put(':id')
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: {
      nome?: string;
      valorMensal?: number;
      ilimitado?: boolean;
      qtdCreditos?: number;
      servicoIds?: number[];
      diasPermitidos?: number[];
      ativo?: boolean;
    }
  ) {
    return this.planosService.atualizar(tenantId, id, dados);
  }

  @Delete(':id')
  async deletar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.planosService.deletar(tenantId, id);
  }

  // =========================================================================
  // ASSINATURAS (Vincular Cliente a um Plano)
  // =========================================================================
  @Post('assinaturas')
  async assinarCliente(
    @TenantId() tenantId: string,
    @Body() dados: {
      clienteId: number;
      planoId: number;
      dataInicio: string;
      mesesDePlano?: number;
      formaPagamento?: string;
    }
  ) {
    return this.planosService.assinarCliente(tenantId, {
      ...dados,
      clienteId: Number(dados.clienteId),
      planoId: Number(dados.planoId),
    });
  }

  @Patch('assinaturas/:clienteId/cancelar')
  async cancelarAssinatura(
    @TenantId() tenantId: string,
    @Param('clienteId', ParseIntPipe) clienteId: number
  ) {
    return this.planosService.cancelarAssinatura(tenantId, clienteId);
  }

  // =========================================================================
  // HISTÓRICO DE RENOVAÇÕES
  // =========================================================================
  @Get('historico-renovacoes')
  async listarHistoricoRenovacoes(@TenantId() tenantId: string) {
    return this.planosService.listarHistoricoRenovacoes(tenantId);
  }
}
