# Pagamentos da assinatura (Asaas)

Como o GravitaSolves cobra a mensalidade dos estabelecimentos. Pix, boleto e cartão; o dinheiro cai na sua conta Asaas.

## Como funciona

1. **Sem `ASAAS_API_KEY`** → a cobrança fica desligada e tudo continua liberado, como hoje.
2. **Empresas novas** ganham um teste grátis de `BILLING_TRIAL_DAYS` dias (padrão 7), contados a partir do primeiro acesso depois que a cobrança for ligada. Empresas que já existem também começam esse teste nesse momento.
3. Em **Configurações → Assinatura**, o dono escolhe o plano e informa CPF/CNPJ. O GravitaSolves cria a assinatura mensal no Asaas e mostra o link da fatura.
4. O plano **só é ativado quando o Asaas avisa (webhook) que o pagamento foi confirmado**. Antes de ativar, o servidor consulta a cobrança de novo na API do Asaas e confere status, valor e de qual empresa ela é. O que o navegador diz nunca ativa nada.
5. **Atraso**: depois do vencimento há `BILLING_GRACE_DAYS` dias de tolerância (padrão 3). Passado esse prazo, ficam pausados IA, envios, importações e automações. **Consultar e exportar os dados continua liberado (LGPD).**
6. **Cancelamento**: a renovação para, e o acesso continua até o fim do período já pago.
7. **Troca de plano**: o novo valor vale a partir da próxima fatura, e o plano muda quando ela for paga. Não há cobrança proporcional.

Os preços vêm sempre da tabela `plans` no servidor. Nada nesta integração altera preços.

## Configurar (comece pelo sandbox)

1. Crie uma conta em https://sandbox.asaas.com (ambiente de teste, sem dinheiro real).
2. Em **Integrações → Chave de API**, gere a chave e coloque no `.env.local`:
   ```
   ASAAS_API_KEY=\$aact_hmlg_...   # a chave começa com $: coloque uma barra \ antes dele, senão o Next apaga o valor
   ASAAS_ENV=sandbox
   ASAAS_WEBHOOK_TOKEN=<um texto aleatório longo que você inventa>
   ```
3. Em **Integrações → Webhooks**, crie um webhook:
   - URL: `<APP_URL>/api/webhooks/asaas`. Precisa ser um endereço público; em desenvolvimento, use um túnel como ngrok ou cloudflared.
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
   - Eventos: cobranças (`PAYMENT_*`) e assinaturas (`SUBSCRIPTION_DELETED`).
4. Reinicie o servidor, assine um plano em Configurações e pague a fatura no sandbox (o painel do sandbox tem um botão para simular o pagamento). O plano deve mudar em alguns segundos.
5. Só depois disso troque para produção: `ASAAS_ENV=production` e a chave de produção. A conta de produção precisa estar aprovada pelo Asaas.

## Tabelas (migração 0004, não destrutiva)

- `subscriptions`: uma linha por empresa, com status, plano, fim do teste, fim do período pago e ids no Asaas.
- `billing_payments`: espelho das faturas, só para exibição.
- `billing_events`: eventos de webhook já processados (garante que cada um seja processado uma vez só). Guarda apenas id, status e valor, sem dados pessoais do pagador.

## Limitações conhecidas

- Não foi testado contra o Asaas de verdade neste ambiente. Os testes automatizados (`tests/billing.test.ts`) simulam a API. Faça o passo 4 acima antes de cobrar clientes reais.
- Sem cobrança proporcional na troca de plano.
- Nota fiscal de serviço não é emitida automaticamente (o Asaas oferece isso como recurso separado).
