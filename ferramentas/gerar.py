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
saidos = {c['id']: c for c in carros if c.get('saiu')}
for c in carros:
    if c.get('saiu'): continue          # vendido/tirado do ar: some da lista, mas aparece no Minas
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
        # (nunca zera: carro sem link nenhum trava a página inteira)
        'links': [{'s': l['s'], 'u': l['u']} for l in c['links']
                  if not (c['preco'] and l.get('p') and abs(l['p'] / c['preco'] - 1) > 0.02)]
                 or [{'s': l['s'], 'u': l['u']} for l in c['links']],
        'capa': c['capa'],
        'hist': c.get('hist', []),
    })
    if c['capa']:
        shutil.copyfile(raiz / f"dados/capas-originais/{c['id']}.jpg", img_dest / f"{c['id']}.jpg")

# ── KM contra a média do ano ──────────────────────────────────────────────────
# Pedido do Carlos (23/11/2026): o carimbo fica só a % contra a FIPE, e a km vira uma conta
# simples ao lado: "média da 2024 é 30 mil km; com 24 mil, este tem 20% menos". O laudo por
# reta preço × km foi testado e saiu por ser confuso de ler.
import statistics as st
km_media = {}
for ano in sorted({c['ano'] for c in saida}):
    kms = [c['km'] for c in saida if c['ano'] == ano and c['km']]
    if kms: km_media[ano] = round(st.mean(kms), -2)
for c in saida:
    m = km_media.get(c['ano'])
    c['kmrel'] = round(c['km'] / m - 1, 3) if (m and c['km']) else None

# ── Minas: o que mudou nos últimos 30 dias (o botão do site mostra a partir da última visita) ──
import datetime as dt
eventos_arq = raiz / 'dados/minas/eventos.json'
eventos = json.loads(eventos_arq.read_text()) if eventos_arq.exists() else []
corte = (dt.date.fromisoformat(max(c['dt'] for c in saida)) - dt.timedelta(days=30)).isoformat()
minas = []
for n, e in enumerate(eventos):            # n = número de ordem: o navegador guarda até onde a pessoa já viu
    e = {**e, 'n': n}
    if e['d'] < corte: continue
    if e['t'] == 'saiu':
        c = saidos.get(e['id'])
        if not c: continue
        e = {**e, 'ano': c['ano'], 'cor': c['cor'], 'km': c['km'], 'cid': c['cid'], 'uf': c['uf']}
    minas.append(e)

pacote = {'fipe': {k: fipe[k] for k in ('codigo', 'modelo', 'mes', 'anos')},
          'atualizado': max(c['dt'] for c in saida),
          'km_media': {str(a): v for a, v in km_media.items()},
          'minas': minas,
          'carros': saida}
(raiz / 'site/dados.json').write_text(json.dumps(pacote, ensure_ascii=False, separators=(',', ':')))
print(len(saida), 'carros →', (raiz / 'site/dados.json').stat().st_size // 1024, 'KB')
