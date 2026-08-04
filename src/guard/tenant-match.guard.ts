import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// Garante que o tenant informado no header x-tenant-id é EXATAMENTE o mesmo
// tenant gravado dentro do JWT de quem está logado. Sem isso, qualquer usuário
// autenticado (funcionário ou cliente) poderia trocar o header manualmente e
// ler/escrever dados de outra loja, já que o TenantMiddleware sozinho confia
// cegamente no header (ele roda antes do JWT ser validado, então não tem como
// cruzar essa informação ali).
//
// Precisa vir DEPOIS do JwtAuthGuard na lista de @UseGuards, pra request.user
// já estar preenchido.
@Injectable()
export class TenantMatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const usuarioLogado = request.user;
    const tenantIdDoHeader = request.tenantId;

    if (!tenantIdDoHeader || !usuarioLogado) return true;

    if (usuarioLogado.tenantId !== tenantIdDoHeader) {
      throw new ForbiddenException('Você não tem permissão para acessar dados de outro estabelecimento.');
    }

    return true;
  }
}
