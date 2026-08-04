import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { PrismaModule } from '../prisma/prisma.module'; // Ajuste o caminho de acordo com a sua pasta do Prisma
import { TenantController } from './tentant.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule], // 👈 Dá superpoderes ao módulo para acessar o banco de dados
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService], // Opcional: exporta caso outro módulo precise consultar dados de lojas
})
export class TenantModule {}