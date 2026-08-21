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
    let user: any = null;
    let tipoUsuario = 'FUNCIONARIO';
    let subdominioDetectado = '';

    if (tenantId) {
        // Login feito de dentro do subdomínio de uma loja específica — restringe
        // a busca a ELA. Isso é o que permite o mesmo e-mail existir em lojas
        // diferentes sem ambiguidade nenhuma (cada loja é isolada das outras).
        user = await this.prisma.funcionario.findFirst({
            where: { email, tenantId },
            include: { tenant: true },
        });

        if (!user) {
            tipoUsuario = 'CLIENTE';
            user = await this.prisma.cliente.findFirst({
                where: { email, tenantId },
                include: { tenant: true },
            });
        }
    } else {
        // Login pelo domínio principal, sem saber o subdomínio da própria loja.
        // Como o mesmo e-mail pode existir em lojas diferentes, uma busca sem
        // filtro de tenant é ambígua — só é seguro resolver sozinho quando o
        // e-mail é único na plataforma inteira. Achando mais de uma conta,
        // NÃO dá pra escolher uma "de graça" (antes pegava a primeira que o
        // banco retornasse, o que podia logar a pessoa na loja errada por
        // engano); melhor pedir pra ela entrar pelo endereço da própria loja.
        const [funcionarios, clientes] = await Promise.all([
            this.prisma.funcionario.findMany({ where: { email }, include: { tenant: true } }),
            this.prisma.cliente.findMany({ where: { email }, include: { tenant: true } }),
        ]);

        if (funcionarios.length + clientes.length > 1) {
            throw new UnauthorizedException('Encontramos mais de uma conta com este e-mail em lojas diferentes. Acesse pelo endereço da sua loja (ex: sualoja.zencut.com.br) para entrar.');
        }

        if (funcionarios.length === 1) {
            user = funcionarios[0];
        } else if (clientes.length === 1) {
            user = clientes[0];
            tipoUsuario = 'CLIENTE';
        }
    }

    if (user && user.tenant) {
        subdominioDetectado = user.tenant.subdomain;
    }

    // Funcionario guarda o hash em 'password'; Cliente guarda em 'senha' —
    // sem essa distinção, TODO login de cliente falhava aqui (user.password
    // sempre undefined pra um Cliente, mesmo com a senha certa).
    const senhaHash = tipoUsuario === 'FUNCIONARIO' ? user?.password : user?.senha;

    if (!user || !senhaHash) {
        throw new UnauthorizedException('Email e/ou senha incorretos.');
    }

    if (tipoUsuario === 'FUNCIONARIO' && !user.ativo) {
        throw new UnauthorizedException('Sua conta de funcionário está desativada.');
    }

    const senhaCorreta = await bcrypt.compare(senhaDigitada, senhaHash);
    if (!senhaCorreta) {
        throw new UnauthorizedException('Email e/ou senha incorretos.');
    }

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