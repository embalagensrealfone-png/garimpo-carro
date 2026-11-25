# Alertas no WhatsApp: quem pede no site (botão "Quero o alerta" da lista) manda uma mensagem para o
# WhatsApp do Garimpo com a peneira e um código. O Carlos cadastra aqui, e depois de cada "atualizar minas"
# este script monta, para cada pessoa, a mensagem com o que entrou ou baixou dentro da peneira dela.
# Quem envia é o Carlos, clicando em cada botão da página que o script abre (nada sai sozinho).
#
#   python3 ferramentas/alertas.py novo <telefone> "<nome>" "<mensagem colada do WhatsApp>"
#   python3 ferramentas/alertas.py lista
#   python3 ferramentas/alertas.py tirar <telefone>          (quem respondeu SAIR)
#   python3 ferramentas/alertas.py avisos                    (depois do Minas: abre a página de envio)
#
# Os telefones ficam em dados/privado/ (fora do git: o repositório é público).
import datetime as dt, html, json, pathlib, re, subprocess, sys, unicodedata, urllib.parse

raiz = pathlib.Path(__file__).resolve().parent.parent
PRIV = raiz / 'dados/privado'
ARQ = PRIV / 'alertas.json'
EVENTOS = raiz / 'dados/minas/eventos.json'
DADOS = raiz / 'site/dados.json'
SITE = 'https://embalagensrealfone-png.github.io/garimpo-carro/c300.html'
HOJE = dt.date.today().isoformat()
LISTAS = ['ano', 'uf', 'cor', 'banco', 'site', 'vend']


def ler():
    return json.loads(ARQ.read_text()) if ARQ.exists() else []


def gravar(a):
    PRIV.mkdir(parents=True, exist_ok=True)
    ARQ.write_text(json.dumps(a, ensure_ascii=False, indent=1))


def tel_ok(t):
    d = re.sub(r'\D', '', t)
    if len(d) in (10, 11): d = '55' + d
    if not re.fullmatch(r'55\d{10,11}', d): sys.exit(f'Telefone estranho: {t} (use DDD + número)')
    return d


def ler_codigo(txt):
    m = re.search(r'código do alerta:\s*([^)\s]+)', txt) or re.fullmatch(r'\s*([\w=,&.%-]*av=[\w,]+[\w=,&.%-]*)\s*', txt)
    if not m: sys.exit('Não achei o "código do alerta" na mensagem. Cole a mensagem inteira que a pessoa mandou.')
    p = urllib.parse.parse_qs(m.group(1), keep_blank_values=True)
    f = {k: p[k][0].split(',') for k in LISTAS if k in p}
    for k in ('pmin', 'preco', 'kmin', 'km'):
        if k in p: f[k] = int(p[k][0])
    for k in ('cid', 'bl', 'leilao'):
        if k in p: f[k] = p[k][0]
    f['av'] = [a for a in p.get('av', ['novo,baixou'])[0].split(',') if a in ('novo', 'baixou')] or ['novo', 'baixou']
    return f


sem_acento = lambda s: unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()


def vendedor(c):
    txt = ' '.join(a['t'] if isinstance(a, dict) else a for a in c.get('al', []))
    return [v for v, r in (('dono', r'único dono'), ('garantia', r'garantia')) if re.search(r, txt, re.I)]


def passa(c, f):
    """A mesma peneira do site (app.js, função passa)."""
    if f.get('leilao') != '1' and c.get('leilao'): return False
    if f.get('bl') == 'nao' and c.get('bl'): return False
    if f.get('bl') == 'sim' and not c.get('bl'): return False
    val = {'ano': [str(c['ano'])], 'uf': [c.get('uf')], 'cor': [c.get('cor')], 'banco': [c.get('banco')],
           'site': list({l['s'] for l in c['links']}), 'vend': vendedor(c)}
    for k in LISTAS:
        if f.get(k) and not set(val[k]) & set(f[k]): return False
    pmin, pmax, kmin, kmax = f.get('pmin', 0), f.get('preco', 0), f.get('kmin', 0), f.get('km', 0)
    if (pmin or pmax) and not (c.get('preco') and c['preco'] >= pmin and (not pmax or c['preco'] <= pmax)): return False
    if (kmin or kmax) and not (c.get('km') and c['km'] >= kmin and (not kmax or c['km'] <= kmax)): return False
    if f.get('cid') and sem_acento(f['cid']) not in sem_acento(c.get('cid')): return False
    return True


reais = lambda v: 'R$ ' + f'{v:,}'.replace(',', '.')


def linha_carro(c):
    km = f"{c['km']:,}".replace(',', '.') + ' km' if c.get('km') else 'km não informada'
    fipe = ''
    if c.get('fipe') and c.get('preco'):
        d = c['fipe'] - c['preco']
        fipe = ' · na FIPE' if abs(d) <= 1000 else f" · {abs(d) / c['fipe'] * 100:.0f}% {'abaixo' if d > 0 else 'acima'} da FIPE"
    return f"{c['ano']} {c.get('cor', '')} · {km} · {c.get('cid', '')}/{c.get('uf', '')} · {reais(c['preco'])}{fipe}"


