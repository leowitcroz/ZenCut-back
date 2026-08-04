import { Module } from '@nestjs/common';
import { PortalClienteService } from './portal-cliente.service';
import { PortalClienteController } from './portal-cliente.controller';
import { JwtModule } from '@nestjs/jwt';
import { AgendamentosModule } from '../agendamentos/agendamentos.module';

@Module({
  imports: [
    // 👇 Agora o módulo sabe a senha secreta e a validade do token!
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'chave_secreta_padrao_aqui', // Puxa do seu .env
      signOptions: { expiresIn: '7d' }, // Token válido por 7 dias
    }),
    AgendamentosModule,
  ],
  controllers: [PortalClienteController],
  providers: [PortalClienteService]
})
export class PortalClienteModule {}