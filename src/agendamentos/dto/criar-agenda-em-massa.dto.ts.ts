import { 
  IsArray, 
  IsInt, 
  IsNotEmpty, 
  IsString, 
  Matches, 
  ValidateNested, 
  ArrayMinSize 
} from 'class-validator';
import { Type } from 'class-transformer';

export class HorarioDiaDto {
  @IsString()
  @IsNotEmpty()
  // Espera uma string de data, preferencialmente no formato YYYY-MM-DD
  data: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Forneça pelo menos um horário para este dia.' })
  @IsString({ each: true })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    each: true,
    message: 'Cada hora deve estar no formato HH:MM (ex: 09:00, 14:30)',
  })
  horas: string[];
}

export class AgendaFuncionarioDto {
  @IsInt()
  @IsNotEmpty()
  funcionarioId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'A agenda do funcionário não pode estar vazia.' })
  @ValidateNested({ each: true })
  @Type(() => HorarioDiaDto)
  horarios: HorarioDiaDto[];
}

export class CriarAgendaEmMassaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Envie pelo menos uma agenda para processar.' })
  @ValidateNested({ each: true })
  @Type(() => AgendaFuncionarioDto)
  agendas: AgendaFuncionarioDto[];
}