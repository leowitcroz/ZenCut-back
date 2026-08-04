import { IsOptional, IsInt, IsArray, IsEnum, IsBoolean, IsString } from 'class-validator';
import { FormaPagamento } from '@prisma/client';

export class EditarAgendamentoDto {
    @IsOptional()
    @IsInt()
    clienteId?: number;

    @IsOptional()
    @IsInt()
    funcionarioId?: number;

    @IsOptional()
    @IsInt()
    horarioId?: number;

    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    servicoIds?: number[];

    @IsOptional()
    @IsEnum(FormaPagamento)
    formaPagamento?: FormaPagamento;

    @IsOptional()
    @IsBoolean()
    cupomAplicado?: boolean;

    // 👇 Campo adicionado para permitir a conclusão
    @IsOptional()
    @IsString()
    status?: string; 
}