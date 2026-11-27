# Atualizar Minas — passo a passo

Quando o Carlos pedir **"atualizar minas"**, a sessão do Garimpo Carro faz isto, no Mac dele.
O resultado vira o que o botão **Minas** do site mostra ao visitante (1x por dia por pessoa).

## 1. Sites que o robô lê sozinho (~5 min)

```bash
python3 ferramentas/minas.py coletar
```

UsadosBR, Só Carrão e Mobiauto vão por pedido simples. A OLX abre num Chrome sem janela, com perfil
próprio. O Mercado Livre não deixa ler a busca, então o robô só confere, um por um, os anúncios que já
temos. Site que falhar ou vier vazio fica de fora da rodada: é melhor isso que marcar tudo como vendido.

## 2. Webmotors (pelo Chrome do Carlos)

O Webmotors mostra captcha para robô. **Não contornar.** A leitura é feita na aba normal do Chrome
dele, pela extensão Claude in Chrome.

1. Abrir a busca do Brasil todo:
   `https://www.webmotors.com.br/carros/estoque/mercedes-benz/c-300/20-eq-boost-hibrido-amg-line-9g-tronic?tipoveiculo=carros&marca1=mercedes-benz&modelo1=c-300&versao1=20-eq-boost-hibrido-amg-line-9g-tronic&page=1`
   Se o site puser a cidade dele (Içara) no filtro, tirar o filtro de localização na tela.
2. Colar o conteúdo de `ferramentas/minas/webmotors.js` na aba (javascript_tool).
3. Rodar `await minas.coletar()`. Leva uns 60 s e lê todas as páginas.
4. Rodar `python3 ferramentas/minas.py conhecidos`, colar a saída na aba e depois rodar `minas.comparar()`.
5. Rodar `await minas.detalhes()`. Leva cerca de 3 s por carro novo. Se a extensão der timeout, o
   processo continua na página: chamar de novo até vir "N de N".
6. Ler `minas.fatia(0)`, `minas.fatia(1)`… até vir vazio, juntar tudo num arquivo de texto e rodar
   `python3 ferramentas/minas.py webmotors <arquivo>`.

## 2b. Facebook Marketplace (pelo Chrome do Carlos, ~8 min)

O Facebook não tem busca que o robô leia. Aqui conferimos, um por um, os anúncios do Facebook que já
estão na lista: se ainda está no ar, o preço e a km (para pegar anúncio ligado ao carro errado).

1. Abrir `https://www.facebook.com/marketplace/` no Chrome dele (conta logada).
2. Colar `ferramentas/minas/facebook.js` e a saída de `python3 ferramentas/minas.py facebook` na aba.
3. Rodar `fbminas.conferir()`. Roda sozinho na página (abre cada anúncio numa janela "fbler").
   Chamar `fbminas.andamento()` até vir "N de N · pronto".
4. Ler `fbminas.fatia(0)`, `fbminas.fatia(1)`… até vir vazio, juntar num arquivo de texto e rodar
   `python3 ferramentas/minas.py facebook <arquivo>`. Se mais de 30% não for lido (login caiu), nada
   é gravado.

Dá para rodar o Facebook e o Webmotors ao mesmo tempo, cada um na sua aba.

## 3. Juntar, conferir, publicar

```bash
python3 ferramentas/minas.py juntar
```

```bash
python3 ferramentas/gerar.py
```

O `juntar` diz quantos carros são novos, quantos baixaram ou subiram de preço e quantos saíram. Antes
de publicar, conferir:

- **Carro que saiu:** abrir o link para confirmar que o anúncio caiu mesmo.
- **Carros novos:** ver se estão com capa, cor e cidade, e se nenhum duplicou um carro que já existia
  (mesmo estado, km e preço).
- **Repetidos:** `python3 ferramentas/minas.py repetidos` mostra carros da lista que parecem o mesmo
  (mesma regra do reanúncio). Com `--juntar`, o mais antigo fica com os anúncios do outro.
