import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CriarContaClienteDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsEmail({}, { message: 'Forneça um e-mail válido.' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
  @IsNotEmpty()
  senha: string;

  @IsString()
  @IsNotEmpty()
  telefone: string;
}