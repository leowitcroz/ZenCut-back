import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServicosService } from './servicos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantId } from '../tenant/tenant.decorator';
import { TenantMatchGuard } from '../guard/tenant-match.guard';

@UseGuards(JwtAuthGuard, TenantMatchGuard) // Protege todas as rotas deste arquivo
@Controller('servicos')
export class ServicosController {
  constructor(private readonly servicosService: ServicosService) {}

  @Post()
  @UseInterceptors(FileInterceptor('foto'))
  async criar(
    @TenantId() tenantId: string,
    @Body() dados: { nome: string; valor: number; descricao?: string },
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    return this.servicosService.criar(tenantId, dados, foto);
  }

  @Get()
  async listarTodos(@TenantId() tenantId: string) {
    return this.servicosService.listarTodos(tenantId);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('foto'))
  async atualizar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dados: { nome?: string; valor?: number; descricao?: string },
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    return this.servicosService.atualizar(tenantId, id, dados, foto);
  }

  @Delete(':id')
  async deletar(
    @TenantId() tenantId: string,
    @Param('id', ParseIntPipe) id: number
  ) {
    return this.servicosService.deletar(tenantId, id);
  }
}
