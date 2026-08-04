import { Controller, Get, Put, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ComissoesService } from './comissoes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';

@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@RequireFeatures(SaasFeature.FINANCEIRO)
@Controller('comissoes')
export class ComissoesController {
  constructor(private readonly comissoesService: ComissoesService) {}

  @Get()
  async obterRegra(@TenantId() tenantId: string) {
    return this.comissoesService.obterRegra(tenantId);
  }

  @Put()
  async salvarRegra(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body() dados: {
      percentualProduto?: number;
      percentualConsumivel?: number;
      percentualAvulso?: number;
      valorFixoPlano?: number;
    }
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode configurar as comissões.');
    }
    return this.comissoesService.salvarRegra(tenantId, dados);
  }
}
