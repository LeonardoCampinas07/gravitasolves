# Vídeo épico GravitaSolves: narração para o ElevenLabs

**Duração:** cerca de 1min45 a 1min55. A pré-visualização com voz provisória está em `video/gravitasolves-epico-previa.mp4`.

## Configuração no ElevenLabs
- **Voz:** Fernando Borges (ou outra masculina grave e confiante)
- **Modelo:** Eleven Multilingual v2
- **Stability:** 40% · **Similarity:** 75% · **Style:** 25% · **Speaker boost:** ligado · **Speed:** 1.0
- Gere **tudo em um único áudio** e cole o texto abaixo exatamente como está, sem os títulos e com as linhas em branco.
- A tag `<break time="2.0s" />` é a pausa dramática depois do nome da marca. Mantenha a tag no texto.
- Salve como: `C:\projetos\gravita\video\narracao\narracao-epico.mp3`

## Texto (copie daqui)

```
Lembra daquele cliente que vinha todo mês? Sentava na cadeira, pedia o de sempre… e um dia, simplesmente parou de vir.

Ele não reclamou. Não avisou. Só sumiu. E levou junto um dinheiro que já era seu. Agora multiplica isso por dezenas de clientes.

Chega de perder quem já te escolheu. A sua solução chegou: GravitaSolves. <break time="2.0s" />

Em segundos, você enxerga a sua base inteira: quem está em risco, quem já sumiu… e quanto dinheiro está parado esperando por você.

E ele não te entrega só uma lista. Mostra quem tem mais chance de voltar, para você começar por onde dá resultado.

Quer saber mais? É só perguntar. O agente responde em português, com os seus números, na hora.

Peça uma campanha, e ela fica pronta: uma mensagem para cada cliente, com o nome, o serviço e o profissional dele.

Tudo dentro da LGPD. Só recebe quem autorizou, e nada é enviado sem a sua aprovação.

O cliente responde, marca pelo seu link, e o horário cai direto na sua agenda.

E no fim do mês, você vê quem voltou, quanto faturou, e qual campanha funcionou melhor.

Não precisa acreditar só na gente. Entre na simulação, com uma barbearia de exemplo e todas as funções liberadas. Sem cadastro.

GravitaSolves. Traga de volta quem já conhece o seu negócio. Crie sua conta hoje.
```

## Dicas de interpretação
- **Abertura (1º e 2º parágrafos):** fale mais devagar e mais baixo, em tom de lembrança. Faça uma pausa curta antes de "parou de vir" e antes de "Só sumiu".
- **"A sua solução chegou: GravitaSolves":** suba a energia. Esse é o impacto da trilha.
- **Do painel em diante:** ritmo firme e confiante.
- **Fechamento:** "GravitaSolves", uma pausa, e o resto da frase com um sorriso na voz.
- Se ele pronunciar "GravitaSolves" errado, troque no texto por **Gravita Sólvs**. A legenda continua certa, porque vem do roteiro.

## Gerar o vídeo final
Dentro de `C:\projetos\gravita\video\editor`, rode:

```
node scripts/final-epico.mjs
```

O script alinha a voz ao roteiro, ajusta a trilha ao tempo da sua narração e gera `video/gravitasolves-epico-final.mp4`.
