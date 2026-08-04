import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  Query, 
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { TenantId } from '../tenant/tenant.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// 👉 IMPORTS DA BLINDAGEM SAAS
import { RequireFeatures } from '../decorator/require-features.decorator';
import { SaasFeature } from '../auth/saas-features.enum';
import { SaasFeatureGuard } from '../guard/saas-feature.guard';
import { TenantMatchGuard } from '../guard/tenant-match.guard';

// Importe seus DTOs aqui
// import { CriarContaClienteDto } from './dto/criar-conta-cliente.dto';
// import { CriarClienteRapidoDto } from './dto/criar-cliente-rapido.dto';
// import { AtualizarClienteDto } from './dto/atualizar-cliente.dto';

// 👉 ADICIONAMOS O GUARD DO SAAS AQUI (Ele vai interceptar tudo e ler os decorators)
@UseGuards(JwtAuthGuard, TenantMatchGuard, SaasFeatureGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  // =========================================================================
  // 1. CRIAÇÃO DE CONTA (Pelo próprio cliente no site/app)
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Post('registro')
  async registrar(
    @TenantId() tenantId: string,
    @Body() dto: any 
  ) {
    return this.clientesService.criarContaCliente(tenantId, dto);
  }

  // =========================================================================
  // 2. CRIAÇÃO RÁPIDA (Pelo Admin/Recepcionista)
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Post('rapido')
  async criarSemCadastro(
    @TenantId() tenantId: string,
    @Body() dto: any 
  ) {
    return this.clientesService.criarSemCadastro(tenantId, dto);
  }

  // =========================================================================
  // 3. LISTAGEM COM PAGINAÇÃO E BUSCA
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Get()
  async listarTodos(
    @TenantId() tenantId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('busca') busca?: string,
  ) {
    return this.clientesService.listarTodos(tenantId, {
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
      busca,
    });
  }

  // =========================================================================
  // 4. BUSCA POR ID ESPECÍFICO
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Get(':id')
  async buscarPorId(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientesService.buscarPorId(tenantId, id);
  }

  // =========================================================================
  // 5. HISTÓRICO DE AGENDAMENTOS DO CLIENTE
  // 👉 BLINDADO: Só passa se a barbearia tiver o módulo AGENDAMENTO ativo!
  // =========================================================================
  @Get(':id/agendamentos')
  @RequireFeatures(SaasFeature.AGENDAMENTO) // <-- A MÁGICA ACONTECE AQUI
  async listarAgendamentosDoCliente(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientesService.listarAgendamentosDoCliente(tenantId, id);
  }

  // =========================================================================
  // 6. ATUALIZAR DADOS DO CLIENTE
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Patch(':id')
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any 
  ) {
    return this.clientesService.atualizar(tenantId, id, dto);
  }

  // =========================================================================
  // 7. DELETAR CLIENTE
  // (Módulo Base - Sem restrição de Feature)
  // =========================================================================
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) 
  async deletar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.clientesService.deletar(tenantId, id);
  }
}