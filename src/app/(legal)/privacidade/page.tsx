export const metadata = { title: "Política de privacidade" };

export default function Privacy() {
  return (
    <>
      <h1>Política de privacidade</h1>
      <h2>Papéis no tratamento</h2>
      <p>Para os dados dos clientes finais importados na plataforma, o <b>estabelecimento assinante é o controlador</b> e o GravitaSolves atua como <b>operador</b>, tratando os dados apenas conforme as instruções do estabelecimento e para as finalidades da plataforma (análise de recorrência e comunicação de reativação autorizada). Para os dados de cadastro dos usuários da plataforma, o GravitaSolves é controlador.</p>
      <h2>Dados tratados</h2>
      <ul>
        <li>Usuários: nome, e-mail, senha (armazenada apenas como hash scrypt), registros de acesso.</li>
        <li>Clientes finais: nome, telefone, e-mail, histórico de visitas/compras, preferências, registros de consentimento, mensagens enviadas e recebidas.</li>
      </ul>
      <h2>Bases legais</h2>
      <p>Mensagens de WhatsApp e SMS exigem consentimento do cliente final. E-mails podem, se o estabelecimento habilitar, usar legítimo interesse para clientes com relação comercial prévia, sempre com descadastro simples. Cada autorização é registrada com data, origem e responsável.</p>
      <h2>Inteligência artificial</h2>
      <p>Quando a IA está ativa, o provedor de IA recebe apenas dados minimizados (nome abreviado e métricas agregadas). Telefones e e-mails não são enviados. Os dados não são usados para treinar modelos nem para outras finalidades.</p>
      <h2>Direitos do titular</h2>
      <p>O estabelecimento pode, pela plataforma, exportar os dados de um titular, corrigi-los, revogar consentimentos e eliminá-los. O cliente final pode se descadastrar a qualquer momento pelo link do e-mail ou respondendo “SAIR”.</p>
      <h2>Retenção e segurança</h2>
      <p>Dados de clientes sem atividade são eliminados automaticamente após o prazo de retenção configurado pelo estabelecimento. Dados são isolados por empresa (inclusive no banco, via Row Level Security), transmitidos com TLS, e credenciais de integração são cifradas com AES-256-GCM. Ações relevantes ficam em trilha de auditoria sem dados pessoais.</p>
      <h2>Contato do encarregado (DPO)</h2>
      <p>[preencher: nome e e-mail do encarregado]</p>
    </>
  );
}
