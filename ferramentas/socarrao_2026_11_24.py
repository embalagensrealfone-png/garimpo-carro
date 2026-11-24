# Lote do Só Carrão de 24/11/2026: os 9 C 300 AMG Line 2022–2025 do site já estavam na lista
# (mesmo ano, km, preço e cidade), então cada um só ganha o link do Só Carrão.
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
arq = raiz / 'dados/c300.json'
d = json.loads(arq.read_text())
por_id = {c['id']: c for c in d}
SC = 'https://www.socarrao.com.br'
liga = {'c300-100': ('/pr/curitiba/c-300-/branco/3123911', 320000),
        'c300-179': ('/pr/campo-largo/c-300-/branco/4670856', 329900),
        'c300-060': ('/pr/campo-largo/c-300-/branco/4300389', 299900),
        'c300-062': ('/pr/curitiba/c-300-/azul/4490862', 299900),
        'c300-094': ('/pr/curitiba/c-300-/branco/4401364', 318900),
        'c300-063': ('/rs/porto-alegre/c-300-/azul/4041435', 299900),
        'c300-034': ('/pr/curitiba/c-300-/preto/3638094', 284900),
        'c300-075': ('/sc/florianopolis/c-300-/preto/4319104', 309900),
        'c300-142': ('/sc/joinville/c-300-/cinza/4471775', 369900)}
n = 0
for cid, (path, p) in liga.items():
    c = por_id[cid]
    if any(path in l['u'] for l in c['links']): continue
    c['links'].append({'s': 'Só Carrão', 'u': SC + path, 'p': p, 'c': c['cid']}); n += 1
arq.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ligados', n, '| total', len(d))
