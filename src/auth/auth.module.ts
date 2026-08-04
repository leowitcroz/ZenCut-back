import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientesModule } from '../clientes/cliente.module'; // <-- Adicione esta importação
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PrismaModule,
    ClientesModule, // <-- Adicione o módulo aqui para o Nest resolver o ClientesService
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'chave-fallback-de-dev',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}