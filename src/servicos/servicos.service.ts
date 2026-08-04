import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class ServicosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // =========================================================================
  // CRIAR NOVO SERVIÇO
  // =========================================================================
  async criar(tenantId: string, data: { nome: string; valor: number; descricao?: string }, foto?: Express.Multer.File) {
    const fotoUrl = foto ? await this.cloudinaryService.uploadImagem(foto.buffer, `zencut/${tenantId}/servicos`) : null;

    return await this.prisma.servico.create({
      data: {
        tenantId,
        nome: data.nome,
        valor: Number(data.valor), // Força ser número caso venha string do front
        descricao: data.descricao || null,
        fotoUrl,
      }
    });
  }

  // =========================================================================
  // LISTAR TODOS OS SERVIÇOS DA BARBEARIA
  // =========================================================================
  async listarTodos(tenantId: string) {
    return await this.prisma.servico.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' } // Traz em ordem alfabética para ficar bonito no front
    });
  }

  // =========================================================================
  // ATUALIZAR SERVIÇO (Edita nome, preço, descrição e/ou foto)
  // =========================================================================
  async atualizar(tenantId: string, id: number, data: { nome?: string; valor?: number; descricao?: string }, foto?: Express.Multer.File) {
    // 1. Verifica se o serviço existe e PERTENCE a esta barbearia
    const servico = await this.prisma.servico.findFirst({
      where: { id, tenantId }
    });

    if (!servico) {
      throw new NotFoundException('Serviço não encontrado ou não pertence a este estabelecimento.');
    }

    const fotoUrl = foto ? await this.cloudinaryService.uploadImagem(foto.buffer, `zencut/${tenantId}/servicos`) : undefined;

    // 2. Atualiza de fato
    return await this.prisma.servico.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.valor !== undefined && { valor: Number(data.valor) }),
        ...(data.descricao !== undefined && { descricao: data.descricao || null }),
        ...(fotoUrl !== undefined && { fotoUrl }),
      }
    });
  }

  // =========================================================================
  // EXCLUIR SERVIÇO
  // =========================================================================
  async deletar(tenantId: string, id: number) {
    // Garante que a barbearia A não exclua um serviço da barbearia B
    const servico = await this.prisma.servico.findFirst({
      where: { id, tenantId }
    });

    if (!servico) {
      throw new NotFoundException('Serviço não encontrado.');
    }

    await this.prisma.servico.delete({
      where: { id }
    });

    return { message: 'Serviço excluído com sucesso.' };
  }
}
