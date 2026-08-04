import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Garante que quem está chamando é o DONO DA PLATAFORMA ZenCut (Funcionario.isPlatformOwner),
// não apenas o dono/admin (role=1) de uma loja qualquer. Sempre confere fresco no banco
// (em vez de confiar no JWT, que pode durar até 7 dias) pra uma revogação valer na hora.
@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const usuarioLogado = request.user;

    if (!usuarioLogado || usuarioLogado.tipo !== 'FUNCIONARIO') {
      throw new ForbiddenException('Acesso restrito ao dono da plataforma ZenCut.');
    }

    const funcionario = await this.prisma.funcionario.findUnique({
      where: { id: usuarioLogado.id },
      select: { isPlatformOwner: true },
    });

    if (!funcionario || !funcionario.isPlatformOwner) {
      throw new ForbiddenException('Acesso restrito ao dono da plataforma ZenCut.');
    }

    return true;
  }
}
