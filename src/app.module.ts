import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantMiddleware } from './tenant/tenant.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AgendamentosModule } from './agendamentos/agendamentos.module';
import { ClientesModule } from './clientes/cliente.module';
import { AuthModule } from './auth/auth.module';
import { FuncionariosModule } from './funcionarios/funcionarios.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { TenantModule } from './tenant/tentatn.module';
import { AdmModule } from './adm/adm.module';
import { PortalClienteModule } from './portal-cliente/portal-cliente.module';
import { ServicosModule } from './servicos/servicos.module';
import { ProdutosModule } from './produtos/produtos.module';
import { PlanosModule } from './planos/planos.module';
import { ComissoesModule } from './comissoes/comissoes.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    TenantModule,
    AgendamentosModule,
    ClientesModule,
    AuthModule,
    FuncionariosModule,
    FinanceiroModule,
    AdmModule,
    PortalClienteModule,
    ServicosModule,
    ProdutosModule,
    PlanosModule,
    ComissoesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      // 👇 registrar-loja é sempre público (não existe tenant ainda). auth/login
      // NÃO é mais excluído aqui: precisa passar pelo TenantMiddleware pra ele
      // resolver e VALIDAR o x-tenant-id quando o front manda (login feito de
      // dentro do subdomínio de uma loja) — a própria TenantMiddleware já trata
      // esse header como opcional pra login/registro (ver tenant.middleware.ts).
      // Excluir a rota aqui achatava essa proteção: o header nunca chegava a
      // ser lido, e o login virava sempre uma busca por e-mail sem restrição
      // de loja nenhuma — bug de vazamento de conta entre lojas com o mesmo
      // e-mail (uma como cliente, outra como funcionário).
      .exclude(
        { path: 'tenants/registrar-loja', method: RequestMethod.POST },
      )
      .forRoutes('*'); // Aplica a interceptação para todo o resto (rotas logadas)
  }
}