def novo(tel, nome, txt):
    a = [x for x in ler() if x['tel'] != tel_ok(tel)]
    f = ler_codigo(txt)
    a.append({'tel': tel_ok(tel), 'nome': nome, 'filtro': f, 'desde': HOJE, 'ultimo': HOJE})
    gravar(a)
    d = json.loads(DADOS.read_text())
    hoje = sum(passa(c, f) for c in d['carros'])
    print(f'Alerta de {nome} cadastrado. Hoje {hoje} carros passam na peneira dele; ele será avisado do que entrar ou baixar daqui pra frente.')


def lista():
    a = ler()
    for x in a: print(f"{x['tel']}  {x['nome']:<20} desde {x['desde']}  último aviso {x['ultimo']}  {x['filtro']}")
    print(f'{len(a)} alerta(s)')


def tirar(tel):
    a = ler(); t = tel_ok(tel)
    gravar([x for x in a if x['tel'] != t])
    print('Removido.' if any(x['tel'] == t for x in a) else 'Esse telefone não estava na lista.')


def avisos():
    a = ler()
    if not a: return print('Ninguém pediu alerta ainda.')
    ev = json.loads(EVENTOS.read_text())
    carros = {c['id']: c for c in json.loads(DADOS.read_text())['carros']}
    blocos, envios = [], 0
    for x in a:
        f = x['filtro']; vistos = set(); itens = []
        for e in sorted((e for e in ev if e['d'] > x['ultimo'] and e['t'] in f['av']), key=lambda e: e['d']):
            c = carros.get(e['id'])
            if not c or c['id'] in vistos or not passa(c, f): continue
            vistos.add(c['id'])
            tit = 'NOVA NA LISTA' if e['t'] == 'novo' else f"BAIXOU {reais(e['de'] - e['para'])} (era {reais(e['de'])})"
            itens.append(f"*{tit}*\n{linha_carro(c)}\n{SITE}#carro={c['id']}")
        if not itens: continue
        nome = x['nome'].split()[0] if x['nome'] else ''
        msg = (f"Olá{', ' + nome if nome else ''}! O Garimpo Carro conferiu os anúncios e achou "
               f"{'uma novidade' if len(itens) == 1 else f'{len(itens)} novidades'} na sua peneira da C 300:\n\n"
               + '\n\n'.join(itens) + '\n\nPara parar os avisos, responda SAIR.')
        url = f"https://wa.me/{x['tel']}?text={urllib.parse.quote(msg)}"
        blocos.append(f'<section><h2>{html.escape(x["nome"])} <small>+{x["tel"]}</small></h2>'
                      f'<pre>{html.escape(msg)}</pre><a class="ir" href="{html.escape(url)}" target="_blank">Enviar no WhatsApp</a></section>')
        x['ultimo'] = max(e['d'] for e in ev); envios += 1
    if not blocos: return print(f'Nenhuma novidade nas peneiras dos {len(a)} alerta(s) desde o último aviso.')
    pag = PRIV / f'avisos-{HOJE}.html'
    pag.write_text(f'''<!doctype html><meta charset="utf-8"><title>Avisos {HOJE}</title>
<style>body{{font:16px/1.4 system-ui;max-width:720px;margin:24px auto;padding:0 16px;background:#EFEEE9;color:#17140F}}
section{{background:#fff;border:2px solid #17140F;border-radius:4px;padding:14px 16px;margin:0 0 16px}}
h2{{margin:0 0 8px;font-size:1.1rem}} small{{color:#4A4236;font-weight:400}}
pre{{white-space:pre-wrap;font:inherit;background:#F7F6F2;padding:10px;border-radius:3px}}
.ir{{display:inline-block;background:#17140F;color:#F2B705;padding:10px 14px;border-radius:3px;text-decoration:none;font-weight:700}}</style>
<h1>Avisos de {HOJE}: {envios} pessoa(s)</h1><p>Clique em cada botão para abrir o WhatsApp com a mensagem pronta e enviar.</p>
{''.join(blocos)}''')
    gravar(a)
    print(f'{envios} pessoa(s) com novidade. Página de envio: {pag}')
    if '--sem-abrir' not in sys.argv: subprocess.run(['open', str(pag)])


if __name__ == '__main__':
    acao = sys.argv[1] if len(sys.argv) > 1 else ''
    if acao == 'novo' and len(sys.argv) >= 5: novo(sys.argv[2], sys.argv[3], sys.argv[4])
    elif acao == 'lista': lista()
    elif acao == 'tirar' and len(sys.argv) >= 3: tirar(sys.argv[2])
    elif acao == 'avisos': avisos()
    else: print(__doc__ or open(__file__).read().split('import')[0])
