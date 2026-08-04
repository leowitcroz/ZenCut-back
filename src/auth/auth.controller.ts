import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  BadRequestException 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TenantId } from '../tenant/tenant.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // =========================================================================
  // 1. LOGIN (Unificado: Cliente ou Funcionário)
  // =========================================================================
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @TenantId() tenantId: string,
    @Body() body: any // { email, senha }
  ) {
    if (!body.email || !body.senha) {
      throw new BadRequestException('E-mail e senha são obrigatórios.');
    }
    return this.authService.login(tenantId, body.email, body.senha);
  }

  // =========================================================================
  // 2. REGISTRO (Cria conta e já retorna o Token de acesso)
  // =========================================================================
  @Post('register')
  async register(
    @TenantId() tenantId: string,
    @Body() body: any // DTO de criação de cliente
  ) {
    return this.authService.register(tenantId, body);
  }

  // =========================================================================
  // 3. CHECK TOKEN (Valida se o token é real e se o usuário ainda existe)
  // Útil para o "Auto-Login" do Frontend
  // =========================================================================
  @Post('check-token')
  @HttpCode(HttpStatus.OK)
  async checkToken(@Body('token') token: string) {
    if (!token) {
      throw new BadRequestException('Token não fornecido.');
    }
    
    const result = await this.authService.checkTokenExist(token);
    
    if (!result) {
      throw new BadRequestException('Token inválido ou usuário inexistente.');
    }

    return result;
  }

  // =========================================================================
  // 4. IS VALID (Apenas valida a assinatura do token, sem bater no banco)
  // Mais rápido, usado para checagens simples de expiração
  // =========================================================================
  @Post('is-valid')
  @HttpCode(HttpStatus.OK)
  async isValid(@Body('token') token: string) {
    const valid = this.authService.isValidToken(token);
    return { valid };
  }
}