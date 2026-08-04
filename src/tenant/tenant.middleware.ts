import { Injectable, NestMiddleware, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) { }

  async use(req: Request, res: Response, next: NextFunction) {

    // 1. Libera o "Fantasma" do navegador (CORS Preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }

    // 2. Lista inteligente de rotas que NÃO precisam de Tenant ID
    const rotasPublicas = [
      '/tenant/info',
      '/tenants/info',
      '/tenants/registrar-loja',
      '/auth/'
    ];

    // Verifica se a rota atual está na nossa lista de liberação
    const isPublicRoute = rotasPublicas.some(rota => req.originalUrl.includes(rota));
    if (isPublicRoute) {
      return next();
    }

    // 3. Pega o ID que o frontend (Vue) envia no header para as rotas protegidas
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      throw new UnauthorizedException('Identificação do negócio (Tenant) não fornecida no cabeçalho.');
    }

    // 4. Busca o negócio no banco de dados
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // 5. Valida se o cliente existe e se não está com a conta bloqueada/inativa
    if (!tenant || !tenant.ativo) {
      throw new NotFoundException('Negócio não encontrado ou inativo.');
    }

    // 6. Injeta o ID real (UUID) do Tenant na requisição para os Controllers usarem
    req['tenantId'] = tenant.id;

    // 7. Manda a requisição seguir o fluxo normal
    next();
  }
}