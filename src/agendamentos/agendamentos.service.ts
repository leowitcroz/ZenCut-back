import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FormaPagamento } from '@prisma/client';

@Injectable()
export class AgendamentosService {
  constructor(private readonly prisma: PrismaService) { }

  // =========================================================================
  // HELPER: Separa os serviços cobertos pelo plano ativo (respeitando o dia
  // da semana permitido) dos que não são, e calcula quanto cobrar —
  // consumindo créditos, exceto quando o plano é ilimitado (aí sai de graça
  // sem mexer em creditosUsados).
  // =========================================================================
  private aplicarPlano(
    servicos: { id: number; nome: string; valor: number; planosInclusos: { id: number }[] }[],
    assinaturaAtiva: { planoId: number; limiteCreditos: number; creditosUsados: number; ilimitado: boolean; plano: { diasPermitidos: any } } | null,
    diaSemana: number
  ) {
    const diasPermitidos = assinaturaAtiva?.plano?.diasPermitidos as number[] | null;
    const diaValido = !diasPermitidos || diasPermitidos.length === 0 || diasPermitidos.includes(diaSemana);

    const servicosCobertosPeloPlano: typeof servicos = [];
    const servicosNaoCobertos: typeof servicos = [];
    let valorTotalOriginal = 0;

    for (const s of servicos) {
      valorTotalOriginal += s.valor;
      const coberto = assinaturaAtiva && diaValido && s.planosInclusos.some(p => p.id === assinaturaAtiva.planoId);
      if (coberto) {
        servicosCobertosPeloPlano.push(s);
      } else {
        servicosNaoCobertos.push(s);
      }
    }

    // Prioriza abater o crédito no serviço mais caro primeiro
    servicosCobertosPeloPlano.sort((a, b) => b.valor - a.valor);

    let valorFinalCobrado = 0;
    let creditosGastos = 0;
    let cobertosDeGraca = 0; // Quantos serviços realmente saíram sem custo pelo plano (crédito OU ilimitado)

    if (assinaturaAtiva?.ilimitado) {
      // Plano ilimitado: tudo que é coberto sai de graça, sem descontar crédito.
      cobertosDeGraca = servicosCobertosPeloPlano.length;
    } else {
      let saldoDisponivel = assinaturaAtiva ? (assinaturaAtiva.limiteCreditos - assinaturaAtiva.creditosUsados) : 0;
      for (const s of servicosCobertosPeloPlano) {
        if (saldoDisponivel > 0) {
          saldoDisponivel -= 1;
          creditosGastos += 1;
          cobertosDeGraca += 1;
        } else {
          valorFinalCobrado += s.valor;
        }
      }
    }

    for (const s of servicosNaoCobertos) {
      valorFinalCobrado += s.valor;
    }

    return { valorTotalOriginal, valorFinalCobrado, creditosGastos, cobertosDeGraca };
  }

