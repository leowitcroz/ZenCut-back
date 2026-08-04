import { Module } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroController } from './financeiro.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ComissoesModule } from '../comissoes/comissoes.module';

@Module({
  imports: [PrismaModule, ComissoesModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
})
export class FinanceiroModule {}