- **SEPARADO / CONFERIR / km mudou** (linhas do `juntar`): leia cada uma.
  - **SEPARADO:** o anúncio tem km mais de 1.000 diferente do carro em que estava ligado. O robô tirou o
    anúncio desse carro e tratou como outro. Se virou carro novo sem capa (Facebook), tirar print da foto
    principal no Chrome e salvar em `dados/capas-originais/<id>.jpg` (400×300).
  - **CONFERIR:** a diferença é de 700 a 1.000 km. Abra os dois anúncios e compare foto e cor.
  - **km mudou:** o carro só tinha esse anúncio, e a km dele foi atualizada.
- **Rodada vazia:** se nada mudou, o `juntar` não altera nenhum arquivo.

Depois, preview local (`python3 -m http.server 5420 --directory site`), commit e push em `main`.

## 4. Avisos do alerta no WhatsApp

Quem clica em **Quero o alerta** na lista manda para o WhatsApp do Garimpo (48 99174-0811) uma mensagem
com a peneira e um "código do alerta". Para cadastrar, cole a mensagem inteira:

```bash
python3 ferramentas/alertas.py novo 48999999999 "Nome da pessoa" "<mensagem colada>"
```

Depois de publicar o Minas:

```bash
python3 ferramentas/alertas.py avisos
```

Abre uma página com a mensagem pronta de cada pessoa que teve carro novo ou baixa de preço na peneira
dela. **Quem envia é o Carlos**, clicando em "Enviar no WhatsApp" em cada uma. Quem responder SAIR:
`python3 ferramentas/alertas.py tirar <telefone>`. Lista: `python3 ferramentas/alertas.py lista`.

Os telefones ficam em `dados/privado/`, fora do git (o repositório é público).

## Como o robô decide

- **Anúncio no carro errado**: a cada rodada a km de cada anúncio (OLX, UsadosBR, Só Carrão, Mobiauto,
  Webmotors e Facebook) é comparada com a do carro em que está ligado. Mais de 1.000 km de diferença =
  outro carro: o anúncio é separado (se o carro tem outros anúncios) e passa pelas regras abaixo como
  anúncio novo. Já aconteceu: uma C 300 cinza fosca de Curitiba ficou escondida dentro de uma branca.
- **Link que o Carlos mandar**: abrir o anúncio e comparar km, cor e foto com o carro antes de dizer que
  "já está na lista". Preço e cidade parecidos não bastam.
- **Mesmo carro**: mesmo estado, ano ±1, km até 300 de diferença e preço até 6%. Para km redonda
  (múltiplo de 500), o preço precisa estar a até 2%, ou a km e a cidade precisam ser idênticas.
- **Reanúncio**: quando os números não batem (o vendedor tirou o anúncio e pôs de novo, às vezes bem
  mais barato), o robô compara a foto de capa com a dos carros do mesmo estado, ano ±1, km até 1.500
  de diferença, preço até 25% e cor compatível. Se a foto for a mesma, junta ao carro antigo, e o preço
  novo entra como "baixou" ou "subiu". Só a foto não basta: tem loja que usa a mesma foto em carros
  diferentes.
- **Carro novo**: o site com mais detalhes cria o carro. A ordem é Webmotors, UsadosBR, Só Carrão,
  Mobiauto, OLX, Mercado Livre, Facebook. Os outros sites viram links desse carro.
- **Saiu**: o carro fica sem nenhum anúncio no ar. Ele some da lista e aparece em "Saíram do ar" no
  Minas por 30 dias. Anúncio do Facebook sai quando o próprio Facebook diz que ele não está mais
  disponível; anúncio que não abriu fica como estava. Instagram não é conferido.
- **Preço**: o preço do carro só muda quando um anúncio dele mudou nesta rodada. O preço antigo vai
  para `hist`, e o cartão no site mostra o selo "Baixou R$ X".
- A coleta aplicada vai para `dados/minas/coleta/feito-AAAA-MM-DD/`. Assim, rodar o `juntar` de novo
  não aplica a mesma coleta duas vezes.
