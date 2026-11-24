---
name: Garimpo Carro
description: O garimpo feito por cima dos classificados — cada carro com laudo contra a FIPE.
colors:
  ouro: "#F2B705"
  ouro-fundo: "#F7CF3D"
  tinta: "#17140F"
  tinta-2: "#4A4236"
  cal: "#EFEEE9"
  papel: "#FFFFFF"
  risco: "#B3261E"
  abaixo: "#17643A"
  linha: "#D9D6CC"
typography:
  letreiro:
    fontFamily: "'Alfa Slab One', Rockwell, serif"
    fontSize: "clamp(2rem, 5.4vw, 4.25rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  rotulo:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.04em"
  numero:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "1.9rem"
    fontWeight: 700
    lineHeight: 1
  corpo:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  placa: "3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "28px"
  xl: "56px"
components:
  botao-anuncio:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.ouro}"
    rounded: "{rounded.placa}"
    padding: "9px 14px"
  chip-risco:
    backgroundColor: "{colors.risco}"
    textColor: "{colors.papel}"
    rounded: "{rounded.placa}"
  selo-abaixo:
    textColor: "{colors.abaixo}"
---

# Garimpo Carro — sistema visual

## Overview
O mundo é a **casa de compra de ouro de cidade de garimpo**: placa pintada à mão, amarelo-ouro
chapado, letra slab preta com sombra de pincel, e o **laudo de teor** que o comprador de ouro
carimba. Traduzido: os filtros são a **peneira**, cada carro é uma linha do **livro de compra**
com um **carimbo** dizendo quanto está abaixo/acima da FIPE.
Cena física: comprador olhando no celular, de dia ou à noite em casa — fundo claro, contraste alto.

## Logo
Escolhida em 23/11/2026 (opção P3): **picareta amarela num quadrado preto de cantos arredondados**
(`marca/simbolo-escuro.svg`; versão invertida em `marca/simbolo-amarelo.svg`), ao lado da palavra
**GARIMPO** (Barlow Condensed 800) com **CARRO** embaixo (500, espaçado 0,36em). O símbolo sozinho é
o ícone do site e do app. Opções descartadas ficam em `marca/opcoes-*.png`.

## Colors
Estratégia **Committed**: o ouro domina regiões inteiras (cabeçalho, abertura), nunca vira
detalhe espalhado. O resto é cal (parede caiada) e papel.
- Vermelho `risco` só para leilão e preço suspeito. Verde `abaixo` só para "abaixo da FIPE".
- Texto secundário é `tinta-2`, nunca cinza puro.

## Typography
- **Alfa Slab One** = letreiro. Só títulos (a logo usa Barlow Condensed), com realce branco de pincel (`3px 3px 0` branco 60%) sobre o ouro. A segunda linha do letreiro vai em branco com contorno e sombra em tinta — a segunda cor de toda placa "Compro Ouro".
- **Barlow Condensed 700** = números (preço, km, %) e rótulos, com algarismos tabulares.
- **Barlow** = texto corrido.

## Layout
Desktop: peneira fixa à esquerda (270px), livro de compra à direita. Celular: a peneira vira
uma gaveta que sobe de baixo; uma barra preta fixa mostra o contador "186 → N".

## Elevation & Depth
Sem sombra borrada. Toda profundidade é offset duro, sem blur: realce de pincel no letreiro, e
o papel das **pepitas** pregado na placa (`6px 6px 0` tinta, girado -0,6°). A placa tem filete
pintado (borda 3px tinta, inset 10px) — é o que a separa de uma faixa de cor.

## Shapes
Cantos de placa: 3px. O carimbo é um retângulo com borda dupla, girado -2°.

## Components
- **Linha do livro**: foto pequena (4:3) | carro + local + alertas | preço + carimbo FIPE + botões.
- **Carimbo de mercado** (desde 23/11/2026, no lugar do carimbo FIPE): compara com os iguais —
  mesmo ano, reta preço × km medida nos anúncios limpos (`ferramentas/gerar.py`).
  "X% ABAIXO DO MERCADO" (verde, abaixo de 1 variação), "PREÇO NORMAL PARA A KM" (tinta),
  "X% ACIMA DO MERCADO" (tinta-2), "X% ABAIXO · DESCONFIE" (risco, abaixo de 2 variações),
  "BLINDADO · SEM COMPARAÇÃO". Linha pequena: esperado para a km e a FIPE de referência.
  Entra carimbando uma vez. Também aparece nas pepitas, em tamanho compacto.
- **Botão de anúncio**: placa preta com letra ouro, um por site; reposts no mesmo site viram
  chips numerados (2, 3) em papel.

## Do's and Don'ts
- Faça: risco antes da qualidade — o chip de leilão vem primeiro na linha.
- Faça: todo número com fonte (código FIPE e mês no rodapé e no carimbo).
- Não faça: galeria de fotos (decisão de direito de imagem — uma capa só).
- Não faça: dourado metálico, preto-luxo, brilho. O ouro aqui é tinta de placa, não joia.