  // =========================================================================
  // 1. CRIAR AGENDAMENTO (Totalmente Genérico e Multi-Tenant)
  // =========================================================================
  async criar(tenantId: string, data: {
    clienteId?: number;
    nomeClienteAvulso?: string;
    funcionarioId: number;
    horarioId: number;
    servicoIds: number[];
    formaPagamento: FormaPagamento;
    cupomAplicado?: boolean;
  }) {
    return await this.prisma.$transaction(async (tx) => {

      // 1. Validação e Bloqueio Atômico de Horário (Resolve a Race Condition)
      // O updateMany garante que ele SÓ vai atualizar se o disponivel ainda for true.
      const atualizouHorario = await tx.disponibilidade.updateMany({
        where: {
          id: data.horarioId,
          funcionarioId: data.funcionarioId,
          tenantId,
          disponivel: true // Condição crucial
        },
        data: { disponivel: false }
      });

      // Se a contagem for 0, significa que o horário não existe, é de outro tenant, 
      // ou alguém agendou na mesma fração de segundo.
      if (atualizouHorario.count === 0) {
        throw new ConflictException('Horário indisponível, não encontrado ou acabou de ser reservado por outro cliente.');
      }

      // Descobre o dia da semana desse horário (pra respeitar diasPermitidos do plano)
      const horarioReservado = await tx.disponibilidade.findUnique({
        where: { id: data.horarioId },
        select: { data: true }
      });
      const diaSemana = new Date(horarioReservado.data).getUTCDay();

      // 2. Busca Serviços e Assinatura
      const servicos = await tx.servico.findMany({
        where: { id: { in: data.servicoIds }, tenantId },
        include: { planosInclusos: true }
      });

      let assinaturaAtiva = null;
      let nomeDoCliente = data.nomeClienteAvulso || "Cliente Avulso";

      if (data.clienteId) {
        const cliente = await tx.cliente.findUnique({ where: { id: data.clienteId, tenantId } });
        if (cliente) {
          nomeDoCliente = cliente.nome;
          assinaturaAtiva = await tx.assinaturaCliente.findFirst({
            where: { clienteId: cliente.id, tenantId, ativo: true, status: 'Ativo', dataFim: { gte: new Date() } },
            include: { plano: true }
          });
        }
      }

      // 3. SEPARAÇÃO, CONSUMO DE CRÉDITO E PRECIFICAÇÃO (respeitando ilimitado + dia permitido)
      const { valorTotalOriginal, valorFinalCobrado: valorCalculado, creditosGastos: totalCreditosGastos, cobertosDeGraca } =
        this.aplicarPlano(servicos, assinaturaAtiva, diaSemana);
      let valorFinalCobrado = valorCalculado;

      if (data.cupomAplicado && valorFinalCobrado > 0) valorFinalCobrado *= 0.90;

      const tipoAgendamento = valorFinalCobrado === 0 && cobertosDeGraca > 0 ? 'PLANO_TOTAL' :
        cobertosDeGraca > 0 ? 'PARCIAL' : 'AVULSO';
      const planoAplicado = cobertosDeGraca > 0 ? assinaturaAtiva.plano.nome : null;

      // 4. Persistência
      const agendamento = await tx.agendamento.create({
        data: {
          tenantId,
          clienteId: data.clienteId || null,
          nomeCliente: nomeDoCliente,
          funcionarioId: data.funcionarioId,
          horarioId: data.horarioId,
          servico: servicos.map(s => s.nome).join(' + '),
          valorServico: valorTotalOriginal,
          valor: valorFinalCobrado,
          creditosGastos: totalCreditosGastos,
          tipo: tipoAgendamento,
          planoAplicado,
          qtdServicosPlano: cobertosDeGraca,
          formaPagamento: data.formaPagamento,
          cupom: data.cupomAplicado || false,
          status: 'agendado'
        }
      });

      // OBS: Retiramos o update do horário daqui do final, pois já o bloqueamos no passo 1!

      if (totalCreditosGastos > 0 && assinaturaAtiva) {
        await tx.assinaturaCliente.update({
          where: { id: assinaturaAtiva.id },
          data: { creditosUsados: { increment: totalCreditosGastos } }
        });
      }

      return agendamento;
    });
  }

  // =========================================================================
  // 2. CANCELAR AGENDAMENTO (Devolve horário e estorna créditos)
  // =========================================================================
  async cancelar(tenantId: string, agendamentoId: number, clienteId?: number) {

    return await this.prisma.$transaction(async (tx) => {
      const agendamento = await tx.agendamento.findFirst({
        where: { id: agendamentoId, tenantId },
        include: { horario: true, cliente: { include: { assinatura: true } } }
      });

      if (!agendamento) throw new NotFoundException('Agendamento não encontrado.');

      if (clienteId && agendamento.clienteId !== clienteId) {
        throw new ForbiddenException('Você não tem permissão para cancelar este agendamento.');
      }

      if (agendamento.status === 'cancelado') throw new BadRequestException('Já cancelado.');

      // 1. Atualiza Status e libera horário
      const agendamentoCancelado = await tx.agendamento.update({
        where: { id: agendamentoId },
        data: { status: 'cancelado' }
      });

      await tx.disponibilidade.update({
        where: { id: agendamento.horarioId },
        data: { disponivel: true }
      });

      // 2. Estorno Cirúrgico (Usa o valor exato gravado no agendamento)
      if (agendamento.creditosGastos > 0 && agendamento.cliente?.assinatura) {
        await tx.assinaturaCliente.update({
          where: { id: agendamento.cliente.assinatura.id },
          data: { creditosUsados: { decrement: agendamento.creditosGastos } }
        });
      }

      return agendamentoCancelado;
    });
  }

  // =========================================================================
  // 3. LISTAR AGENDAMENTOS DO NEGÓCIO
  // =========================================================================
  async listarTodos(tenantId: string, filtros?: { inicio?: string; fim?: string; status?: string; funcionarioId?: number }) {
    const whereClause: any = { tenantId };

    if (filtros?.status) {
      whereClause.status = filtros.status;
    }

    if (filtros?.funcionarioId) {
      whereClause.funcionarioId = filtros.funcionarioId;
    }

    if (filtros?.inicio || filtros?.fim) {
      whereClause.horario = { data: {} };

      if (filtros.inicio) {
        // Força o fuso do Brasil para começar 00:00:00 do dia selecionado
        whereClause.horario.data.gte = new Date(filtros.inicio + 'T00:00:00-03:00');
      }

      if (filtros.fim) {
        // Força o fuso do Brasil para terminar 23:59:59 do dia selecionado
        whereClause.horario.data.lte = new Date(filtros.fim + 'T23:59:59-03:00');
      }
    }

    return await this.prisma.agendamento.findMany({
      where: whereClause,
      include: {
        cliente: { select: { nome: true, telefone: true } },
        funcionario: { select: { nome: true } },
        horario: { select: { data: true, horaInicio: true, horaFim: true } }
      },
      orderBy: [
        { horario: { data: 'asc' } },
        { horario: { horaInicio: 'asc' } }
      ]
    });
  }

