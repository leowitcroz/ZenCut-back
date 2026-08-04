import { Controller, Post, Patch, Body, HttpCode, HttpStatus, BadRequestException, ForbiddenException, Get, Param, UseGuards, UseInterceptors, UploadedFile, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantService } from './tenant.service';
import { IsPublic } from '../decorator/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';
import { TenantId } from './tenant.decorator';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService, private prisma: PrismaService) { }

  @Post('registrar-loja')
  @HttpCode(HttpStatus.CREATED)
  @IsPublic()
  async registrarLoja(@Body() body: any) {
    // Validação básica de payload
    if (!body.nomeNegocio || !body.subdomain || !body.email || !body.password) {
      throw new BadRequestException('Todos os campos (Nome, Subdomínio, E-mail e Senha) são obrigatórios.');
    }

    return this.tenantService.cadastrarLojaSaaS(body);
  }

  @IsPublic()
  @Get('info/:subdomain')
  async getTenantInfo(@Param('subdomain') subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain },
      select: {
        id: true,
        nomeNegocio: true,
        corPrimaria: true,
        corSecundaria: true,
        loginTitulo: true,
        loginDescricao: true,
        // Vitrine pública (landing page do subdomínio da loja)
        bannerUrl: true,
        descricaoLoja: true,
        endereco: true,
        instagram: true,
        whatsapp: true,
        moduloAssinaturas: true,
      }
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    // Diz ao front se esse tenant é a própria loja do dono da plataforma (ex: o
    // subdomínio "plataforma") — nesse caso não é uma barbearia cliente de verdade,
    // então não deve oferecer autocadastro de cliente final nem esse tipo de tela.
    const donoPlataforma = await this.prisma.funcionario.findFirst({
      where: { tenantId: tenant.id, isPlatformOwner: true },
      select: { id: true }
    });

    // Amostra de serviços, equipe e planos pra vitrine — só busca se não for a
    // própria loja da plataforma (evita gasto de query desnecessário).
    let servicos: { nome: string; valor: any; fotoUrl: string | null; descricao: string | null }[] = [];
    let equipe: { nome: string; fotoUrl: string | null; descricao: string | null }[] = [];
    let planos: { id: number; nome: string; valorMensal: any; ilimitado: boolean; qtdCreditos: number; servicos: { nome: string }[] }[] = [];
    if (!donoPlataforma) {
      const [servicosResult, equipeResult, planosResult] = await Promise.all([
        this.prisma.servico.findMany({
          where: { tenantId: tenant.id },
          select: { nome: true, valor: true, fotoUrl: true, descricao: true },
          orderBy: { nome: 'asc' },
          take: 12,
        }),
        this.prisma.funcionario.findMany({
          where: { tenantId: tenant.id, ativo: true, isPlatformOwner: false },
          select: { nome: true, fotoUrl: true, descricao: true },
          orderBy: { nome: 'asc' },
        }),
        this.prisma.planoAssinatura.findMany({
          where: { tenantId: tenant.id, ativo: true },
          select: { id: true, nome: true, valorMensal: true, ilimitado: true, qtdCreditos: true, servicos: { select: { nome: true } } },
          orderBy: { valorMensal: 'asc' },
        }),
      ]);
      servicos = servicosResult;
      // A conta "Admin {loja}" administra, não corta cabelo — não faz sentido
      // aparecer na vitrine da equipe.
      equipe = equipeResult.filter(f => !f.nome.trim().toLowerCase().startsWith('admin'));
      planos = planosResult;
    }

    return { ...tenant, ehPlataformaPropria: !!donoPlataforma, servicos, equipe, planos };
  }

  @IsPublic()
  @Get(':id/plano')
  async getTenantPlano(@Param('id') id: string) {
    return this.tenantService.obterPlanoPorId(id);
  }

  // Permite ao dono/admin da própria loja configurar o WhatsApp usado no botão
  // "Renovar Plano" (redireciona o recepcionista pro wa.me com esse número).
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @Patch('meu-whatsapp')
  async atualizarMeuWhatsapp(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body('whatsapp') whatsapp: string
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    return this.tenantService.atualizarWhatsapp(tenantId, whatsapp);
  }

  // Permite ao dono/admin personalizar as cores, o texto de destaque e os
  // dados da vitrine (descrição, endereço, instagram) exibidos no subdomínio
  // da própria loja.
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @Patch('minha-personalizacao')
  async atualizarMinhaPersonalizacao(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @Body() body: {
      corPrimaria?: string;
      corSecundaria?: string;
      loginTitulo?: string;
      loginDescricao?: string;
      descricaoLoja?: string;
      endereco?: string;
      instagram?: string;
    }
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    return this.tenantService.atualizarPersonalizacao(tenantId, body);
  }

  // Upload do banner da landing page pública da loja (Cloudinary).
  @UseGuards(JwtAuthGuard, TenantMatchGuard)
  @UseInterceptors(FileInterceptor('banner'))
  @Post('meu-banner')
  async atualizarMeuBanner(
    @TenantId() tenantId: string,
    @CurrentUser() usuario: any,
    @UploadedFile() banner?: Express.Multer.File,
  ) {
    if (usuario.role !== 1) {
      throw new ForbiddenException('Apenas o dono/administrador pode alterar esse dado.');
    }
    if (!banner) {
      throw new BadRequestException('Envie uma imagem para o banner.');
    }
    return this.tenantService.atualizarBanner(tenantId, banner);
  }
}