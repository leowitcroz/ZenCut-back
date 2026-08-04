import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseType, PlanoSaaS } from '@prisma/client';
import { ComissoesService } from '../comissoes/comissoes.service';

const RECEITA_POR_PLANO_VAZIA = (): Record<PlanoSaaS, number> => ({
    BASICO: 0, INTERMEDIARIO_VENDAS: 0, INTERMEDIARIO_AGENDA: 0, PRO: 0, ENTERPRISE: 0,
});

const ASSINATURAS_ATIVAS_VAZIA = (): Record<PlanoSaaS, { qtd: number; valor: number }> => ({
    BASICO: { qtd: 0, valor: 0 },
    INTERMEDIARIO_VENDAS: { qtd: 0, valor: 0 },
    INTERMEDIARIO_AGENDA: { qtd: 0, valor: 0 },
    PRO: { qtd: 0, valor: 0 },
    ENTERPRISE: { qtd: 0, valor: 0 },
});

@Injectable()
export class FinanceiroService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly comissoesService: ComissoesService,
    ) { }

    private normalizarDataParaMeioDia(dataInput: string | Date): Date {
        const data = new Date(dataInput);
        data.setUTCHours(12, 0, 0, 0);
        return data;
    }

    // =========================================================================
    // ⚙️ MOTOR DE PROPAGAÇÃO AUTOMÁTICA DE DESPESAS FIXAS
    // =========================================================================
    private async propagarDespesasRecorrentes(tenantId: string, startDate: Date, endDate: Date) {
        const recorrentes = await this.prisma.despesaRecorrente.findMany({
            where: { tenantId, active: true }
        });

        if (recorrentes.length === 0) return;

        const startAno = startDate.getFullYear();
        const startMes = startDate.getMonth();
        const endAno = endDate.getFullYear();
        const endMes = endDate.getMonth();

        for (let ano = startAno; ano <= endAno; ano++) {
            const mesInicial = (ano === startAno) ? startMes : 0;
            const mesFinal = (ano === endAno) ? endMes : 11;

            for (let mes = mesInicial; mes <= mesFinal; mes++) {
                for (const rec of recorrentes) {
                    const anoCriacao = rec.createdAt.getFullYear();
                    const mesCriacao = rec.createdAt.getMonth();
                    const mesAnoCriacao = new Date(anoCriacao, mesCriacao, 1).getTime();
                    const mesAnoAlvo = new Date(ano, mes, 1).getTime();

                    if (mesAnoAlvo < mesAnoCriacao) continue;

                    const jaExiste = await this.prisma.despesa.findFirst({
                        where: {
                            tenantId,
                            description: rec.description,
                            type: ExpenseType.FIXED,
                            date: {
                                gte: new Date(ano, mes, 1),
                                lte: new Date(ano, mes + 1, 0)
                            }
                        }
                    });

                    if (!jaExiste) {
                        const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
                        const diaFinal = Math.min(rec.dayOfMonth, ultimoDiaDoMes);
                        const dataSegura = new Date(Date.UTC(ano, mes, diaFinal, 12, 0, 0));

                        await this.prisma.despesa.create({
                            data: {
                                tenantId,
                                description: rec.description,
                                amount: rec.amount,
                                type: ExpenseType.FIXED,
                                date: dataSegura,
                                isPaid: false
                            }
                        });
                    }
                }
            }
        }
    }

    // =========================================================================
    // 1. DESPESAS E ENTRADAS MANUAIS
    // =========================================================================
    async criarDespesaVariavel(tenantId: string, data: any) {
        return await this.prisma.despesa.create({
            data: {
                tenantId,
                description: data.description,
                amount: Number(data.amount),
                date: this.normalizarDataParaMeioDia(data.date),
                type: ExpenseType.VARIABLE,
                isPaid: data.isPaid !== undefined ? data.isPaid : true,
                produtoId: data.produtoId ? Number(data.produtoId) : null,
            }
        });
    }

    async criarDespesaRecorrente(tenantId: string, data: { description: string; amount: number; dayOfMonth: number; date: string | Date }) {
        return await this.prisma.$transaction(async (tx) => {
            const dataBase = this.normalizarDataParaMeioDia(data.date);
            const recorrente = await tx.despesaRecorrente.create({
                data: {
                    tenantId,
                    description: data.description,
                    amount: data.amount,
                    dayOfMonth: data.dayOfMonth,
                    active: true,
                    createdAt: dataBase
                }
            });

            const anoAtual = dataBase.getFullYear();
            const mesAtual = dataBase.getMonth();

            const jaExiste = await tx.despesa.findFirst({
                where: {
                    tenantId, description: data.description, type: ExpenseType.FIXED,
                    date: { gte: new Date(anoAtual, mesAtual, 1), lte: new Date(anoAtual, mesAtual + 1, 0) }
                }
            });

            if (!jaExiste) {
                const ultimoDiaDoMes = new Date(Date.UTC(anoAtual, mesAtual + 1, 0)).getUTCDate();
                const diaFinal = Math.min(data.dayOfMonth, ultimoDiaDoMes);
                const dataSegura = new Date(Date.UTC(anoAtual, mesAtual, diaFinal, 12, 0, 0));

                await tx.despesa.create({
                    data: {
                        tenantId,
                        description: data.description,
                        amount: data.amount,
                        type: ExpenseType.FIXED,
                        date: dataSegura,
                        isPaid: false
                    }
                });
            }
            return recorrente;
        });
    }

    async atualizarStatusPagamento(tenantId: string, id: string, isPaid: boolean) {
        const exists = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!exists) throw new NotFoundException('Despesa não encontrada.');
        return await this.prisma.despesa.update({ where: { id }, data: { isPaid } });
    }

    async atualizarDespesa(tenantId: string, id: string, dados: any) {
        const exists = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!exists) throw new NotFoundException('Despesa não encontrada.');

        return this.prisma.despesa.update({
            where: { id },
            data: {
                ...(dados.description !== undefined && { description: dados.description }),
                ...(dados.amount !== undefined && { amount: dados.amount }),
                ...(dados.date !== undefined && { date: this.normalizarDataParaMeioDia(dados.date) }),
                ...(dados.isPaid !== undefined && { isPaid: dados.isPaid }),
            }
        });
    }

    async alterarTipoDespesa(tenantId: string, id: string) {
        const despesa = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!despesa) throw new NotFoundException('Despesa não encontrada.');
        return this.prisma.despesa.update({
            where: { id },
            data: { type: despesa.type === 'FIXED' ? 'VARIABLE' : 'FIXED' }
        });
    }

    async deletarDespesa(tenantId: string, id: string) {
        const despesa = await this.prisma.despesa.findUnique({ where: { id, tenantId } });
        if (!despesa) throw new NotFoundException('Despesa não encontrada');

        return await this.prisma.$transaction(async (tx) => {
            if (despesa.type === 'FIXED') {
                const recorrencia = await tx.despesaRecorrente.findFirst({
                    where: { tenantId, description: despesa.description, amount: despesa.amount }
                });
                if (recorrencia) {
                    await tx.despesaRecorrente.delete({ where: { id: recorrencia.id } });
                    await tx.despesa.deleteMany({
                        where: { tenantId, description: despesa.description, type: 'FIXED', date: { gt: despesa.date } }
                    });
                }
            }
            return await tx.despesa.delete({ where: { id } });
        });
    }

    async criarEntrada(tenantId: string, dados: { description: string; amount: number; date: string | Date; isPaid?: boolean }) {
        return await this.prisma.entrada.create({
            data: {
                tenantId,
                description: dados.description,
                amount: dados.amount,
                date: this.normalizarDataParaMeioDia(dados.date),
                isPaid: dados.isPaid !== undefined ? dados.isPaid : true
            }
        });
    }

    async atualizarEntrada(tenantId: string, id: string, dados: any) {
        // 1. Roteamento para Vendas de Produtos (ID numérico)
        if (id.startsWith('venda-')) {
            const realId = parseInt(id.replace('venda-', ''), 10);
            return await this.prisma.itemVenda.update({
                where: { id: realId },
                data: {
                    ...(dados.amount !== undefined && { valorUnitario: dados.amount })
                }
            });
        }

        // 2. Roteamento para Agendamentos (ID numérico)
        if (id.startsWith('agend-')) {
            const realId = parseInt(id.replace('agend-', ''), 10);
            // Atualize conforme os campos que você permite editar em um agendamento concluído
            return await this.prisma.agendamento.update({
                where: { id: realId },
                data: {
                    ...(dados.amount !== undefined && { valor: dados.amount })
                }
            });
        }

        // 3. Roteamento para Entradas Manuais (ID em formato UUID string)
        // Remove o prefixo se existir, ou assume que é o ID limpo
        const realId = id.replace('manual-', '');

        const exists = await this.prisma.entrada.findUnique({
            where: { id: realId, tenantId }
        });

        if (!exists) {
            throw new NotFoundException('Entrada manual não encontrada.');
        }

        return await this.prisma.entrada.update({
            where: { id: realId },
            data: {
                ...(dados.description !== undefined && { description: dados.description }),
                ...(dados.amount !== undefined && { amount: Number(dados.amount) }),
                ...(dados.date !== undefined && { date: this.normalizarDataParaMeioDia(dados.date) }),
                ...(dados.isPaid !== undefined && { isPaid: dados.isPaid }),
            }
        });
    }

    async deletarEntrada(tenantId: string, id: string) {
    // 1. Cancelamento de Venda de Produto/Consumível
    if (id.startsWith('venda-')) {
        const realId = parseInt(id.replace('venda-', ''), 10);
        const venda = await this.prisma.itemVenda.findFirst({ where: { id: realId, tenantId } });
        if (!venda) throw new NotFoundException('Venda não encontrada.');

        return await this.prisma.$transaction(async (tx) => {
            // Devolve o item pro estoque, se ele estiver vinculado a um produto cadastrado
            if (venda.produtoId) {
                await tx.produto.update({
                    where: { id: venda.produtoId },
                    data: { estoque: { increment: venda.quantidade } }
                });
            }
            return await tx.itemVenda.delete({ where: { id: realId } });
        });
    }

    // 2. Agendamentos concluídos não são cancelados por essa rota
    if (id.startsWith('agend-')) {
        throw new BadRequestException('Para cancelar um serviço concluído, use o módulo de Agenda.');
    }

    // 3. Entrada Manual (padrão) — precisa remover o prefixo antes de buscar, senão nunca acha
    const realId = id.replace('manual-', '');
    const exists = await this.prisma.entrada.findUnique({ where: { id: realId, tenantId } });
    if (!exists) throw new NotFoundException('Entrada não encontrada.');
    return await this.prisma.entrada.delete({ where: { id: realId } });
}

    async listarEntradas(tenantId: string, filters: { startDate: Date; endDate: Date }) {
        return await this.prisma.entrada.findMany({
            where: { tenantId, date: { gte: filters.startDate, lte: filters.endDate } },
            orderBy: { date: 'asc' }
        });
    }

    async listarDespesas(tenantId: string, filters: { startDate: Date; endDate: Date; type?: 'FIXED' | 'VARIABLE' }) {
        await this.propagarDespesasRecorrentes(tenantId, filters.startDate, filters.endDate);
        return await this.prisma.despesa.findMany({
            where: {
                tenantId, date: { gte: filters.startDate, lte: filters.endDate },
                ...(filters.type && { type: filters.type })
            },
            orderBy: { date: 'asc' }
        });
    }

    // =========================================================================
    // 🚀 RESUMOS FINANCEIROS (COM BLINDAGEM ANTI-NAN)
    // =========================================================================
    async obterResumoFinanceiro(tenantId: string, startDate?: string, endDate?: string) {
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth();

        const dataInicioReal = startDate
            ? new Date(startDate + 'T00:00:00-03:00')
            : new Date(anoAtual, mesAtual, 1, 0, 0, 0);

        const dataFimReal = endDate
            ? new Date(endDate + 'T23:59:59-03:00')
            : new Date(anoAtual, mesAtual + 1, 0, 23, 59, 59);

        // 1. Despesas
        await this.propagarDespesasRecorrentes(tenantId, dataInicioReal, dataFimReal);
        const despesas = await this.prisma.despesa.findMany({
            where: { tenantId, date: { gte: dataInicioReal, lte: dataFimReal } },
            orderBy: { date: 'desc' }
        });
        const despesasPagas = despesas.filter(d => d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
        const despesasPendentes = despesas.filter(d => !d.isPaid).reduce((acc, d) => acc + (Number(d.amount) || 0), 0);

        // 2. Agendamentos
        const agendamentosConcluidos = await this.prisma.agendamento.findMany({
            where: { tenantId, status: 'concluido', horario: { data: { gte: dataInicioReal, lte: dataFimReal } } }
        });

        let totalAgendamentos = 0;
        const receitaPorPagamento = { DINHEIRO: 0, PIX: 0, CARTAO: 0, MANUAL: 0 };
        const listaAgendamentos = agendamentosConcluidos.map(ag => {
            const valor = Number(ag.valor) || 0;
            totalAgendamentos += valor;
            if (ag.formaPagamento && receitaPorPagamento[ag.formaPagamento] !== undefined) {
                receitaPorPagamento[ag.formaPagamento] += valor;
            }
            // Agendamentos concluídos são sempre considerados recebidos (não têm status de pendência no schema)
            return { id: `agend-${ag.id}`, description: `Serviço: ${ag.servico}`, amount: valor, date: ag.createdAt, tipo: 'AGENDAMENTO', isPaid: true };
        });

        // 3. Vendas de Produtos/Consumíveis
        const listaVendas = await this.prisma.itemVenda.findMany({
            where: { tenantId, dataVenda: { gte: dataInicioReal, lte: dataFimReal } }
        });

        let totalProdutos = 0;
        let totalBebidas = 0;
        const listaVendasFormatada = listaVendas.map(item => {
            const valor = (Number(item.valorUnitario) || 0) * (item.quantidade || 1);
            if (item.tipoOrigem === 'CONSUMIVEL') {
                totalBebidas += valor;
            } else {
                totalProdutos += valor;
            }
            // Vendas já são registradas como recebidas no momento da venda
            return { id: `venda-${item.id}`, description: `Venda: ${item.nomeItem}`, amount: valor, date: item.dataVenda, tipo: 'VENDA_PRODUTO', isPaid: true };
        });

        // 4. Entradas Manuais
        const entradasManuais = await this.prisma.entrada.findMany({
            where: { tenantId, date: { gte: dataInicioReal, lte: dataFimReal } }
        });

        let totalEntradasManuaisPagas = 0;
        let totalEntradasManuaisPendentes = 0;
        const listaManuaisFormatada = entradasManuais.map(e => {
            const valor = Number(e.amount) || 0;
            if (e.isPaid) {
                totalEntradasManuaisPagas += valor;
                receitaPorPagamento.MANUAL += valor;
            } else {
                totalEntradasManuaisPendentes += valor;
            }
            // Aqui o isPaid precisa vir do banco de verdade (é o que estava faltando)
            return { id: `manual-${e.id}`, description: e.description, amount: valor, date: e.date, tipo: 'ENTRADA_MANUAL', isPaid: e.isPaid };
        });

        // 4.5 Assinaturas de Planos (novas assinaturas + renovações no período)
        const renovacoesPlanos = await this.prisma.historicoRenovacao.findMany({
            where: {
                dataRenovacao: { gte: dataInicioReal, lte: dataFimReal },
                assinatura: { tenantId }
            },
            include: { assinatura: { include: { cliente: true } } }
        });

        let totalPlanos = 0;
        const listaPlanosFormatada = renovacoesPlanos.map(r => {
            const valor = Number(r.valor) || 0;
            totalPlanos += valor;
            const nomeCliente = r.assinatura?.cliente?.nome;
            return {
                id: `plano-${r.id}`,
                description: `Assinatura: ${r.tipoPlano}${nomeCliente ? ' - ' + nomeCliente : ''}`,
                amount: valor,
                date: r.dataRenovacao,
                tipo: 'PLANO_ASSINATURA',
                isPaid: true
            };
        });

        // 4.6 Comissões da equipe no período (usando a regra que a loja configurou)
        const relatorioEquipe = await this.obterRelatorioEquipe(tenantId, dataInicioReal, dataFimReal);
        const totalComissoesPeriodo = relatorioEquipe.reduce((acc, f) => acc + (Number(f.comissaoTotal) || 0), 0);

        // 5. Consolidado Final
        const totalVendasGeral = totalProdutos + totalBebidas;
        const totalEntradasReal = totalAgendamentos + totalVendasGeral + totalEntradasManuaisPagas + totalPlanos;

        // Unifica tudo na lista de entradas para o front exibir
        const listaCompletaEntradas = [...listaAgendamentos, ...listaVendasFormatada, ...listaManuaisFormatada, ...listaPlanosFormatada]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            totais: {
                totalFinanceiro: {
                    receitaBrutaTotal: totalEntradasReal,
                    avulsos: totalAgendamentos,
                    produtos: totalProdutos,
                    planos: totalPlanos,
                    bebidas: totalBebidas,
                    manuais: totalEntradasManuaisPagas,
                    pendentesAReceber: totalEntradasManuaisPendentes
                },
                receitaPorPagamento,
                qtdAgendamentosConcluidos: agendamentosConcluidos.length,
                custosOperacionais: {
                    total: despesasPagas + despesasPendentes,
                    pagas: despesasPagas,
                    pendentes: despesasPendentes,
                    lista: despesas
                },
                entradas: { lista: listaCompletaEntradas }, // 👈 Lista completa unificada
                totalComissoes: { total: totalComissoesPeriodo }
            },
            lucroLiquidoReal: totalEntradasReal - despesasPagas
        };
    }

    // =========================================================================
    // 📊 GRÁFICOS DO DASHBOARD (série histórica mês a mês)
    // Diferente do resumo (que soma tudo num período só), aqui agrupamos por
    // mês pra dar pra desenhar tendência — faturamento, serviços mais
    // vendidos, crescimento de assinaturas e de clientes novos.
    // =========================================================================
    async obterGraficos(tenantId: string, meses: number = 6) {
        const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const hoje = new Date();

        // Monta a lista de meses do intervalo, do mais antigo pro mais recente
        const mesesLista = Array.from({ length: meses }, (_, i) => {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1 - i), 1);
            return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: NOMES_MES[d.getMonth()] };
        });

        const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1, 0, 0, 0);
        const dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
        const chaveMes = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;

        const [agendamentos, vendas, entradas, renovacoes, clientes] = await Promise.all([
            this.prisma.agendamento.findMany({
                where: { tenantId, status: 'concluido', horario: { data: { gte: dataInicio, lte: dataFim } } },
                include: { horario: true }
            }),
            this.prisma.itemVenda.findMany({ where: { tenantId, dataVenda: { gte: dataInicio, lte: dataFim } } }),
            this.prisma.entrada.findMany({ where: { tenantId, isPaid: true, date: { gte: dataInicio, lte: dataFim } } }),
            this.prisma.historicoRenovacao.findMany({ where: { assinatura: { tenantId }, dataRenovacao: { gte: dataInicio, lte: dataFim } } }),
            this.prisma.cliente.findMany({ where: { tenantId, createdAt: { gte: dataInicio, lte: dataFim } }, select: { createdAt: true } }),
        ]);

        // --- Faturamento mensal (mesma composição de receita do Resumo, só que por mês) ---
        const faturamentoPorMes = new Map(mesesLista.map(m => [m.chave, 0]));
        for (const ag of agendamentos) {
            const chave = chaveMes(new Date(ag.horario.data));
            if (faturamentoPorMes.has(chave)) faturamentoPorMes.set(chave, faturamentoPorMes.get(chave)! + (Number(ag.valor) || 0));
        }
        for (const v of vendas) {
            const chave = chaveMes(new Date(v.dataVenda));
            if (faturamentoPorMes.has(chave)) faturamentoPorMes.set(chave, faturamentoPorMes.get(chave)! + (Number(v.valorUnitario) || 0) * (v.quantidade || 1));
        }
        for (const e of entradas) {
            const chave = chaveMes(new Date(e.date));
            if (faturamentoPorMes.has(chave)) faturamentoPorMes.set(chave, faturamentoPorMes.get(chave)! + (Number(e.amount) || 0));
        }
        for (const r of renovacoes) {
            const chave = chaveMes(new Date(r.dataRenovacao));
            if (faturamentoPorMes.has(chave)) faturamentoPorMes.set(chave, faturamentoPorMes.get(chave)! + (Number(r.valor) || 0));
        }
        const faturamentoMensal = mesesLista.map(m => ({
            label: m.label,
            total: Math.round((faturamentoPorMes.get(m.chave) || 0) * 100) / 100
        }));

        // --- Serviços mais usados (conta ocorrências dentro do período inteiro) ---
        const contagemServicos = new Map<string, number>();
        for (const ag of agendamentos) {
            for (const nome of ag.servico.split(' + ').map(s => s.trim()).filter(Boolean)) {
                contagemServicos.set(nome, (contagemServicos.get(nome) || 0) + 1);
            }
        }
        const servicosMaisUsados = Array.from(contagemServicos.entries())
            .map(([nome, qtd]) => ({ nome, qtd }))
            .sort((a, b) => b.qtd - a.qtd)
            .slice(0, 6);

        // --- Crescimento de assinaturas (novas renovações/assinaturas por mês) ---
        const planosPorMes = new Map(mesesLista.map(m => [m.chave, 0]));
        for (const r of renovacoes) {
            const chave = chaveMes(new Date(r.dataRenovacao));
            if (planosPorMes.has(chave)) planosPorMes.set(chave, planosPorMes.get(chave)! + 1);
        }
        const crescimentoPlanos = mesesLista.map(m => ({ label: m.label, qtd: planosPorMes.get(m.chave) || 0 }));

        // --- Crescimento de clientes (novos cadastros por mês) ---
        const clientesPorMes = new Map(mesesLista.map(m => [m.chave, 0]));
        for (const c of clientes) {
            const chave = chaveMes(new Date(c.createdAt));
            if (clientesPorMes.has(chave)) clientesPorMes.set(chave, clientesPorMes.get(chave)! + 1);
        }
        const crescimentoClientes = mesesLista.map(m => ({ label: m.label, qtd: clientesPorMes.get(m.chave) || 0 }));

        return { faturamentoMensal, servicosMaisUsados, crescimentoPlanos, crescimentoClientes };
    }

    async obterResumoFinanceiroSaaS(myTenantId: string, startDate: Date, endDate: Date) {
        await this.propagarDespesasRecorrentes(myTenantId, startDate, endDate);
        // 👇 Filtra por dataPagamento (quando o dinheiro realmente entrou), não por dataVencimento
        // (que agora representa o PRÓXIMO vencimento projetado, não a data do pagamento em si)
        const renovacoesPagas = await this.prisma.faturaSaaS.findMany({
            where: {
                status: 'ATIVO',
                dataPagamento: { gte: startDate, lte: endDate },
                tenant: { id: { not: myTenantId } }
            },
            include: { tenant: true }
        });

        let receitaBruta = 0;
        const receitaPorPlano = RECEITA_POR_PLANO_VAZIA();
        const assinaturasAtivas = ASSINATURAS_ATIVAS_VAZIA();

        renovacoesPagas.forEach(fatura => {
            const valorPago = Number(fatura.valor) || 0;
            receitaBruta += valorPago;
            const plano = fatura.tenant.planoSaaS;
            if (receitaPorPlano[plano] !== undefined) {
                receitaPorPlano[plano] += valorPago;
                assinaturasAtivas[plano].qtd += 1;
                assinaturasAtivas[plano].valor += valorPago;
            }
        });

        const despesasInfra = await this.prisma.despesa.findMany({
            where: { tenantId: myTenantId, date: { gte: startDate, lte: endDate } },
            orderBy: { date: 'desc' }
        });

        const totalCustos = despesasInfra.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

        return {
            totais: {
                receitaBrutaTotal: receitaBruta,
                mrrAtual: receitaBruta,
                custosInfraestrutura: { total: totalCustos, lista: despesasInfra },
            },
            receitaPorPlano,
            assinaturasAtivas
        };
    }

    // 👉 FONTE ÚNICA DE VERDADE: usada tanto pelo relatório do dono (todos os
    // funcionários) quanto pelo autoatendimento do funcionário (passando o próprio
    // id em funcionarioId) — garante que os números batem nos dois lados sempre,
    // porque é literalmente o mesmo cálculo rodando.
    async obterRelatorioEquipe(tenantId: string, startDate: Date, endDate: Date, funcionarioId?: number) {
        // Regra de comissão que a própria loja configurou (% produto, % consumível,
        // % serviço avulso, e valor fixo por serviço coberto por plano).
        const regra = await this.comissoesService.obterRegra(tenantId);
        const percProduto = Number(regra.percentualProduto) / 100;
        const percConsumivel = Number(regra.percentualConsumivel) / 100;
        const percAvulso = Number(regra.percentualAvulso) / 100;
        const valorFixoPlano = Number(regra.valorFixoPlano);

        const funcionarios = await this.prisma.funcionario.findMany({
            where: { tenantId, ativo: true, ...(funcionarioId !== undefined && { id: funcionarioId }) }
        });
        const relatorio = await Promise.all(funcionarios.map(async (func) => {
            const agendamentos = await this.prisma.agendamento.findMany({
                where: { tenantId, funcionarioId: func.id, status: 'concluido', horario: { data: { gte: startDate, lte: endDate } } }
            });

            const vendas = await this.prisma.itemVenda.findMany({
                where: { tenantId, funcionarioId: func.id, dataVenda: { gte: startDate, lte: endDate } }
            });

            // Vendas: arrecadação e comissão separadas por produto x consumível/bebida,
            // e contagem de quantos itens de cada produto foram vendidos.
            let arrecadacaoProdutos = 0, arrecadacaoBebidas = 0;
            let comissaoProdutos = 0, comissaoBebidas = 0;
            const produtosTally = new Map<string, number>();
            vendas.forEach(v => {
                const valorVenda = Number(v.valorUnitario) * v.quantidade;
                if (v.tipoOrigem === 'CONSUMIVEL') {
                    arrecadacaoBebidas += valorVenda;
                    comissaoBebidas += valorVenda * percConsumivel;
                } else {
                    arrecadacaoProdutos += valorVenda;
                    comissaoProdutos += valorVenda * percProduto;
                }
                produtosTally.set(v.nomeItem, (produtosTally.get(v.nomeItem) || 0) + v.quantidade);
            });

            // Serviços: faturamento avulso, créditos de plano, e contagem de quantas
            // vezes cada serviço foi realizado (o nome vem concatenado tipo "Corte +
            // Barba", então separamos por " + " pra tabular certinho) — já separando
            // avulso de plano pelo tipo do agendamento, pra não confundir o barbeiro.
            // "Misto" é quando o agendamento teve serviço avulso E de plano juntos
            // (ex: Corte no plano + Barba avulsa) e não dá pra saber qual parte era
            // qual só pelo nome concatenado.
            let totalFaturamento = 0;
            let totalServicosPlano = 0;
            let clientesComPlano = 0;
            let clientesAvulsos = 0;
            const servicosTally = new Map<string, { avulso: number; plano: number; misto: number }>();

            agendamentos.forEach(ag => {
                totalFaturamento += Number(ag.valor) || 0;
                totalServicosPlano += ag.qtdServicosPlano || 0;
                if (ag.qtdServicosPlano > 0) clientesComPlano += 1; else clientesAvulsos += 1;

                const bucket = ag.tipo === 'PLANO_TOTAL' ? 'plano' : ag.tipo === 'PARCIAL' ? 'misto' : 'avulso';

                (ag.servico || '').split(' + ').map(s => s.trim()).filter(Boolean).forEach(nome => {
                    const atual = servicosTally.get(nome) || { avulso: 0, plano: 0, misto: 0 };
                    atual[bucket] += 1;
                    servicosTally.set(nome, atual);
                });
            });

            // Comissão sobre serviços: % em cima do que foi cobrado fora do plano
            // (avulso ou a parte não coberta de um misto) + valor fixo por serviço
            // que saiu pelo plano (qtdServicosPlano conta certinho mesmo em planos
            // ilimitados, onde creditosGastos fica sempre 0).
            const comissaoServicosAvulsos = totalFaturamento * percAvulso;
            const comissaoServicosPlano = totalServicosPlano * valorFixoPlano;
            const comissaoTotal = comissaoServicosAvulsos + comissaoServicosPlano + comissaoProdutos + comissaoBebidas;

            return {
                barbeiroId: func.id, nomeBarbeiro: func.nome,
                totalServicosRealizados: agendamentos.length,
                totalFaturamento,
                comissaoTotal,
                detalhes: {
                    clientesComPlano,
                    clientesAvulsos,
                    arrecadacao: {
                        avulsos: totalFaturamento,
                        produtos: arrecadacaoProdutos,
                        bebidas: arrecadacaoBebidas,
                        total: totalFaturamento + arrecadacaoProdutos + arrecadacaoBebidas
                    },
                    comissao: {
                        servicosAvulsos: comissaoServicosAvulsos,
                        servicosPlano: comissaoServicosPlano,
                        produtos: comissaoProdutos,
                        bebidas: comissaoBebidas,
                        total: comissaoTotal
                    },
                    servicos: Array.from(servicosTally.entries()).map(([nome, qtd]) => ({
                        nome,
                        avulso: qtd.avulso,
                        plano: qtd.plano,
                        misto: qtd.misto,
                        vezes: qtd.avulso + qtd.plano + qtd.misto
                    })),
                    produtosVendidos: Array.from(produtosTally.entries()).map(([nome, quantidade]) => ({ nome, quantidade }))
                }
            };
        }));
        return relatorio.sort((a, b) => b.totalServicosRealizados - a.totalServicosRealizados);
    }

    async obterLojasRelatorioFinanceiro() {
        const [lojas, precos] = await Promise.all([
            this.prisma.tenant.findMany({
                where: { ativo: true }, select: { id: true, nomeNegocio: true, planoSaaS: true, createdAt: true }
            }),
            this.prisma.planoPreco.findMany(),
        ]);

        const valorPorPlano = Object.fromEntries(precos.map(p => [p.plano, Number(p.valorMensal)]));

        return lojas.map(loja => ({
            ...loja,
            valorAssinatura: valorPorPlano[loja.planoSaaS] || 0,
            criadoEm: loja.createdAt
        }));
    }
}