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
    alertas = [{'t': a, 'k': tipo(a)} for a in c['al']]
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

pacote = {'fipe': {k: fipe[k] for k in ('codigo', 'modelo', 'mes', 'anos')},
          'atualizado': max(c['dt'] for c in saida), 'carros': saida}
(raiz / 'site/dados.json').write_text(json.dumps(pacote, ensure_ascii=False, separators=(',', ':')))
print(len(saida), 'carros →', (raiz / 'site/dados.json').stat().st_size // 1024, 'KB')
