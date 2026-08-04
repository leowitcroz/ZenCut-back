import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Retorna exatamente a variável que nós injetamos lá no Middleware
    return request.tenantId; 
  },
);