  // =========================================================================
  //3. EDITA O AGENDAMENTO
  // =========================================================================

  async editar(tenantId: string, agendamentoId: number, data: Partial<{
    clienteId: number;
    funcionarioId: number;
    horarioId: number;
    servicoIds: number[];
    formaPagamento: FormaPagamento;
    cupomAplicado: boolean;
    status?: string;
  }>) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. BUSCA O ESTADO ATUAL (Essencial para o estorno)
      const agendamentoAtual = await tx.agendamento.findFirst({
        where: { id: agendamentoId, tenantId },
        include: {
          horario: true,
          cliente: {
            include: { assinatura: true }
          }
        }
      });

      if (!agendamentoAtual) throw new NotFoundException('Agendamento não encontrado');

      // --- VALIDAÇÃO DE SEGURANÇA MULTI-TENANT (Prevenção de Injeção de IDs) ---
      if (data.clienteId && data.clienteId !== agendamentoAtual.clienteId) {
        const clientePertenceAoTenant = await tx.cliente.findFirst({
          where: { id: data.clienteId, tenantId }
        });
        if (!clientePertenceAoTenant) throw new ForbiddenException('Cliente inválido ou não pertence a esta empresa.');
      }

      if (data.funcionarioId && data.funcionarioId !== agendamentoAtual.funcionarioId) {
        const funcionarioPertenceAoTenant = await tx.funcionario.findFirst({
          where: { id: data.funcionarioId, tenantId }
        });
        if (!funcionarioPertenceAoTenant) throw new ForbiddenException('Funcionário inválido ou não pertence a esta empresa.');
      }

      // --- DEFINIÇÃO DE VARIÁVEIS EFETIVAS (Fallback para dados antigos) ---
      const funcionarioIdEfetivo = data.funcionarioId ?? agendamentoAtual.funcionarioId;
      const horarioIdEfetivo = data.horarioId ?? agendamentoAtual.horarioId;
      const clienteIdEfetivo = data.clienteId ?? agendamentoAtual.clienteId;
      const formaPagamentoEfetiva = data.formaPagamento ?? agendamentoAtual.formaPagamento;
      const cupomEfetivo = data.cupomAplicado ?? agendamentoAtual.cupom;

      if (data.status && Object.keys(data).length === 1) {
        return await this.prisma.agendamento.updateMany({
          where: { id: agendamentoId, tenantId },
          data: { status: data.status }
        });
      }

      // 2. ESTORNO E TROCA DE HORÁRIO COM TRAVA ATÔMICA

      // Se o horário for mudar, precisamos liberar o antigo e travar o novo com segurança
      let dataDoHorario = agendamentoAtual.horario.data;
      if (agendamentoAtual.horarioId !== horarioIdEfetivo) {
        // Trava o NOVO horário primeiro (se falhar, aborta tudo sem mexer no banco)
        const atualizouNovoHorario = await tx.disponibilidade.updateMany({
          where: { id: horarioIdEfetivo, tenantId, disponivel: true },
          data: { disponivel: false }
        });

        if (atualizouNovoHorario.count === 0) {
          throw new ConflictException('O novo horário selecionado não está disponível ou acabou de ser reservado.');
        }

        const novoHorario = await tx.disponibilidade.findUnique({
          where: { id: horarioIdEfetivo },
          select: { data: true }
        });
        dataDoHorario = novoHorario.data;

        // Libera o horário ANTIGO
        await tx.disponibilidade.update({
          where: { id: agendamentoAtual.horarioId },
          data: { disponivel: true }
        });
      }
      const diaSemana = new Date(dataDoHorario).getUTCDay();

      // B. Devolve EXATAMENTE os créditos que foram gastos no passado
      if (agendamentoAtual.creditosGastos > 0 && agendamentoAtual.cliente?.assinatura) {
        await tx.assinaturaCliente.update({
          where: { id: agendamentoAtual.cliente.assinatura.id },
          data: { creditosUsados: { decrement: agendamentoAtual.creditosGastos } }
        });
      }

      // 4. BUSCA NOVOS SERVIÇOS E CONFIGURAÇÕES DE PLANO
      const novosServicos = await tx.servico.findMany({
        where: { id: { in: data.servicoIds }, tenantId },
        include: { planosInclusos: true }
      });

