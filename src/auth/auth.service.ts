import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ClientesService } from '../clientes/clientes.service'; // Importamos o serviço novo que criamos!
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {

    private issuer = 'saas-login';
    private audience = 'users';

    constructor(
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService,
        private readonly clientesService: ClientesService, // Usado no registro
    ) { }

    // =========================================================================
    // 1. GERAÇÃO E VALIDAÇÃO DE TOKENS
    // =========================================================================
    createToken(payload: { sub: number, email: string, role: number, tipo: string, tenantId: string }) {
        return {
            accessToken: this.jwt.sign(
                payload,
                {
                    expiresIn: '7d',
                    // subject: String(payload.sub),
                    issuer: this.issuer,
                    audience: this.audience,
                }
            ),
        };
    }

    checkToken(token: string) {
        try {
            const data = this.jwt.verify(token);
            return data;
        } catch (e) {
            throw new BadRequestException('Token inválido ou expirado.');
        }
    }

    isValidToken(token: string) {
        try {
            this.checkToken(token);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Verifica o token E se o usuário ainda existe no banco de dados
    async checkTokenExist(token: string) {
        if (!token) return false;

        try {
            const data = this.checkToken(token);

            let user = null;

            // O nosso token agora sabe se a pessoa é CLIENTE ou FUNCIONARIO
            if (data.tipo === 'FUNCIONARIO') {
                user = await this.prisma.funcionario.findFirst({
                    where: { id: data.sub, tenantId: data.tenantId }
                });
            } else {
                user = await this.prisma.cliente.findFirst({
                    where: { id: data.sub, tenantId: data.tenantId }
                });
            }

            if (!user) return false;

            return { data }; // Retorna o payload decodificado se o usuário ainda for válido
        } catch (error) {
            return false;
        }
    }

    // =========================================================================
    // 2. REGISTRO DE CLIENTE (Reaproveita o ClientesService)
    // =========================================================================
    async register(tenantId: string, info: any) {
        // Usa a regra blindada que já criamos para garantir que o e-mail não repita
        const resultado = await this.clientesService.criarContaCliente(tenantId, info);
        const novoCliente = resultado.cliente;

        // Cria o payload já com a estrutura do multi-tenant
        const payload = {
            sub: novoCliente.id,
            email: novoCliente.email,
            role: novoCliente.role || 1,
            tipo: 'CLIENTE',
            tenantId: tenantId
        };

        const token = this.createToken(payload);
        const data = this.checkToken(token.accessToken);

        return {
            data,
            token
        };
    }

    // =========================================================================
    // 3. LOGIN (Multiuso: Funciona para Donos, Barbeiros, Recepcionistas e Clientes)
    // =========================================================================
    async login(tenantId: string | undefined, email: string, senhaDigitada: string) {
    // 1. Busca o FUNCIONÁRIO trazendo a relação com o Tenant junto
    let user: any = await this.prisma.funcionario.findFirst({
        where: {
            email: email,
            ...(tenantId && { tenantId: tenantId })
        },
        include: {
            tenant: true 
        }
    });

    let tipoUsuario = 'FUNCIONARIO';
    let subdominioDetectado = '';

    if (user && user.tenant) {
        subdominioDetectado = user.tenant.subdomain;
    }

    // 2. Se não achou funcionário, tenta achar nos CLIENTES
    if (!user) {
        user = await this.prisma.cliente.findFirst({
            where: {
                email: email,
                ...(tenantId && { tenantId: tenantId })
            },
            // 👇 ADICIONE ISSO AQUI TAMBÉM POR SEGURANÇA!
            include: {
                tenant: true 
            }
        });
        tipoUsuario = 'CLIENTE';
        if (user && user.tenant) {
            subdominioDetectado = user.tenant.subdomain;
        }
    }

    // Validação da coluna 'password' do seu banco
    if (!user || !user.password) {
        throw new UnauthorizedException('Email e/ou senha incorretos.');
    }

    if (tipoUsuario === 'FUNCIONARIO' && !user.ativo) {
        throw new UnauthorizedException('Sua conta de funcionário está desativada.');
    }

    const senhaCorreta = await bcrypt.compare(senhaDigitada, user.password);
    if (!senhaCorreta) {
        throw new UnauthorizedException('Email e/ou senha incorretos.');
    }

    // 👇 🔍 INSPEÇÃO DE SEGURANÇA (Olhe o terminal do seu NestJS ao logar!)
    console.log("==========================================");
    console.log("USUÁRIO LOGADO COMO:", tipoUsuario);
    console.log("DADOS DO TENANT NO BACKEND:", user.tenant);
    console.log("==========================================");

    const tenantIdFinal = tenantId || user.tenantId;

    const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tipo: tipoUsuario,
        tenantId: tenantIdFinal
    };

    const token = this.createToken(payload);
    const data = this.checkToken(token.accessToken);

    return {
        data,
        token,
        tenantId: tenantIdFinal,
        subdomain: subdominioDetectado,
        features: {
            plano: user.tenant?.planoSaaS || 'BASICO',
            financeiro: user.tenant?.moduloFinanceiro == 1 || user.tenant?.moduloFinanceiro === true,
            agendamento: user.tenant?.moduloAgendamento == 1 || user.tenant?.moduloAgendamento === true,
            vendas: user.tenant?.moduloVendas == 1 || user.tenant?.moduloVendas === true,
            produtos: user.tenant?.moduloProdutos == 1 || user.tenant?.moduloProdutos === true,
            assinaturas: user.tenant?.moduloAssinaturas == 1 || user.tenant?.moduloAssinaturas === true,
            pagamentoWeb: user.tenant?.moduloPagamentoWeb == 1 || user.tenant?.moduloPagamentoWeb === true,
        },
        usuario: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            tipo: tipoUsuario,
            role: user.role,
            isPlatformOwner: tipoUsuario === 'FUNCIONARIO' ? user.isPlatformOwner === true : false
        }
    };
}
}