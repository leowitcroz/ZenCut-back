import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // O @Global() faz com que você não precise importar o PrismaModule em todo lugar
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