      // 5. LÓGICA DE PRECIFICAÇÃO INTELIGENTE (Prioridade para o maior valor)
      let assinaturaAtiva = null;
      if (clienteIdEfetivo) {
        assinaturaAtiva = await tx.assinaturaCliente.findFirst({
          where: { clienteId: clienteIdEfetivo, tenantId, ativo: true, status: 'Ativo', dataFim: { gte: new Date() } },
          include: { plano: true }
        });
      }

      const { valorTotalOriginal, valorFinalCobrado: valorCalculado, creditosGastos: novosCreditosGastos, cobertosDeGraca } =
        this.aplicarPlano(novosServicos, assinaturaAtiva, diaSemana);
      let valorFinalCobrado = valorCalculado;

      if (cupomEfetivo && valorFinalCobrado > 0) valorFinalCobrado *= 0.90;

      const novoTipo = valorFinalCobrado === 0 && cobertosDeGraca > 0 ? 'PLANO_TOTAL' :
        cobertosDeGraca > 0 ? 'PARCIAL' : 'AVULSO';
      const novoPlanoAplicado = cobertosDeGraca > 0 ? assinaturaAtiva.plano.nome : null;

      // 6. ATUALIZAÇÃO NO BANCO
      const agendamentoAtualizado = await tx.agendamento.update({
        where: { id: agendamentoId },
        data: {
          clienteId: clienteIdEfetivo,
          funcionarioId: funcionarioIdEfetivo,
          horarioId: horarioIdEfetivo,
          servico: novosServicos.map(s => s.nome).join(' + '),
          valorServico: valorTotalOriginal,
          valor: valorFinalCobrado,
          creditosGastos: novosCreditosGastos,
          tipo: novoTipo,
          planoAplicado: novoPlanoAplicado,
          qtdServicosPlano: cobertosDeGraca,
          formaPagamento: formaPagamentoEfetiva,
          cupom: cupomEfetivo,
          status: 'agendado'
        }
      });

      // C. Debita os novos créditos consumidos
      if (novosCreditosGastos > 0 && assinaturaAtiva) {
        await tx.assinaturaCliente.update({
          where: { id: assinaturaAtiva.id },
          data: { creditosUsados: { increment: novosCreditosGastos } }
        });
      }

      return agendamentoAtualizado;
    });
  }

  async criarAgendaEmMassa(
    tenantId: string, // <-- Injetado pelo Controller através do @TenantId()
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

      // Verifica se o funcionário existe E se pertence a este Tenant
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
            horariosInvalidos.push(`Funcionário ${funcionarioId} - ${data.toISOString().split('T')[0]} ${hora}`);
            continue;
          }

          const horaFormatada = hora.padStart(5, '0');
          const [horaInicioH, minutoInicioM] = horaFormatada.split(':').map(Number);

          // --- LÓGICA DE IGNORAR REPETIDOS ---

          // 1. Verifica se já está na FILA DE MEMÓRIA (enviado duplicado no mesmo payload)
          const jaEstaNaFila = horariosParaCriar.some(h =>
            h.funcionarioId === funcionarioId &&
            h.data.getTime() === data.getTime() &&
            h.horaInicio === horaFormatada
          );

          if (jaEstaNaFila) {
            horariosIgnorados.push(`Ignorado (Duplicado no envio): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue;
          }

          // 2. Verifica se já existe no BANCO DE DADOS (isolado por tenant)
          const conflito = await this.prisma.disponibilidade.findFirst({
            where: {
              tenantId,
              funcionarioId,
              data: data,
              horaInicio: horaFormatada
            }
          });

          if (conflito) {
            horariosIgnorados.push(`Ignorado (Já existe no BD): Func. ${funcionarioId} às ${horaFormatada} em ${data.toISOString().split('T')[0]}`);
            continue;
          }

          // Se não existe na fila nem no banco, prepara para criar
          // Calcula hora fim (assumindo 1h de duração padrão, ajuste se precisar de durações variáveis)
          const horaFimH = horaInicioH + 1;
          const horaFimString = `${horaFimH.toString().padStart(2, '0')}:${minutoInicioM.toString().padStart(2, '0')}`;

          horariosParaCriar.push({
            tenantId,           // Garante a separação do SaaS
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
        message: 'Alguns horários têm formato inválido.',
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

    // --- SALVA NO BANCO OTIMIZADO ---
    // createMany é muito mais rápido e seguro para grandes volumes do que iterar fazendo .create()
    const resultado = await this.prisma.disponibilidade.createMany({
      data: horariosParaCriar,
      skipDuplicates: true // Camada extra de segurança do Prisma
    });

    return {
      message: 'Agenda processada com sucesso!',
      totalCriado: resultado.count, // createMany retorna um objeto com { count: number }
      totalIgnorado: horariosIgnorados.length
    };
  }


}

