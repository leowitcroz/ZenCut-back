import { Module } from '@nestjs/common';
import { AdmController } from './adm.controller';
import { AdmService } from './adm.service';
import { FaturamentoCronService } from './faturamento-cron.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdmController],
  providers: [AdmService, FaturamentoCronService]
})
export class AdmModule {}