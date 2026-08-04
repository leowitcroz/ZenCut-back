import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { AgendamentosService } from '../agendamentos/agendamentos.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PortalClienteService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private agendamentosService: AgendamentosService,
    ) {}

    // =========================================================
    // 1. REGISTRO DO CLIENTE
    // =========================================================
    async registrarCliente(tenantId: string, dados: any) {
        // Verifica se o e-mail já existe NESSA loja específica
        const clienteExistente = await this.prisma.cliente.findUnique({
            where: {
                email_tenantId: {
                    email: dados.email,
                    tenantId: tenantId
                }
            }
        });

        if (clienteExistente) {
            throw new ConflictException('Este e-mail já está cadastrado nesta loja.');
        }

        // Criptografa a senha antes de salvar
        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(dados.senha, salt);

        // Cria o cliente atrelado ao Tenant
        const novoCliente = await this.prisma.cliente.create({
            data: {
                tenantId,
                nome: dados.nome,
                email: dados.email,
                telefone: dados.telefone,
                senha: senhaHasheada,
                role: 1 // Role padrão de cliente final
            }
        });

        // Retorna o cliente sem a senha e já logado (gera o token)
        delete novoCliente.senha;
        return this.gerarTokenCliente(novoCliente, tenantId);
    }

    // =========================================================
    // 2. LOGIN DO CLIENTE
    // =========================================================
    async loginCliente(tenantId: string, email: string, senhaLimpa: string) {
        // Busca o cliente NESSA loja
        const cliente = await this.prisma.cliente.findUnique({
            where: {
                email_tenantId: { email, tenantId }
            }
        });

        if (!cliente || !cliente.senha) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        const senhaValida = await bcrypt.compare(senhaLimpa, cliente.senha);
        if (!senhaValida) {
            throw new UnauthorizedException('Credenciais inválidas.');
        }

        delete cliente.senha;
        return this.gerarTokenCliente(cliente, tenantId);
    }

    // =========================================================
    // 3. BUSCAR DADOS DO PERFIL (Meus Agendamentos, etc)
    // =========================================================
    async obterPerfilCompleto(tenantId: string, clienteId: number) {
        const perfil = await this.prisma.cliente.findUnique({
            where: { id: clienteId },
            include: {
                // Traz os agendamentos futuros e passados do cliente
                agendamentos: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        funcionario: { select: { nome: true } },
                        horario: true
                    }
                },
                // Traz a assinatura ativa dele (se tiver)
                assinatura: {
                    include: { plano: true }
                }
            }
        });

        delete perfil.senha;
        return perfil;
    }

    // =========================================================
    // 4. AUTOAGENDAMENTO (o próprio cliente marca um horário)
    // clienteId sempre vem do token (usuarioLogado.sub), nunca do body — assim
    // um cliente nunca consegue agendar em nome de outro trocando um id.
    // =========================================================
    async criarAgendamento(tenantId: string, clienteId: number, dados: {
        funcionarioId: number;
        horarioId: number;
        servicoIds: number[];
        cupomAplicado?: boolean;
    }) {
        return this.agendamentosService.criar(tenantId, {
            clienteId,
            funcionarioId: Number(dados.funcionarioId),
            horarioId: Number(dados.horarioId),
            servicoIds: (dados.servicoIds || []).map(Number),
            // Pagamento sempre é combinado/feito na loja — o cliente não escolhe
            // forma de pagamento no autoagendamento.
            formaPagamento: 'DINHEIRO',
            cupomAplicado: dados.cupomAplicado,
        });
    }

    // Mesma trava de posse já existente em agendamentosService.cancelar: só
    // cancela se o agendamento realmente pertencer a esse clienteId.
    async cancelarMeuAgendamento(tenantId: string, clienteId: number, agendamentoId: number) {
        return this.agendamentosService.cancelar(tenantId, agendamentoId, clienteId);
    }

    // =========================================================
    // 5. ATUALIZAR OS PRÓPRIOS DADOS (telefone / e-mail)
    // =========================================================
    async atualizarPerfil(tenantId: string, clienteId: number, dados: { telefone?: string; email?: string }) {
        if (dados.email) {
            const emailEmUso = await this.prisma.cliente.findUnique({
                where: { email_tenantId: { email: dados.email, tenantId } }
            });
            if (emailEmUso && emailEmUso.id !== clienteId) {
                throw new ConflictException('Este e-mail já está sendo usado por outra conta nesta loja.');
            }
        }

        const cliente = await this.prisma.cliente.update({
            where: { id: clienteId },
            data: {
                ...(dados.telefone !== undefined && { telefone: dados.telefone }),
                ...(dados.email !== undefined && { email: dados.email }),
            }
        });

        delete cliente.senha;
        return cliente;
    }

    // =========================================================
    // 6. TROCAR A PRÓPRIA SENHA
    // =========================================================
    async alterarSenha(tenantId: string, clienteId: number, senhaAtual: string, novaSenha: string) {
        const cliente = await this.prisma.cliente.findFirst({ where: { id: clienteId, tenantId } });
        if (!cliente) throw new NotFoundException('Cliente não encontrado.');

        const senhaCorreta = await bcrypt.compare(senhaAtual, cliente.senha || '');
        if (!senhaCorreta) throw new BadRequestException('Senha atual incorreta.');

        const novaSenhaHasheada = await bcrypt.hash(novaSenha, 10);
        await this.prisma.cliente.update({
            where: { id: clienteId },
            data: { senha: novaSenhaHasheada }
        });

        return { message: 'Senha alterada com sucesso.' };
    }

    // --- Função Auxiliar para gerar o JWT ---
    private gerarTokenCliente(cliente: any, tenantId: string) {
        const payload = {
            sub: cliente.id,
            email: cliente.email,
            role: cliente.role,
            tenantId: tenantId,
            userType: 'CLIENTE' // 👈 MUITO IMPORTANTE: Diferencia de 'FUNCIONARIO'
        };

        return {
            access_token: this.jwtService.sign(payload),
            cliente: cliente
        };
    }
}