# API pública (`/api/v1`)

Disponível nos planos com `apiAccess` (Profissional e Premium). Crie a chave em **Integrações →
Chaves de API**; ela é exibida uma única vez (o servidor guarda apenas o SHA-256).

Autenticação: `Authorization: Bearer gv_...` · Limite: 120 requisições/minuto por chave.

## POST /api/v1/visits

Registra uma visita/compra. O GravitaSolves atualiza métricas, reclassifica o cliente e, se ele recebeu
uma campanha dentro da janela de atribuição, registra a recuperação com a receita informada.

```json
{
  "customer": { "phone": "+5511987654321" },
  "date": "2026-11-10",
  "amount": 80.0,
  "description": "Corte + barba"
}
```

`customer` aceita `phone`, `email` ou `external_id`. Resposta `201`:

```json
{ "ok": true, "customer_id": "…", "visit_id": "…", "attributed_to_campaign": "…|null" }
```

Erros: `400` corpo/data inválidos (datas futuras são recusadas), `401` chave inválida, `403` plano
sem API, `404` cliente não encontrado, `429` limite excedido.

## POST /api/v1/customers

Cria ou atualiza até 500 clientes por chamada, com as mesmas regras da importação de planilhas
(normalização, deduplicação por telefone → e-mail → external_id, limite do plano).

```json
{
  "customers": [{
    "name": "Ana Lima", "phone": "(21) 99999-0000", "email": "ana@exemplo.com", "external_id": "123",
    "last_visit": "2026-10-01", "first_visit": "2025-01-10", "visit_count": 12,
    "total_spent": 960.0, "favorite_service": "Escova", "preferred_staff": "Juliana",
    "consent_whatsapp": true
  }]
}
```

Consentimento só deve ser enviado como `true` quando o cliente realmente autorizou; `false` revoga.

Resposta: `{ ok, created, updated, skipped, returns_detected, errors: [{ index, message }] }`.

## Webhooks recebidos

| Rota | Origem | Segurança |
|---|---|---|
| `GET/POST /api/webhooks/whatsapp` | Meta (status, mensagens) | `hub.verify_token` + HMAC SHA-256 (`WHATSAPP_APP_SECRET`) |
| `POST /api/webhooks/twilio?org=ID` | Twilio (status, SMS recebidos) | `X-Twilio-Signature` com o Auth Token da empresa |
| `GET /api/cron/daily` | Agendador | `Authorization: Bearer CRON_SECRET` |
