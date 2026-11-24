# Lote do Mercado Livre de 23/11/2026: liga os anúncios do ML aos carros que já estavam na lista
# (mesmo preço, km e cidade) e acrescenta os que não estavam.
import json, pathlib, subprocess, sys, urllib.request
raiz = pathlib.Path(__file__).resolve().parent.parent
tmp = pathlib.Path(sys.argv[1])
arq = raiz / 'dados/c300.json'
d = json.loads(arq.read_text())
por_id = {c['id']: c for c in d}
ML = 'https://carro.mercadolivre.com.br/MLB-{}-_JM'

liga = {'c300-017': ('7974412452', 275900), 'c300-072': ('5567217211', 308900), 'c300-179': ('8040456632', 329900),
        'c300-133': ('5398986383', 355900), 'c300-016': ('7845278852', 274990), 'c300-022': ('5478520223', 279488),
        'c300-054': ('5576639589', 299000), 'c300-013': ('7916751554', 269999), 'c300-074': ('5491168931', 309900),
        'c300-126': ('5335859919', 349000), 'c300-031': ('5583466435', 281900), 'c300-060': ('5347956981', 299900),
        'c300-157': ('7979682960', 399000), 'c300-039': ('5483822191', 289990), 'c300-041': ('8010351198', 289900)}
ligados = 0
for cid, (mlb, p) in liga.items():
    c = por_id[cid]
    if any(mlb in l['u'] for l in c['links']): continue
    c['links'].append({'s': 'Mercado Livre', 'u': ML.format(mlb), 'p': p, 'c': c['cid']}); ligados += 1

novos = [
  ('7932999970', 2022, 'Cinza', 'Vermelho', 269000, 34500, 'Vila Velha', 'ES', ['Interior bordô (anúncio)'], 'D_NQ_NP_754213-MLB120742497321_112026-O-mercedes-benz-c-300-amg-line-eq-boost-20-tb-aut-2022.webp'),
  ('7973827630', 2024, 'Azul', 'Não aparece', 309900, 35000, 'Brasília', 'DF', ['Mesmo carro anunciado também a R$ 319.990 no Mercado Livre'], 'D_NQ_NP_847997-MLB119501315008_112026-O-mercedes-benz-c300-amg-line-2024.webp'),
  ('7933058882', 2024, 'Azul', 'Não aparece', 299000, 18000, 'Vila Velha', 'ES', [], 'D_NQ_NP_645725-MLB120742495831_112026-O-mercedes-benz-c-300-amg-line-2024.webp'),
  ('5321960779', 2024, 'Vermelho', 'Não aparece', 299900, 13000, 'Goiânia', 'GO', ['Único dono, com garantia de fábrica (anúncio)'], 'D_NQ_NP_735019-MLB118942823485_102026-O-mercedes-benz-classe-c-20-amg-line-aut-4-p-hibrido.webp'),
  ('7323845862', 2024, 'Azul', 'Não aparece', 315000, 21000, 'Ribeirão Preto', 'SP', [], 'D_NQ_NP_857554-MLB115575789051_082026-O-mercedes-benz-classe-c-20-amg-line-aut-4-p-hibrido.webp'),
  ('7948193776', 2024, 'Preto', 'Não aparece', 320000, 20000, 'Salvador', 'BA', ['Na garantia (anúncio)'], 'D_NQ_NP_821687-MLB120912434009_112026-O-mercedes-benz-classe-c-20-amg-line-aut-4-p-hibrido.webp'),
  ('7381290870', 2025, 'Branco', 'Não aparece', 349900, 22900, 'Vila Velha', 'ES', ['Com garantia de fábrica (anúncio)'], 'D_NQ_NP_827284-MLB115909143066_092026-O-mercedes-benz-c300-amg-line-2025.webp'),
]
n = max(int(c['id'].split('-')[1]) for c in d)
ja = {l['u'] for c in d for l in c['links']}
for mlb, ano, cor, banco, preco, km, cid, uf, al, img in novos:
    if ML.format(mlb) in ja: continue
    n += 1; idc = f'c300-{n:03d}'
    links = [{'s': 'Mercado Livre', 'u': ML.format(mlb), 'p': preco, 'c': cid}]
    if mlb == '7973827630': links.append({'s': 'Mercado Livre', 'u': ML.format('7983547714'), 'c': cid})
    web = tmp / f'{idc}.webp'; jpg = raiz / f'dados/capas-originais/{idc}.jpg'
    req = urllib.request.Request('https://http2.mlstatic.com/' + img, headers={'User-Agent': 'Mozilla/5.0'})
    web.write_bytes(urllib.request.urlopen(req, timeout=30).read())
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '--resampleWidth', '400', str(web), '--out', str(jpg)], check=True, capture_output=True)
    subprocess.run(['sips', '--cropToHeightWidth', '300', '400', str(jpg)], check=True, capture_output=True)
    d.append({'ano': ano, 'fab': '', 'mod': 'C 300 AMG Line EQ Boost híbrido', 'cor': cor, 'banco': banco,
              'preco': preco, 'km': km, 'cid': cid, 'uf': uf, 'bl': False, 'links': links, 'al': al,
              'dt': '2026-11-23', 'id': idc, 'capa': True})
arq.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ligados', ligados, '| total', len(d))
