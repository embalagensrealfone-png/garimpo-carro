# Lote do UsadosBR de 24/11/2026: liga os anúncios do UsadosBR aos carros que já estavam na lista
# (mesmo ano, km, cidade e cor) e acrescenta os que não estavam. 2026 fica de fora (lista é 2022–2025).
import json, pathlib, re, subprocess, sys, urllib.request
raiz = pathlib.Path(__file__).resolve().parent.parent
tmp = pathlib.Path(sys.argv[1])
arq = raiz / 'dados/c300.json'
d = json.loads(arq.read_text())
por_id = {c['id']: c for c in d}
U = 'https://www.usadosbr.com/carros-e-utilitarios/mercedes-benz/c-300/'
AMG = '2-0-eq-boost-hibrido-amg-line/'
UA = {'User-Agent': 'Mozilla/5.0'}

# preço None = o UsadosBR pede outro valor; o link entra sem preço e o alerta conta a diferença
liga = {'c300-128': (AMG + '2024-branco-ribeirao-preto-sao-paulo-9258', 349900),
        'c300-005': (AMG + '2024-vermelho-sao-paulo-sao-paulo-10665', 265000),
        'c300-107': (AMG + '2025-azul-santos-sao-paulo-321', 328800),
        'c300-138': (AMG + '2025-branco-santos-sao-paulo-1875', 364890),
        'c300-018': (AMG + '2023-cinza-salto-sao-paulo-80', 275900),
        'c300-188': (AMG + '2024-azul-brasilia-distrito-federal-1256', None),
        'c300-190': (AMG + '2024-vermelho-goiania-goias-811', None)}
ligados = 0
for cid, (path, p) in liga.items():
    c = por_id[cid]
    if any(path in l['u'] for l in c['links']): continue
    l = {'s': 'UsadosBR', 'u': U + path, 'c': c['cid']}
    if p: l['p'] = p
    c['links'].append(l); ligados += 1
por_id['c300-188']['al'] = ['Mesmo carro anunciado também a R$ 319.990 no Mercado Livre e no UsadosBR']
por_id['c300-190']['banco'] = 'Vermelho'
if not any('UsadosBR' in a for a in por_id['c300-190']['al']):
    por_id['c300-190']['al'].append('Mesmo carro anunciado também a R$ 309.900 no UsadosBR; interior vermelho e preto, PPF')

novos = [  # caminho, ano, cor, preço, km, cidade, uf, blindado, alertas
  (AMG + '2024-azul-belem-para-717', 2024, 'Azul', 329900, 15000, 'Belém', 'PA', False, []),
  (AMG + '2024-cinza-rio-de-janeiro-rio-de-janeiro-37933', 2024, 'Cinza', 386900, 12000, 'Rio de Janeiro', 'RJ', True, ['Blindado (anúncio)']),
  (AMG + '2024-cinza-goiania-goias-26253', 2024, 'Cinza', 309900, 11617, 'Goiânia', 'GO', False, []),
  ('2-0-16v-198/2023-prata-cuiaba-mato-grosso-1041', 2023, 'Prata', 329990, 28189, 'Cuiabá', 'MT', False,
   ['No UsadosBR a versão está cadastrada como "C 300 2.0 16V"; confira se é a AMG Line híbrida']),
  (AMG + '2022-preto-goiania-goias-5705', 2022, 'Preto', 269900, 29992, 'Goiânia', 'GO', False, []),
  (AMG + '2022-cinza-goiania-goias-6710', 2022, 'Cinza', 269900, 47029, 'Goiânia', 'GO', False, []),
  (AMG + '2022-azul-goiania-goias-1833', 2022, 'Azul', 284800, 63000, 'Goiânia', 'GO', False, []),
  (AMG + '2024-preto-goiania-goias-22215', 2024, 'Preto', 319900, 21624, 'Goiânia', 'GO', False, []),
  (AMG + '2025-azul-brasilia-distrito-federal-1291', 2025, 'Azul', 379990, 14440, 'Brasília', 'DF', False, []),
]
n = max(int(c['id'].split('-')[1]) for c in d)
ja = {l['u'] for c in d for l in c['links']}
for path, ano, cor, preco, km, cid, uf, bl, al in novos:
    if U + path in ja: continue
    n += 1; idc = f'c300-{n:03d}'
    pag = urllib.request.urlopen(urllib.request.Request(U + path, headers=UA), timeout=30).read().decode()
    img = re.search(r'property="og:image" content="([^"]+)"', pag).group(1)
    web = tmp / f'{idc}.webp'; jpg = raiz / f'dados/capas-originais/{idc}.jpg'
    web.write_bytes(urllib.request.urlopen(urllib.request.Request(img, headers=UA), timeout=30).read())
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '--resampleWidth', '400', str(web), '--out', str(jpg)], check=True, capture_output=True)
    subprocess.run(['sips', '--cropToHeightWidth', '300', '400', str(jpg)], check=True, capture_output=True)
    d.append({'ano': ano, 'fab': '', 'mod': 'C 300 AMG Line EQ Boost híbrido', 'cor': cor, 'banco': 'Não aparece',
              'preco': preco, 'km': km, 'cid': cid, 'uf': uf, 'bl': bl,
              'links': [{'s': 'UsadosBR', 'u': U + path, 'p': preco, 'c': cid}], 'al': al,
              'dt': '2026-11-24', 'id': idc, 'capa': True})
arq.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ligados', ligados, '| total', len(d))
