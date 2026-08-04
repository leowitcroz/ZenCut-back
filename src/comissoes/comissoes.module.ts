import { Module } from '@nestjs/common';
import { ComissoesService } from './comissoes.service';
import { ComissoesController } from './comissoes.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ComissoesController],
  providers: [ComissoesService],
  exports: [ComissoesService],
})
export class ComissoesModule {}
