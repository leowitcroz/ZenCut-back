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

    // 2. Lista de rotas que NÃO precisam de Tenant ID de jeito nenhum (o token,
    // quando existe, já carrega o próprio tenantId — não dependem do header).
    const rotasPublicas = [
      '/tenant/info',
      '/tenants/info',
      '/tenants/registrar-loja',
      '/auth/check-token',
      '/auth/is-valid',
    ];
    const isPublicRoute = rotasPublicas.some(rota => req.originalUrl.includes(rota));
    if (isPublicRoute) {
      return next();
    }

    // 2.1 Login/registro: o tenant é OPCIONAL no header (permite o dono logar
    // pelo domínio principal sem saber o subdomínio da própria loja — o
    // AuthService acha a conta pelo e-mail nesse caso). MAS, se o front mandar
    // o header (login feito de dentro do subdomínio de uma loja específica),
    // ele PRECISA ser resolvido e usado pra restringir a busca àquele tenant —
    // sem isso, duas lojas com a mesma combinação de e-mail (uma como cliente,
    // outra como funcionário) faziam o login de uma vazar pra conta da outra.
    const tenantOpcional = ['/auth/login', '/auth/register'].some(rota => req.originalUrl.includes(rota));

    // 3. Pega o ID que o frontend (Vue) envia no header para as rotas protegidas
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      if (tenantOpcional) return next();
      throw new UnauthorizedException('Identificação do negócio (Tenant) não fornecida no cabeçalho.');
    }

    // 4. Busca o negócio no banco de dados
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // 5. O tenant não existe de verdade (ID inválido/inexistente) — aí sim não
    // há nada pra restringir, trata como se o header não tivesse vindo.
    if (!tenant) {
      if (tenantOpcional) return next();
      throw new NotFoundException('Negócio não encontrado.');
    }

    // 5.1 O tenant existe mas está inativo (loja bloqueada por pagamento
    // pendente, por exemplo). Isso NÃO pode cair no mesmo tratamento de "sem
    // tenant": um e-mail pode existir em várias lojas ao mesmo tempo (é o
    // comportamento esperado — cada loja é independente), então tratar o
    // header como ausente jogava o login de uma loja inativa pro fallback de
    // busca por e-mail SEM restrição de loja nenhuma — o login podia acabar
    // caindo na conta de OUTRO tenant que por acaso tem o mesmo e-mail. Segue
    // restringindo a busca a este tenant específico; quem decide se dá pra
    // logar numa loja inativa é a regra de negócio do login, não o middleware.
    if (!tenant.ativo && !tenantOpcional) {
      throw new NotFoundException('Negócio não encontrado ou inativo.');
    }

    // 6. Injeta o ID real (UUID) do Tenant na requisição para os Controllers usarem
    req['tenantId'] = tenant.id;

    // 7. Manda a requisição seguir o fluxo normal
    next();
  }
}