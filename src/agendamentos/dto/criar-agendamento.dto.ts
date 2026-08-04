import { IsNumber, IsString, IsOptional, IsArray, IsEnum, IsBoolean } from 'class-validator';
import { FormaPagamento } from '@prisma/client';

export class CriarAgendamentoDto {
  @IsNumber()
  @IsOptional()
  clienteId?: number;

  @IsString()
  @IsOptional()
  nomeClienteAvulso?: string;

  @IsNumber()
  funcionarioId: number;

  @IsNumber()
  horarioId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  servicoIds: number[];

  @IsEnum(FormaPagamento)
  formaPagamento: FormaPagamento;

  @IsBoolean()
  @IsOptional()
  cupomAplicado?: boolean;
}