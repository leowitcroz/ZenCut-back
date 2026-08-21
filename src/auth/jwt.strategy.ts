import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      // Extrai o token do cabeçalho "Authorization: Bearer <TOKEN>"
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Precisa ser a MESMA chave secreta usada no auth.module.ts
      secretOrKey: process.env.JWT_SECRET || 'chave-fallback-de-dev',
    });
  }

  // Se o token for válido e não estiver expirado, esta função é chamada.
  // O retorno dela é automaticamente injetado no objeto da requisição (req.user)
  async validate(payload: any) {
    // Cliente tem DOIS formatos de token possíveis: 'userType' (emitido só
    // por /portal-cliente/login, hoje sem uso real no front) e 'tipo'
    // (emitido por /auth/login, o login único que Login.vue realmente usa —
    // inclusive pra clientes). Checar só 'userType' fazia todo cliente
    // autenticado pelo fluxo de login de verdade cair no branch de
    // funcionário, que devolve o id em 'id' em vez de 'sub' — e TODO
    // endpoint do portal do cliente (perfil, agendar, cancelar, trocar
    // senha) lê usuarioLogado.sub, então virava sempre undefined (500).
    if (payload.userType === 'CLIENTE' || payload.tipo === 'CLIENTE') {
        const cliente = await this.prisma.cliente.findUnique({
            where: { id: payload.sub }
        });
        if (!cliente) throw new UnauthorizedException('Cliente não encontrado.');

        // Retorna o payload para o @CurrentUser() usar
        return { sub: payload.sub, email: payload.email, role: payload.role, userType: 'CLIENTE', tipo: 'CLIENTE', tenantId: payload.tenantId };
    }

    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tipo: payload.tipo,
      tenantId: payload.tenantId
    };
  }
}