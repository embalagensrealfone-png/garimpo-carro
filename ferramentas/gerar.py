# Monta site/dados.json a partir de dados/c300.json + dados/fipe.json e copia as capas.
# A conta contra a FIPE mora aqui, num lugar só: o navegador só lê o resultado.
import json, pathlib, shutil, re
raiz = pathlib.Path(__file__).resolve().parent.parent
carros = json.loads((raiz / 'dados/c300.json').read_text())
fipe = json.loads((raiz / 'dados/fipe.json').read_text())

# Alerta não é tudo igual: leilão e preço suspeito são risco (vermelho), garantia e
# único dono são ponto a favor, o resto é observação. Misturar os três num selo só
# esconderia justamente o que o comprador precisa ver primeiro.
RISCO = re.compile(r'leil|montad|bem abaixo|mesmo 20|diz preto', re.I)
BOM = re.compile(r'garantia|único dono|certificado', re.I)

def tipo(a):
    if RISCO.search(a): return 'risco'
    if BOM.search(a): return 'bom'
    return 'nota'

saida = []
img_dest = raiz / 'site/img'; img_dest.mkdir(parents=True, exist_ok=True)
for c in carros:
    ref = fipe['anos'].get(str(c['ano']))
    dif = round(c['preco'] / ref - 1, 4) if (ref and c['preco']) else None
    # "Preço bem abaixo da média do ano" era o alerta à mão da época em que a conta ignorava a km.
    # Quem decide isso agora é o laudo de mercado, lá embaixo; manter os dois daria vereditos opostos.
    alertas = [{'t': a, 'k': tipo(a)} for a in c['al'] if 'bem abaixo da média' not in a.lower()]
    saida.append({
        'id': c['id'], 'ano': c['ano'], 'fab': c['fab'], 'cor': c['cor'], 'banco': c['banco'],
        'preco': c['preco'], 'km': c['km'], 'cid': c['cid'], 'uf': c['uf'], 'bl': c['bl'],
        'leilao': any('leil' in a.lower() for a in c['al']),
        'fipe': ref, 'dif': dif, 'dt': c['dt'], 'al': alertas,
        # link com preço mais de 2% longe do preço do carro é quase sempre OUTRO carro da
        # mesma loja que entrou junto na coleta; mostrar faria um carro virar três
        'links': [{'s': l['s'], 'u': l['u']} for l in c['links']
                  if not (c['preco'] and l.get('p') and abs(l['p'] / c['preco'] - 1) > 0.02)],
        'capa': c['capa'],
    })
    if c['capa']:
        shutil.copyfile(raiz / f"dados/capas-originais/{c['id']}.jpg", img_dest / f"{c['id']}.jpg")

# ── Laudo de mercado ──────────────────────────────────────────────────────────
# A FIPE não olha a quilometragem: uma 2024 com 60 mil km "8% abaixo da FIPE" é só o desconto
# normal do uso. Aqui o carro é comparado com os iguais a ele: para cada ano, uma reta
# preço × km medida nos anúncios limpos (sem leilão, blindagem nem alerta de risco).
# "Variação normal" = desvio típico dos anúncios em torno da reta, medido, não chutado.
import statistics as st
def limpo(c): return c['preco'] and c['km'] and not c['bl'] and not c['leilao'] and not any(a['k'] == 'risco' for a in c['al'])
modelo = {}
for ano in sorted({c['ano'] for c in saida}):
    g = [c for c in saida if c['ano'] == ano and limpo(c)]
    if len(g) < 8: continue  # pouca amostra: melhor não dar laudo do que dar laudo errado
    x = [c['km'] for c in g]; y = [c['preco'] for c in g]
    mx, my = st.mean(x), st.mean(y)
    b = sum((k - mx) * (p - my) for k, p in zip(x, y)) / sum((k - mx) ** 2 for k in x)
    b = min(b, 0.0)  # km a mais nunca encarece o carro; se a amostra disser isso, é ruído
    a0 = my - b * mx
    sd = st.pstdev([p - (a0 + b * k) for k, p in zip(x, y)])
    modelo[ano] = {'a': a0, 'b': b, 'sd': sd, 'n': len(g), 'km_med': st.median(x)}

for c in saida:
    m = modelo.get(c['ano'])
    c['laudo'] = None
    if not c['preco'] or not m: continue
    if c['bl']:
        c['laudo'] = {'k': 'blindado'}; continue
    km = c['km'] or m['km_med']
    esp = m['a'] + m['b'] * km
    z = (c['preco'] - esp) / m['sd']
    k = 'desconfie' if z <= -2 else 'abaixo' if z <= -1 else 'acima' if z >= 1 else 'normal'
    c['laudo'] = {'k': k, 'esp': round(esp, -2), 'm': round(c['preco'] / esp - 1, 4), 'z': round(z, 2), 'semkm': not c['km']}

pacote = {'fipe': {k: fipe[k] for k in ('codigo', 'modelo', 'mes', 'anos')},
          'atualizado': max(c['dt'] for c in saida),
          'mercado': {str(a): {'n': v['n'], 'por10mil': round(-v['b'] * 10000, -2), 'variacao': round(v['sd'], -2)} for a, v in modelo.items()},
          'carros': saida}
(raiz / 'site/dados.json').write_text(json.dumps(pacote, ensure_ascii=False, separators=(',', ':')))
print(len(saida), 'carros →', (raiz / 'site/dados.json').stat().st_size // 1024, 'KB')
