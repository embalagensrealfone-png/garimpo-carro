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
- **Rodada vazia:** se nada mudou, o `juntar` não altera nenhum arquivo.

Depois, preview local (`python3 -m http.server 5420 --directory site`), commit e push em `main`.

## Como o robô decide

- **Mesmo carro**: mesmo estado, ano ±1, km até 300 de diferença e preço até 6%. Para km redonda
  (múltiplo de 500), o preço precisa estar a até 2%, ou a km e a cidade precisam ser idênticas.
- **Carro novo**: o site com mais detalhes cria o carro. A ordem é Webmotors, UsadosBR, Só Carrão,
  Mobiauto, OLX. Os outros sites viram links desse carro.
- **Saiu**: o carro fica sem nenhum anúncio no ar. Ele some da lista e aparece em "Saíram do ar" no
  Minas por 30 dias. Carro de Facebook ou Instagram nunca sai sozinho, porque esses sites não são
  conferidos.
- **Preço**: o preço do carro só muda quando um anúncio dele mudou nesta rodada. O preço antigo vai
  para `hist`, e o cartão no site mostra o selo "Baixou R$ X".
- A coleta aplicada vai para `dados/minas/coleta/feito-AAAA-MM-DD/`. Assim, rodar o `juntar` de novo
  não aplica a mesma coleta duas vezes.
