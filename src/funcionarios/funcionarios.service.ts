import { 
  Injectable, 
  ConflictException,
  BadRequestException,
  NotFoundException, 
  
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class FuncionariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // =========================================================================
  // 1. CRUD BÁSICO (Gerenciamento pela Recepção/Dono)
  // =========================================================================
  async criar(tenantId: string, data: any, foto?: Express.Multer.File) {
    // Valida se o email já existe neste tenant
    const existe = await this.prisma.funcionario.findFirst({
      where: { email: data.email, tenantId }
    });

    if (existe) throw new ConflictException('E-mail já cadastrado para outro funcionário.');

    const senhaHasheada = await bcrypt.hash(data.password, 10);

    // Sobe a foto pro Cloudinary antes de criar (se o admin escolheu uma)
    const fotoUrl = foto ? await this.cloudinaryService.uploadImagem(foto.buffer, `zencut/${tenantId}/funcionarios`) : null;

    return await this.prisma.funcionario.create({
      data: {
        tenantId,
        nome: data.nome,
        email: data.email,
        password: senhaHasheada,
        role: data.role || 2, // 1 = Admin, 2 = Padrão
        ativo: true,
        fotoUrl,
        descricao: data.descricao || null,
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, fotoUrl: true, descricao: true }
    });
  }

  async listarTodos(tenantId: string) {
    return await this.prisma.funcionario.findMany({
      where: { tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, fotoUrl: true, descricao: true },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }]
    });
  }

  // =========================================================================
  // EDITAR DADOS BÁSICOS (nome, bio, foto — não mexe em email/senha/role aqui)
  // =========================================================================
  async atualizar(tenantId: string, id: number, data: { nome?: string; descricao?: string }, foto?: Express.Multer.File) {
    const funcionario = await this.prisma.funcionario.findFirst({ where: { id, tenantId } });
    if (!funcionario) throw new NotFoundException('Funcionário não encontrado.');

    const fotoUrl = foto ? await this.cloudinaryService.uploadImagem(foto.buffer, `zencut/${tenantId}/funcionarios`) : undefined;

    return await this.prisma.funcionario.update({
      where: { id },
      data: {
        ...(data.nome && { nome: data.nome }),
        ...(data.descricao !== undefined && { descricao: data.descricao || null }),
        ...(fotoUrl !== undefined && { fotoUrl }),
      },
      select: { id: true, nome: true, email: true, role: true, ativo: true, fotoUrl: true, descricao: true }
    });
  }

  // =========================================================================
  // DESLIGAR / REATIVAR FUNCIONÁRIO
  // =========================================================================
  async atualizarStatus(tenantId: string, id: number, ativo: boolean) {
    const funcionario = await this.prisma.funcionario.findFirst({ where: { id, tenantId } });
    if (!funcionario) throw new NotFoundException('Funcionário não encontrado.');

    return await this.prisma.funcionario.update({
      where: { id },
      data: { ativo },
      select: { id: true, nome: true, email: true, role: true, ativo: true, fotoUrl: true }
    });
  }

  // =========================================================================
  // EXCLUIR FUNCIONÁRIO DEFINITIVAMENTE
  // Só permite se ele não tiver nenhum histórico (agendamento, venda, avaliação
  // ou assinatura vinculada) — senão quebraria os relatórios financeiros que já
  // batem certinho hoje. Nesse caso, a saída correta é "Desligar" (soft delete).
  // =========================================================================
  async deletar(tenantId: string, id: number) {
    const funcionario = await this.prisma.funcionario.findFirst({ where: { id, tenantId } });
    if (!funcionario) throw new NotFoundException('Funcionário não encontrado.');

    const [qtdAgendamentos, qtdVendas, qtdAvaliacoes, qtdAssinaturas] = await Promise.all([
      this.prisma.agendamento.count({ where: { funcionarioId: id } }),
      this.prisma.itemVenda.count({ where: { funcionarioId: id } }),
      this.prisma.avaliacao.count({ where: { funcionarioId: id } }),
      this.prisma.assinaturaCliente.count({ where: { funcionarioId: id } }),
    ]);

    if (qtdAgendamentos > 0 || qtdVendas > 0 || qtdAvaliacoes > 0 || qtdAssinaturas > 0) {
      throw new ConflictException(
        'Este funcionário já tem histórico de atendimentos, vendas ou avaliações — excluir quebraria os relatórios financeiros. Use "Desligar" pra tirá-lo da agenda sem perder o histórico.'
      );
    }

    // Sem histórico: seguro apagar as grades de horário (vazias) e o cadastro.
    await this.prisma.disponibilidade.deleteMany({ where: { funcionarioId: id } });
    await this.prisma.funcionario.delete({ where: { id } });

    return { message: 'Funcionário excluído com sucesso.' };
  }

  // =========================================================================
  // 1.1 MEU PERFIL (Dados do próprio funcionário logado)
  // =========================================================================
  async buscarMeuPerfil(tenantId: string, funcionarioId: number) {
    const funcionario = await this.prisma.funcionario.findFirst({
      where: { id: funcionarioId, tenantId },
      select: { id: true, nome: true, email: true, role: true, ativo: true, fotoUrl: true, isPlatformOwner: true }
    });

    if (!funcionario) throw new NotFoundException('Funcionário não encontrado.');
    return funcionario;
  }

  // =========================================================================
  // 1.2 ALTERAR A PRÓPRIA SENHA
  // =========================================================================
  async alterarSenha(tenantId: string, funcionarioId: number, senhaAtual: string, novaSenha: string) {
    const funcionario = await this.prisma.funcionario.findFirst({
      where: { id: funcionarioId, tenantId }
    });

    if (!funcionario) throw new NotFoundException('Funcionário não encontrado.');

    const senhaCorreta = await bcrypt.compare(senhaAtual, funcionario.password);
    if (!senhaCorreta) throw new BadRequestException('Senha atual incorreta.');

    const novaSenhaHasheada = await bcrypt.hash(novaSenha, 10);

    await this.prisma.funcionario.update({
      where: { id: funcionarioId },
      data: { password: novaSenhaHasheada }
    });

    return { message: 'Senha alterada com sucesso.' };
  }

 // =========================================================================
  // 2. ABRIR AGENDA EM MASSA (Inteligente e Multi-Tenant)
  // =========================================================================
  async abrirAgendaEmMassa(
    tenantId: string,
    agendas: Array<{
      funcionarioId: number;
      horarios: Array<{ data: string | Date; horas: string[] }>;
    }>
  ) {
    const horariosParaCriar = [];
    const horariosIgnorados = [];
    const horariosInvalidos = [];
    const funcionariosNaoEncontrados = [];

    // 1. Loop pelos Funcionários
    for (const agenda of agendas) {
      const { funcionarioId, horarios } = agenda;

      // Verifica se o funcionário existe E se pertence a este negócio (SaaS Security)
      const funcionarioExiste = await this.prisma.funcionario.findFirst({ 
        where: { id: funcionarioId, tenantId } 
      });

      if (!funcionarioExiste) {
        funcionariosNaoEncontrados.push(funcionarioId);
        continue;
      }

      // 2. Loop pelas Datas
      for (const horarioDia of horarios) {
        const data = typeof horarioDia.data === 'string'
          ? new Date(horarioDia.data + 'T00:00:00-03:00')
          : horarioDia.data;

        // 3. Loop pelas Horas
        for (const hora of horarioDia.horas) {

          // Valida formato "HH:MM"
          if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hora)) {
            horariosInvalidos.push(`Func. ${funcionarioId} - ${data.toISOString().split('T')[0]} ${hora}`);
            continue;
          }

          const horaFormatada = hora.padStart(5, '0');
          const [horaInicioH, minutoInicioM] = horaFormatada.split(':').map(Number);

          // --- LÓGICA DE IGNORAR REPETIDOS ---

          // A. Verifica se já está na FILA DE MEMÓRIA (enviado duplicado no mesmo JSON)
          const jaEstaNaFila = horariosParaCriar.some(h =>
            h.funcionarioId === funcionarioId &&
            h.data.getTime() === data.getTime() &&
            h.horaInicio === horaFormatada
          );

          if (jaEstaNaFila) {
            horariosIgnorados.push(`Ignorado (Duplicado): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue; 
          }

          // B. Verifica se já existe no BANCO DE DADOS (isolado por tenant)
          const conflito = await this.prisma.disponibilidade.findFirst({
            where: {
              tenantId,
              funcionarioId,
              data: data,
              horaInicio: horaFormatada
            }
          });

          if (conflito) {
            horariosIgnorados.push(`Ignorado (Já no BD): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue;
          }

          // Calcula hora fim (assumindo 1h de duração)
          const horaFimH = horaInicioH + 1;
          const horaFimString = `${horaFimH.toString().padStart(2, '0')}:${minutoInicioM.toString().padStart(2, '0')}`;

          horariosParaCriar.push({
            tenantId, // <-- SaaS Shield
            funcionarioId,
            data,
            horaInicio: horaFormatada,
            horaFim: horaFimString,
            disponivel: true
          });
        }
      }
    }

    // --- TRATAMENTO DE ERROS CRÍTICOS ---
    if (funcionariosNaoEncontrados.length > 0) {
      throw new BadRequestException({
        message: `Funcionários IDs [${funcionariosNaoEncontrados.join(', ')}] não encontrados ou não pertencem ao seu negócio.`,
        error: 'Funcionário inválido'
      });
    }

    if (horariosInvalidos.length > 0) {
      throw new BadRequestException({
        message: 'Alguns horários têm formato inválido (Use HH:MM).',
        details: horariosInvalidos
      });
    }

    // Se não sobrou nenhum horário novo (tudo era repetido)
    if (horariosParaCriar.length === 0) {
      return {
        message: "Nenhum horário novo criado (todos já existiam).",
        totalCriado: 0,
        totalIgnorado: horariosIgnorados.length
      };
    }

    // --- SALVA NO BANCO (MUITO MAIS RÁPIDO QUE .map + transaction) ---
    const resultado = await this.prisma.disponibilidade.createMany({
      data: horariosParaCriar,
      skipDuplicates: true
    });

    return {
      message: 'Agenda processada com sucesso!',
      totalCriado: resultado.count,
      totalIgnorado: horariosIgnorados.length
    };
  }

  // =========================================================================
  // 3. O PAINEL DO FUNCIONÁRIO (Métricas e Dashboard)
  // =========================================================================
  async obterPainel(tenantId: string, funcionarioId: number, periodo?: { inicio: Date, fim: Date }) {
    const inicio = periodo?.inicio || new Date(new Date().setDate(1)); // Primeiro dia do mês atual
    const fim = periodo?.fim || new Date();

    // 1. Agendamentos no Período (Concluídos)
    const agendamentos = await this.prisma.agendamento.findMany({
      where: {
        tenantId,
        funcionarioId,
        status: 'concluido',
        horario: { data: { gte: inicio, lte: fim } }
      }
    });

    // 2. Vendas Realizadas (Produtos e Bebidas)
    const vendas = await this.prisma.itemVenda.findMany({
      where: {
        tenantId,
        funcionarioId,
        dataVenda: { gte: inicio, lte: fim }
      }
    });

    // 3. Avaliações (Média e Total)
    const avaliacoes = await this.prisma.avaliacao.aggregate({
      where: { tenantId, funcionarioId },
      _avg: { nota: true },
      _count: { nota: true }
    });

    // 4. Assinaturas vinculadas a este profissional (Clientes que ele trouxe/atende)
    const totalAssinaturas = await this.prisma.assinaturaCliente.count({
      where: { tenantId, funcionarioId, ativo: true, status: 'Ativo' }
    });

    // Próximos clientes de HOJE (Para a tela inicial do App dele)
    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const agendamentosHoje = await this.prisma.agendamento.findMany({
      where: {
        tenantId,
        funcionarioId,
        status: 'agendado',
        horario: { data: hoje }
      },
      include: { horario: true },
      orderBy: { horario: { horaInicio: 'asc' } }
    });

    // Cálculos Financeiros
    const totalGanhoServicos = agendamentos.reduce((acc, ag) => acc + ag.valorServico, 0);
    const totalGanhoVendas = vendas.reduce((acc, v) => acc + Number(v.valorUnitario) * v.quantidade, 0);

    return {
      resumo: {
        totalAgendamentos: agendamentos.length,
        totalVendas: vendas.length,
        faturamentoServicos: totalGanhoServicos,
        faturamentoVendas: totalGanhoVendas,
        mediaAvaliacoes: avaliacoes._avg.nota ? parseFloat(avaliacoes._avg.nota.toFixed(1)) : 5.0,
        totalAvaliacoes: avaliacoes._count.nota,
        assinaturasAtivas: totalAssinaturas
      },
      agendaDeHoje: agendamentosHoje.map(ag => ({
        id: ag.id,
        cliente: ag.nomeCliente,
        servico: ag.servico,
        horario: ag.horario.horaInicio,
        pago: ag.pago
      }))
    };
  }

  // =========================================================================
  // 4. LISTAR HORÁRIOS DA GRADE (Consulta para o Painel)
  // =========================================================================
  async listarHorarios(tenantId: string, funcionarioId: number, inicio: string, fim: string) {
    // Monta o filtro base com a blindagem do SaaS
    const whereClause: any = { 
      tenantId, 
      funcionarioId 
    };

    // Ajusta as datas garantindo o fuso horário correto do Brasil
    if (inicio && fim) {
      whereClause.data = {
        gte: new Date(inicio + 'T00:00:00-03:00'),
        lte: new Date(fim + 'T23:59:59-03:00')
      };
    } else if (inicio) {
      whereClause.data = new Date(inicio + 'T00:00:00-03:00');
    }

    const horarios = await this.prisma.disponibilidade.findMany({
      where: whereClause,
      orderBy: [
        { data: 'asc' },
        { horaInicio: 'asc' }
      ]
    });

    return { horarios };
  }

  // =========================================================================
  // 5. EXCLUIR HORÁRIO AVULSO (Com Trava de Segurança)
  // =========================================================================
  async deletarHorario(tenantId: string, idHorario: number) {
    // 1. Busca o horário garantindo que pertence à barbearia correta
    const horario = await this.prisma.disponibilidade.findFirst({
      where: { id: idHorario, tenantId }
    });

    if (!horario) {
      throw new NotFoundException('Horário não encontrado ou não pertence a este estabelecimento.');
    }

    // 2. TRAVA ATÔMICA: Não permite deletar a "cadeira" se já tiver alguém sentado nela!
    if (!horario.disponivel) {
      throw new BadRequestException('Este horário já está reservado por um cliente! Cancele o agendamento antes de excluir a grade.');
    }

    // 3. Exclui em segurança
    await this.prisma.disponibilidade.delete({
      where: { id: idHorario }
    });

    return { message: 'Horário removido com sucesso da grade.' };
  }
}