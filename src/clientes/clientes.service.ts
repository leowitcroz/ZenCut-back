import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClientesService {
    constructor(private readonly prisma: PrismaService) { }

    async criarContaCliente(tenantId: string, data: any) {
        // 1. Verificação de e-mail único DENTRO DESTE TENANT
        // (Cruza a validação entre as tabelas Cliente e Funcionario)
        const clienteExistente = await this.prisma.cliente.findFirst({
            where: { email: data.email, tenantId }
        });

        if (clienteExistente) {
            throw new ConflictException('Este e-mail já está cadastrado para outro cliente neste estabelecimento.');
        }

        const funcionarioExistente = await this.prisma.funcionario.findFirst({
            where: { email: data.email, tenantId }
        });

        if (funcionarioExistente) {
            throw new ConflictException('Este e-mail já está em uso por um funcionário. Por favor, use outro e-mail para a conta de cliente.');
        }

        // 2. Hash da senha
        const saltRounds = 10;
        const senhaHasheada = await bcrypt.hash(data.senha, saltRounds);

        // 3. Criação do Cliente
        const novoCliente = await this.prisma.cliente.create({
            data: {
                tenantId,
                nome: data.nome,
                email: data.email,
                telefone: data.telefone,
                senha: senhaHasheada,
            },
            // Retornar dados seguros
            select: {
                id: true,
                nome: true,
                email: true,
                role:true,
                telefone: true,
                tenantId: true,
                createdAt: true,
            }
        });

        return {
            message: 'Conta criada com sucesso!',
            cliente: novoCliente
        };
    }

    // =========================================================================
    // 1. CRIAÇÃO RÁPIDA (SEM LOGIN/SENHA)
    // Usado quando o recepcionista cadastra o cliente na hora
    // =========================================================================
    async criarSemCadastro(tenantId: string, data: { nome: string; telefone: string; email?: string }) {
        // Valida se já existe alguém com esse telefone neste negócio específico
        if (data.telefone) {
            const telefoneEmUso = await this.prisma.cliente.findFirst({
                where: { telefone: data.telefone, tenantId }
            });

            if (telefoneEmUso) {
                throw new ConflictException('Este telefone já está cadastrado neste estabelecimento.');
            }
        }

        return await this.prisma.cliente.create({
            data: {
                tenantId,
                nome: data.nome,
                telefone: data.telefone,
                email: data.email || null,
                // Senha fica nula/vazia pois foi cadastrado manualmente
            },
            select: { id: true, nome: true, telefone: true, email: true }
        });
    }

    // =========================================================================
    // 2. LISTAGEM COM PAGINAÇÃO E BUSCA GLOBAL (Substitui searchUsers e getAll)
    // =========================================================================
    async listarTodos(tenantId: string, params: { skip?: number; take?: number; busca?: string }) {
        const skip = params.skip ? Number(params.skip) : 0;
        const take = params.take ? Number(params.take) : 10;

        if (skip < 0 || take < 0) throw new BadRequestException('Parâmetros de paginação inválidos');

        const whereClause: any = { tenantId };

        // Filtro unificado: busca por nome, email ou telefone
        if (params.busca && params.busca.trim().length > 0) {
            whereClause.OR = [
                { nome: { contains: params.busca } },
                { email: { contains: params.busca } },
                { telefone: { contains: params.busca } },
            ];
        }

        const [clientes, total] = await this.prisma.$transaction([
            this.prisma.cliente.findMany({
                where: whereClause,
                skip,
                take,
                orderBy: { nome: 'asc' },
                include: {
                    assinatura: {
                        include: { plano: true } // Traz qual é o plano da pessoa
                    },
                    _count: {
                        select: { agendamentos: true } // Conta o histórico de agendamentos rapidamente
                    }
                }
            }),
            this.prisma.cliente.count({ where: whereClause })
        ]);

        // Formatando a saída para não vazar dados sensíveis como senha
        return {
            data: clientes.map(c => ({
                id: c.id,
                nome: c.nome,
                email: c.email,
                telefone: c.telefone,
                assinatura: c.assinatura ? {
                    status: c.assinatura.status,
                    ativo: c.assinatura.ativo,
                    nomePlano: c.assinatura.plano.nome,
                    ilimitado: c.assinatura.ilimitado,
                    creditosRestantes: c.assinatura.limiteCreditos - c.assinatura.creditosUsados,
                    dataFim: c.assinatura.dataFim
                } : null,
                totalAgendamentos: c._count.agendamentos
            })),
            total
        };
    }

    // =========================================================================
    // 3. BUSCAS ESPECÍFICAS
    // =========================================================================
    async buscarPorId(tenantId: string, id: number) {
        const cliente = await this.prisma.cliente.findFirst({
            where: { id, tenantId },
            // Ao invés de buscar tudo e excluir a senha no JavaScript,
            // pedimos ao Prisma para nem trazer a senha do banco de dados.
            select: {
                id: true,
                nome: true,
                email: true,
                telefone: true,
                role: true,
                createdAt: true,
                updatedAt: true,
                tenantId: true,
                assinatura: {
                    include: { plano: true }
                }
            }
        });

        if (!cliente) throw new NotFoundException('Cliente não encontrado neste estabelecimento.');

        return cliente;
    }

    async buscarPorEmailOuTelefone(tenantId: string, termo: string) {
        const cliente = await this.prisma.cliente.findFirst({
            where: {
                tenantId,
                OR: [
                    { email: termo },
                    { telefone: termo }
                ]
            }
        });

        return cliente; // Pode retornar nulo, quem chama decide se lança erro
    }

    // =========================================================================
    // 4. HISTÓRICO DE AGENDAMENTOS DO CLIENTE
    // =========================================================================
    async listarAgendamentosDoCliente(tenantId: string, clienteId: number) {
        // Garantimos que o cliente existe e pertence ao tenant
        await this.buscarPorId(tenantId, clienteId);

        const agendamentos = await this.prisma.agendamento.findMany({
            where: { clienteId, tenantId },
            orderBy: { createdAt: 'desc' },
            include: {
                horario: true,
                funcionario: { select: { nome: true } }
            }
        });

        return agendamentos.map(a => ({
            id: a.id,
            servico: a.servico,
            tipo: a.tipo,
            status: a.status,
            valor: a.valor,
            formaPagamento: a.formaPagamento,
            data: a.horario.data,
            horario: `${a.horario.horaInicio} às ${a.horario.horaFim}`,
            funcionario: a.funcionario.nome
        }));
    }

    // =========================================================================
    // 5. ATUALIZAÇÃO E DELEÇÃO
    // =========================================================================
    async atualizar(tenantId: string, id: number, data: {
        nome?: string;
        email?: string;
        telefone?: string;
        senhaAtual?: string;
        novaSenha?: string;
    }) {
        const clienteAtual = await this.buscarPorId(tenantId, id);

        // Validações de conflito de e-mail/telefone (para não roubar de outro cliente)
        if (data.email && data.email !== clienteAtual.email) {
            const emailEmUso = await this.buscarPorEmailOuTelefone(tenantId, data.email);
            if (emailEmUso) throw new ConflictException('Este e-mail já está em uso.');
        }

        if (data.telefone && data.telefone !== clienteAtual.telefone) {
            const telEmUso = await this.buscarPorEmailOuTelefone(tenantId, data.telefone);
            if (telEmUso) throw new ConflictException('Este telefone já está em uso.');
        }

        const dadosAtualizacao: any = {
            ...(data.nome && { nome: data.nome }),
            ...(data.email && { email: data.email }),
            ...(data.telefone && { telefone: data.telefone }),
        };

        // Lógica de alteração de senha
        if (data.novaSenha) {
            if (!data.senhaAtual) throw new BadRequestException('A senha atual é obrigatória para alteração.');

            const clienteComSenha = await this.prisma.cliente.findUnique({ where: { id } });

            if (!clienteComSenha.senha) {
                // Cenário: Cliente foi criado "Sem Cadastro" pelo admin e agora está definindo a primeira senha
                dadosAtualizacao.senha = await bcrypt.hash(data.novaSenha, 10);
            } else {
                const senhaValida = await bcrypt.compare(data.senhaAtual, clienteComSenha.senha);
                if (!senhaValida) throw new UnauthorizedException('Senha atual incorreta.');
                dadosAtualizacao.senha = await bcrypt.hash(data.novaSenha, 10);
            }
        }

        const clienteAtualizado = await this.prisma.cliente.update({
            where: { id },
            data: dadosAtualizacao,
            select: { id: true, nome: true, email: true, telefone: true } // Não retorna a senha
        });

        return clienteAtualizado;
    }

    async deletar(tenantId: string, id: number) {
        // Confirma se existe neste tenant antes de deletar
        await this.buscarPorId(tenantId, id);

        return await this.prisma.cliente.delete({
            where: { id } // O Prisma vai cuidar de deletar em cascata ou setar NULL nos agendamentos, conforme seu Schema
        });
    }

}