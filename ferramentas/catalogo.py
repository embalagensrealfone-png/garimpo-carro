"""Monta site/catalogo.json: marca -> modelo -> versões, tirado da tabela FIPE (API pública parallelum).

Só entram versões com código FIPE >= 5000 (cadastradas de ~2010 para cá): o garimpo é de usado
que ainda roda, e isso tira da lista Opala, Chevette e afins. Rodar de vez em quando (1 pedido por marca).
"""
import json, re, time, urllib.request
from pathlib import Path

API = 'https://parallelum.com.br/fipe/api/v1/carros/marcas'
SAIDA = Path(__file__).resolve().parent.parent / 'site' / 'catalogo.json'

def pega(url):
    for t in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'garimpo-catalogo'}), timeout=30) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 * (t + 1))
    raise SystemExit(f'falhou: {url}')

def nome_marca(n):
    return {'GM - Chevrolet': 'Chevrolet', 'VW - VolksWagen': 'Volkswagen'}.get(n, n)

def modelo_de(nome):
    nome = re.sub(r'\s+', ' ', nome).strip()
    primeiro = nome.split(' ')[0]
    # Mercedes e afins: "C-300 AMG Line..." -> modelo "C 300"
    return primeiro.replace('-', ' ') if re.match(r'^[A-Z]{1,4}-\d', primeiro) else primeiro

cat = {}
for m in pega(API):
    mods = [x for x in pega(f"{API}/{m['codigo']}/modelos")['modelos'] if int(x['codigo']) >= 5000]
    if not mods:
        continue
    grupo = {}
    for x in mods:
        nome = re.sub(r'\s+', ' ', x['nome']).strip()
        mod = modelo_de(nome)
        resto = nome[len(nome.split(' ')[0]):].strip() or nome
        grupo.setdefault(mod, set()).add(resto)
    cat[nome_marca(m['nome'])] = {k: sorted(v, key=str.lower) for k, v in sorted(grupo.items(), key=lambda i: i[0].lower())}
    time.sleep(0.4)

cat = dict(sorted(cat.items(), key=lambda i: i[0].lower()))
SAIDA.write_text(json.dumps(cat, ensure_ascii=False, separators=(',', ':')))
print(len(cat), 'marcas,', sum(len(v) for v in cat.values()), 'modelos,', round(SAIDA.stat().st_size / 1024), 'KB')
