// Script de bootstrap: marca um funcionário existente como DONO DA PLATAFORMA EasyCut.
// Rode uma vez pra liberar o primeiro acesso à Central de Lojas (rotas /adm/*).
//
// Uso: npm run set-platform-owner -- seu-email@exemplo.com
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Uso: npm run set-platform-owner -- seu-email@exemplo.com');
    process.exit(1);
  }

  const funcionarios = await prisma.funcionario.findMany({
    where: { email },
    select: { id: true, nome: true, email: true, tenantId: true, isPlatformOwner: true }
  });

  if (funcionarios.length === 0) {
    console.error(`Nenhum funcionário encontrado com o e-mail "${email}".`);
    process.exit(1);
  }

  if (funcionarios.length > 1) {
    console.error(`Esse e-mail existe em mais de uma loja (tenants: ${funcionarios.map(f => f.tenantId).join(', ')}). Edite o script pra filtrar pelo tenantId certo antes de continuar.`);
    process.exit(1);
  }

  const alvo = funcionarios[0];

  await prisma.funcionario.update({
    where: { id: alvo.id },
    data: { isPlatformOwner: true }
  });

  console.log(`Pronto! "${alvo.nome}" (${alvo.email}) agora é dono da plataforma EasyCut.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
