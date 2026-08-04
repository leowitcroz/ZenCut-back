import { PlanoSaaS } from '@prisma/client';

// Regra de negócio: quais módulos cada plano libera.
// ENTERPRISE é legado — tratado igual ao PRO (acesso total).
export const MODULOS_POR_PLANO: Record<PlanoSaaS, {
  moduloFinanceiro: boolean;
  moduloAgendamento: boolean;
  moduloProdutos: boolean;
  moduloVendas: boolean;
  moduloAssinaturas: boolean;
}> = {
  BASICO: { moduloFinanceiro: true, moduloAgendamento: false, moduloProdutos: false, moduloVendas: false, moduloAssinaturas: false },
  INTERMEDIARIO_VENDAS: { moduloFinanceiro: true, moduloAgendamento: false, moduloProdutos: true, moduloVendas: true, moduloAssinaturas: false },
  INTERMEDIARIO_AGENDA: { moduloFinanceiro: true, moduloAgendamento: true, moduloProdutos: false, moduloVendas: false, moduloAssinaturas: true },
  PRO: { moduloFinanceiro: true, moduloAgendamento: true, moduloProdutos: true, moduloVendas: true, moduloAssinaturas: true },
  ENTERPRISE: { moduloFinanceiro: true, moduloAgendamento: true, moduloProdutos: true, moduloVendas: true, moduloAssinaturas: true },
};

// Valores usados só na primeira vez que a tabela PlanoPreco é criada (o ADM edita depois pela tela)
export const NOME_PADRAO_PLANO: Record<PlanoSaaS, string> = {
  BASICO: 'Básico',
  INTERMEDIARIO_VENDAS: 'Intermediário (Vendas)',
  INTERMEDIARIO_AGENDA: 'Intermediário (Agenda)',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

export const VALOR_PADRAO_PLANO: Record<PlanoSaaS, number> = {
  BASICO: 97.0,
  INTERMEDIARIO_VENDAS: 147.0,
  INTERMEDIARIO_AGENDA: 147.0,
  PRO: 197.0,
  ENTERPRISE: 197.0,
};
