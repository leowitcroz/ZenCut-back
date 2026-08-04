import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { SaasFeature } from '../auth/saas-features.enum';
import { REQUIRE_FEATURES_KEY } from '../decorator/require-features.decorator';

@Injectable()
export class SaasFeatureGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Busca quais módulos a rota exige (Ex: ['AGENDAMENTO']), olhando tanto o método quanto a classe
    const requiredFeatures = this.reflector.getAllAndOverride<SaasFeature[]>(REQUIRE_FEATURES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true; // Se a rota não exige nada, libera.
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.headers['x-tenant-id'];

    if (!tenantId) {
      throw new ForbiddenException('Tenant ID não fornecido no cabeçalho.');
    }

    // Busca o negócio no banco de dados na hora, para ter a informação mais fresca possível
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new ForbiddenException('Estabelecimento não encontrado.');
    }

    // Valida cada módulo exigido fazendo o Mapeamento Exato
    for (const feature of requiredFeatures) {
      let isAtivo = false;

      // Traduz o Enum para a coluna exata do Banco de Dados (Evita erros de Maiúscula/Minúscula)
      switch (feature) {
        case SaasFeature.AGENDAMENTO:
          isAtivo = Boolean(tenant.moduloAgendamento);
          break;
        case SaasFeature.FINANCEIRO:
          isAtivo = Boolean(tenant.moduloFinanceiro);
          break;
        case SaasFeature.VENDAS:
          isAtivo = Boolean(tenant.moduloVendas);
          break;
        case SaasFeature.PRODUTOS:
          isAtivo = Boolean(tenant.moduloProdutos);
          break;
        case SaasFeature.ASSINATURAS:
          isAtivo = Boolean(tenant.moduloAssinaturas);
          break;
        case SaasFeature.PAGAMENTO_WEB:
          isAtivo = Boolean(tenant.moduloPagamentoWeb);
          break;
        default:
          isAtivo = false;
      }

      // Se o módulo for 0, false, null ou undefined, ele barra!
      if (!isAtivo) {
        throw new ForbiddenException(`O módulo '${feature}' não está ativo no seu plano. Entre em contato com o suporte para fazer o upgrade.`);
      }
    }

    return true;
  }
}