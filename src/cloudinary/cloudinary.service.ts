import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  uploadImagem(buffer: Buffer, pasta: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: pasta, resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(this.traduzirErro(error));
          resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    });
  }

  // Sem isso, qualquer falha do Cloudinary (imagem grande demais, formato
  // inválido, etc.) virava um 500 genérico "Internal server error" pro
  // usuário, sem explicar o que de fato deu errado.
  private traduzirErro(error: any): Error {
    const mensagem: string = error?.message || '';
    if (mensagem.includes('File size too large')) {
      return new BadRequestException('Imagem muito grande. O tamanho máximo permitido é 10MB — tente comprimir ou escolher outra foto.');
    }
    if (mensagem.includes('Invalid image file') || mensagem.includes('unsupported')) {
      return new BadRequestException('Não foi possível ler esse arquivo como imagem. Tente outro formato (JPG, PNG ou WEBP).');
    }
    return new BadGatewayException('Não foi possível enviar a imagem agora. Tente novamente em instantes.');
  }
}
