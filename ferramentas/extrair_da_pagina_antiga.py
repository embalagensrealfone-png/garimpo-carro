# Uso único: tira os dados da página pessoal de C 300 (ferramentas/saida/mercedes-c300.html
# no projeto calasa-vendas) e separa as capas em arquivos, para o site carregar só a
# foto que aparece na tela, em vez de 5 MB de base64 de uma vez.
import base64, json, sys, pathlib
orig = pathlib.Path(sys.argv[1]).read_text()
i = orig.index('const D=') + 8
d, _ = json.JSONDecoder().raw_decode(orig[i:])
raiz = pathlib.Path(__file__).resolve().parent.parent
brutas = raiz / 'dados' / 'capas-originais'; brutas.mkdir(parents=True, exist_ok=True)
for n, c in enumerate(d, 1):
    c['id'] = f'c300-{n:03d}'
    img = c.pop('img', '')
    c['capa'] = bool(img)
    if img:
        (brutas / f"{c['id']}.jpg").write_bytes(base64.b64decode(img))
(raiz / 'dados' / 'c300.json').write_text(json.dumps(d, ensure_ascii=False, indent=1))
print(len(d), 'carros,', sum(c['capa'] for c in d), 'com capa')
