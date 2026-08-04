import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComissoesService {
  constructor(private readonly prisma: PrismaService) {}

  async obterRegra(tenantId: string) {
    const regra = await this.prisma.regraComissao.findUnique({ where: { tenantId } });

    return regra || {
      percentualProduto: 0,
      percentualConsumivel: 0,
      percentualAvulso: 0,
      valorFixoPlano: 0,
    };
  }

  async salvarRegra(tenantId: string, dados: {
    percentualProduto?: number;
    percentualConsumivel?: number;
    percentualAvulso?: number;
    valorFixoPlano?: number;
  }) {
    const payload = {
      percentualProduto: Number(dados.percentualProduto || 0),
      percentualConsumivel: Number(dados.percentualConsumivel || 0),
      percentualAvulso: Number(dados.percentualAvulso || 0),
      valorFixoPlano: Number(dados.valorFixoPlano || 0),
    };

    return await this.prisma.regraComissao.upsert({
      where: { tenantId },
      create: { tenantId, ...payload },
      update: payload,
    });
  }
}
