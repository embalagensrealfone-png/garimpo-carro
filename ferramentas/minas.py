# Atualizar Minas: confere todos os anúncios da lista e procura C 300 novos.
#
#   python3 ferramentas/minas.py coletar   → lê UsadosBR, Só Carrão, Mobiauto, OLX e confere o Mercado Livre
#   (o Webmotors é lido pelo Chrome do Carlos: ferramentas/minas/COMO-RODAR.md)
#   python3 ferramentas/minas.py juntar    → aplica tudo em dados/c300.json e anota o que mudou em
#                                            dados/minas/eventos.json (é isso que o botão Minas do site mostra)
#   python3 ferramentas/gerar.py           → monta o site
#
# Facebook e Instagram não entram: pedem login. Os carros que só existem lá ficam como estão.
import html, json, pathlib, re, struct, subprocess, sys, tempfile, time, urllib.request, datetime as dt

raiz = pathlib.Path(__file__).resolve().parent.parent
COLETA = raiz / 'dados/minas/coleta'
EVENTOS = raiz / 'dados/minas/eventos.json'
ARQ = raiz / 'dados/c300.json'
HOJE = dt.date.today().isoformat()
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/130.0.0.0 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9'}
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ANOS = range(2022, 2026)
UFS = {'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
       'distrito-federal': 'DF', 'espirito-santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'mato-grosso': 'MT',
       'mato-grosso-do-sul': 'MS', 'minas-gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
       'pernambuco': 'PE', 'piaui': 'PI', 'rio-de-janeiro': 'RJ', 'rio-grande-do-norte': 'RN',
       'rio-grande-do-sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa-catarina': 'SC', 'sao-paulo': 'SP',
       'sergipe': 'SE', 'tocantins': 'TO'}
CORES = ['Preto', 'Branco', 'Cinza', 'Prata', 'Azul', 'Vermelho', 'Verde', 'Marrom', 'Bege']
sem_acento = lambda s: __import__('unicodedata').normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()
num = lambda s: int(re.sub(r'\D', '', s) or 0)
cor_ok = lambda s: next((c for c in CORES if c.lower() == (s or '').strip().lower()),
                        (s or '').strip().title() if re.fullmatch(r'[A-Za-zÀ-ú ]{3,}', (s or '').strip()) else 'Não informada')


def baixar(url, tentativas=3):
    for i in range(tentativas):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return None
            if i == tentativas - 1: raise
        except Exception:
            if i == tentativas - 1: raise
        time.sleep(3)


def chrome(url):
    # OLX barra pedido simples, mas abre num Chrome de verdade sem janela
    # perfil próprio: não mexe no Chrome do Carlos e não trava se ele estiver aberto
    perfil = COLETA / 'chrome-perfil'
    for _ in range(3):
        try:
            r = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={perfil}',
                                f'--user-agent={UA["User-Agent"]}', '--virtual-time-budget=10000', '--dump-dom', url],
                               capture_output=True, timeout=90)
            if len(r.stdout) > 50000: return r.stdout.decode('utf-8', 'replace')
        except subprocess.TimeoutExpired:
            pass
    raise RuntimeError('Chrome não abriu ' + url)


def texto(s):
    s = re.sub(r'<style.*?</style>|<script.*?</script>', ' ', s, flags=re.S)
    t = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', s)))
    t = re.sub(r'<[a-z]+ [^|]*', ' ', t)                      # sobra de tag cortada no meio
    return re.sub(r'(\s*\|\s*)+', ' | ', t)


# ── Coletores: cada um devolve a lista COMPLETA do que está no ar (só C 300 AMG Line 2022–2025) ──
def usadosbr():
    out, vistos = [], set()
    for pag in range(1, 8):
        s = baixar('https://www.usadosbr.com/carros/br/mercedes-benz/c-300' + (f'?pagina={pag}' if pag > 1 else ''))
        achou = 0
        for m in re.findall(r'/carros-e-utilitarios/mercedes-benz/c-300/[^"#]+', s):
            if m in vistos: continue
            vistos.add(m); achou += 1
            t = texto(s[s.find(m):s.find(m) + 8000])
            a = re.search(r'(\d{4}) \| / \| (\d{4}) \| ([\d.]+) \| KM \|.*?R\$ \| ([\d.]+) \|(.*?)\| ([^|]+?) - (\w\w) \|', t)
            if not a or int(a.group(2)) not in ANOS: continue
            cor = re.search(r'/\d{4}-([a-z]+)-', m)
            out.append({'u': 'https://www.usadosbr.com' + m, 'ano': int(a.group(2)), 'km': num(a.group(3)),
                        'p': num(a.group(4)), 'cid': a.group(6).strip(), 'uf': a.group(7),
                        'cor': cor_ok(cor.group(1) if cor else '')})
        if not achou: break
    return out


def fatias(s, padrao, chave_grupo):
    """Corta a página em um pedaço por anúncio: do primeiro link dele até o primeiro link do próximo."""
    inicios, vistos = [], set()
    for m in re.finditer(padrao, s):
        k = m.group(chave_grupo)
        if k in vistos: continue
        vistos.add(k); inicios.append((m.start(), m))
    return [(m, s[i:(inicios[n + 1][0] if n + 1 < len(inicios) else len(s))]) for n, (i, m) in enumerate(inicios)]


def socarrao():
    s = baixar('https://www.socarrao.com.br/mercedes-benz/c-300?marcas=9.1990')
    out = []
    for m, pedaco in fatias(s, r'/([a-z]{2})/([a-z-]+)/c-300-/([a-z-]+)/(\d+)', 4):
        t = texto(pedaco)
        a = re.search(r'AMG Line[^|]*\| (\d{4}) \| • \| ([\d.]+) km \|.*?\((\w\w)\) ([^|]+?) \| R\$ \| ([\d.]+)', t)
        if not a or int(a.group(1)) not in ANOS: continue
        out.append({'u': 'https://www.socarrao.com.br' + m.group(0), 'ano': int(a.group(1)), 'km': num(a.group(2)),
                    'uf': a.group(3).upper(), 'cid': a.group(4).strip(), 'p': num(a.group(5)), 'cor': cor_ok(m.group(3))})
    return out


def mobiauto():
    out = []
    for pag in range(1, 10):
        s = baixar('https://www.mobiauto.com.br/comprar/carros/brasil/mercedes-benz/c-300' + (f'?page={pag}' if pag > 1 else ''))
        j = json.loads(re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', s, re.S).group(1))
        res = j['props']['pageProps']['deals']['results']
        if not res: break
        for d in res:
            tr = d.get('trim') or {}
            nome = json.dumps(tr, ensure_ascii=False)
            ano = (tr.get('model') or {}).get('year')
            if 'AMG' not in nome.upper() or not ano or int(ano) not in ANOS: continue
            dl = (d.get('dealer') or {}).get('location') or {}
            out.append({'u': f"https://www.mobiauto.com.br/comprar/carros/x/mercedes-benz/c-300/{ano}/x/detalhes/{d['id']}",
                        'id': str(d['id']), 'ano': int(ano), 'km': d.get('km') or 0, 'p': d.get('price') or 0,
                        'cid': dl.get('city') or '', 'uf': (dl.get('state') or '').upper(), 'cor': cor_ok(d.get('color', ''))})
        if len(res) < 24: break
    return out


def olx():
    out, vistos = [], set()
    for pag in range(1, 8):
        s = chrome('https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/mercedes-benz/c-300' + (f'?o={pag}' if pag > 1 else ''))
        novos = 0
        for m, pedaco in fatias(s, r'href="https://([a-z]{2})\.olx\.com\.br/[^"]+-(\d{9,})"', 2):
            uf, oid = m.group(1), m.group(2)
            if oid in vistos: continue
            vistos.add(oid); novos += 1
            t = texto(pedaco)
            a = re.search(r'C-300 AMG Line[^|]*? (\d{4}) \| ([\d.]+) km \| (\w+)', t)
            if not a or int(a.group(1)) not in ANOS: continue
            # "Reduziu o preço" mostra o antigo e o atual: o atual é o menor
            precos = [num(p) for p in re.findall(r'R\$\s*([\d.]+)', t)]
            precos = [p for p in precos if p >= 50000]   # "R$ 25" e outros números soltos do cartão não são preço de C 300
            ult = [x for x in re.finditer(r'R\$\s*[\d.]+ \| (?!R\$)([^|]+?) \|', t)
                   if not re.match(r'Online|Avalia|Aceita|\d', x.group(1))]
            out.append({'u': f'https://{uf}.olx.com.br/vi/{oid}', 'id': oid, 'ano': int(a.group(1)), 'km': num(a.group(2)),
                        'cor': cor_ok(a.group(3)), 'p': min(precos) if precos else 0,
                        'cid': ult[-1].group(1).split(',')[0].strip() if ult else '', 'uf': uf.upper()})
        if not novos: break
    return out


def mercadolivre(d):
    # a busca do ML não abre para robô; então confere um por um os anúncios que já temos
    out = []
    for c in d:
        for l in c['links']:
            if l['s'] != 'Mercado Livre': continue
            s = baixar(l['u'])
            if s is None: continue                                       # 404 = saiu
            ativo = '"status":"active"' in s and not re.search(r'Anúncio (pausado|finalizado)|Este anúncio (foi|está) (pausado|finalizado)', s)
            p = re.search(r'og:title" content="[^"]*R\$ ([\d.]+)', s)
            if ativo: out.append({'u': l['u'], 'p': num(p.group(1)) if p else l.get('p')})
            time.sleep(1)
    return out


def coletar():
    COLETA.mkdir(parents=True, exist_ok=True)
    d = json.loads(ARQ.read_text())
    for nome, f in [('usadosbr', usadosbr), ('socarrao', socarrao), ('mobiauto', mobiauto), ('olx', olx),
                    ('mercadolivre', lambda: mercadolivre(d))]:
        try:
            anuncios = f()
        except Exception as e:
            print(f'{nome}: FALHOU ({e}) — fica de fora desta rodada'); continue
        if not anuncios:
            print(f'{nome}: veio vazio — fica de fora (melhor não marcar tudo como vendido)'); continue
        site = {'usadosbr': 'UsadosBR', 'socarrao': 'Só Carrão', 'mobiauto': 'Mobiauto', 'olx': 'OLX',
                'mercadolivre': 'Mercado Livre'}[nome]
        (COLETA / f'{nome}.json').write_text(json.dumps({'site': site, 'quando': HOJE, 'forma': 'completa',
            'so_conferencia': nome == 'mercadolivre', 'anuncios': anuncios}, ensure_ascii=False, indent=1))
        print(f'{nome}: {len(anuncios)} anúncios no ar')


# ── Juntar ──
def chave(site, u):
    if site in ('OLX', 'Webmotors', 'Só Carrão'): return re.search(r'(\d{6,})/?$', u).group(1)
    if site == 'Mobiauto': return re.search(r'detalhes/(\d+)', u).group(1)
    if site == 'Mercado Livre': return re.search(r'MLB-?(\d+)', u).group(1)
    return u.rstrip('/')


def mesmo_carro(c, a):
    if not (c.get('uf') == a['uf'] and abs(c['ano'] - a['ano']) <= 1 and c['km'] and a['km'] and c['preco'] and a['p']):
        return False
    if abs(c['km'] - a['km']) > 300: return False
    dif = abs(c['preco'] / a['p'] - 1)
    # km redonda (19.000, 24.500) é comum demais: aí só junta se o preço for quase o mesmo
    # (ou mesma km cravada na mesma cidade: o mesmo carro com preço diferente em dois sites)
    if a['km'] % 500 == 0 or c['km'] % 500 == 0:
        return dif <= 0.02 or (c['km'] == a['km'] and c['cid'] and c['cid'] == a.get('cid') and dif <= 0.06)
    return dif <= 0.06


# quem traz mais detalhe cria o carro primeiro; os outros sites só viram link dele
PRIORIDADE = ['Webmotors', 'UsadosBR', 'Só Carrão', 'Mobiauto', 'OLX', 'Mercado Livre', 'Facebook']
# anúncio com km mais de 1.000 diferente do carro em que está ligado é de outro carro (entre 700 e 1.000: avisa).
# O mesmo carro em dois sites varia no máximo uns 600 km (km arredondada no Facebook); a azul da Gran Brasil
# (31.157 km) estava ligada a outra azul de Curitiba com 29.581 km.
KM_OUTRO = 1000
KM_AVISO = 700


def capa(idc, url, jpg=None):
    tmp = COLETA / f'{idc}.img'
    tmp.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read())
    jpg = jpg or raiz / f'dados/capas-originais/{idc}.jpg'
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '--resampleWidth', '400', str(tmp), '--out', str(jpg)], check=True, capture_output=True)
    subprocess.run(['sips', '--cropToHeightWidth', '300', '400', str(jpg)], check=True, capture_output=True)
    tmp.unlink()


# ── Reanúncio: o vendedor tira o anúncio e põe de novo (às vezes bem mais barato). A km e o preço
#    podem mudar demais para o mesmo_carro, mas a foto de capa costuma ser a mesma. ──
def assinatura(jpg):
    """Foto reduzida a 16x12 em tons de cinza: cada ponto é 1 se for mais claro que a média."""
    out = pathlib.Path(tempfile.mkstemp(suffix='.bmp')[1])
    try:
        subprocess.run(['sips', '-s', 'format', 'bmp', '--resampleHeightWidth', '12', '16', str(jpg), '--out', str(out)],
                       check=True, capture_output=True)
        b = out.read_bytes()
    finally:
        out.unlink(missing_ok=True)
    off, = struct.unpack_from('<I', b, 10); w, h = struct.unpack_from('<ii', b, 18); px = struct.unpack_from('<H', b, 28)[0] // 8
    linha = (w * px + 3) & ~3
    g = [sum(b[off + y * linha + x * px + k] for k in range(3)) for y in range(abs(h)) for x in range(w)]
    m = sum(g) / len(g)
    return [v > m for v in g]


_assin = {}
def assin_carro(c):
    if c['id'] not in _assin:
        jpg = raiz / f"dados/capas-originais/{c['id']}.jpg"
        try: _assin[c['id']] = assinatura(jpg) if jpg.exists() else None
        except Exception: _assin[c['id']] = None
    return _assin[c['id']]


# medido em 24/11/2026 nas 278 capas: mesma foto dá distância 0 a 7; fotos diferentes, 41 ou mais na
# maioria. Loja que repete a mesma foto em carros diferentes também dá perto de 0 (c300-237 e c300-239),
# por isso a foto só vale junto com estado, ano, km e preço parecidos.
FOTO_IGUAL = 8

def parecido(c, ano, km, preco, uf, cor):
    if not (c.get('uf') == uf and abs(c['ano'] - ano) <= 1 and c['km'] and km and c['preco'] and preco): return False
    cores = {c.get('cor'), cor} - {None, '', 'Não informada'}
    if len(cores) > 1 and not any(a.split()[0] == b.split()[0] for a in cores for b in cores if a != b): return False
    return abs(c['km'] - km) <= 1500 and abs(c['preco'] / preco - 1) <= 0.25


def reanuncio(ativos, a, assin):
    dist = lambda x, y: sum(p != q for p, q in zip(x, y))
    for c in ativos:
        if parecido(c, a['ano'], a['km'], a['p'], a['uf'], a.get('cor')):
            s = assin_carro(c)
            if s and dist(s, assin) <= FOTO_IGUAL: return c
    return None


def detalhes(site, a):
    """Abre o anúncio de um carro novo para pegar foto de capa, e cor/cidade quando faltam."""
    if a.get('img') and a.get('cor') not in (None, '', 'Não informada'): return
    try:
        s = chrome(a['u']) if site == 'OLX' else baixar(a['u'])
    except Exception:
        return
    if not s: return
    m = re.search(r'property="og:image" content="([^"]+)"', s)
    if m and not a.get('img'): a['img'] = html.unescape(m.group(1))
    if a.get('cor') in (None, '', 'Não informada'):
        m = re.search(r'"(?:color|cor)"\s*:\s*\{?[^}]{0,40}?"(?:name|label)?"?\s*:?\s*"(' + '|'.join(CORES) + r')"', s, re.I) \
            or re.search(r'\bCor\b[^A-Za-zÀ-ú]{1,40}(' + '|'.join(CORES) + r')\b', texto(s), re.I)
        if m: a['cor'] = cor_ok(m.group(1))
    if not a.get('cid'):
        m = re.search(r'"(?:municipality|city)"\s*:\s*"([^"]+)"', s)
        if m: a['cid'] = m.group(1)


def juntar():
    d = json.loads(ARQ.read_text())
    eventos = json.loads(EVENTOS.read_text()) if EVENTOS.exists() else []
    ev = lambda **k: eventos.append({'d': HOJE, **k})
    ativos = [c for c in d if not c.get('saiu')]
    candidatos, caiu, conferidos, mudancas = [], {}, set(), {}

    arquivos = sorted(COLETA.glob('*.json'))
    # km que cada anúncio mostra HOJE, de todos os sites: o anúncio é comparado com o carro E com os outros
    # anúncios do mesmo carro (a km gravada no carro pode estar velha: a preta de Joinville tinha 31.000
    # gravado e os anúncios já diziam 31.875 a 32.285)
    lidas = {}
    for arq in arquivos:
        snap = json.loads(arq.read_text())
        if snap.get('quando') != HOJE: continue
        fonte = snap['anuncios'] if snap['forma'] == 'completa' else snap.get('km', {}).values()
        for a in fonte:
            if a.get('km'): lidas[(snap['site'], chave(snap['site'], a['u']))] = a['km']
    for arq in arquivos:
        snap = json.loads(arq.read_text())
        if snap.get('quando') != HOJE:
            print(f"{arq.name}: coleta de {snap.get('quando')}, não de hoje — ignorada"); continue
        site = snap['site']; conferidos.add(site)
        if snap['forma'] == 'completa':
            no_ar = {chave(site, a['u']): a for a in snap['anuncios']}
            vistos = no_ar
            saiu, preco, novos = [], {}, []
            for c in ativos:
                for l in c['links']:
                    if l['s'] != site: continue
                    k = chave(site, l['u'])
                    if k not in no_ar: saiu.append(k)
                    elif no_ar[k].get('p') and no_ar[k]['p'] != l.get('p'): preco[k] = no_ar[k]['p']
            conhecidos = {chave(site, l['u']) for c in d for l in c['links'] if l['s'] == site}
            if not snap.get('so_conferencia'):
                novos = [a for k, a in no_ar.items() if k not in conhecidos]
        else:
            saiu, preco, novos = snap['saiu'], {str(k): v for k, v in snap['preco'].items()}, snap['novos']
            vistos = {str(k): a for k, a in snap.get('km', {}).items()}
        for c in ativos:
            for l in list(c['links']):
                if l['s'] != site: continue
                k = chave(site, l['u'])
                a = vistos.get(k) or {}
                ref = [c['km']] + [lidas[(x['s'], chave(x['s'], x['u']))] for x in c['links']
                                   if x is not l and (x['s'], chave(x['s'], x['u'])) in lidas]
                dif = min(abs(a['km'] - r) for r in ref if r) if a.get('km') and c['km'] else 0
                if k not in saiu and dif > KM_OUTRO:
                    if any(x is not l for x in c['links']):
                        # o carro tem outros anúncios que confirmam a km dele: este anúncio é de OUTRO carro.
                        # Foi assim que uma C 300 cinza fosca de Curitiba ficou escondida dentro de uma branca.
                        c['links'].remove(l)
                        if l.get('p') == c['preco'] and c['links'] and not any(x.get('p') == c['preco'] for x in c['links']):
                            c['preco'] = min(x['p'] for x in c['links'] if x.get('p')) if any(x.get('p') for x in c['links']) else c['preco']
                        a = {**a, 'u': l['u'], 'p': a.get('p') or l.get('p'), 'cid': a.get('cid') or l.get('c', ''),
                             'uf': a.get('uf') or c['uf'], 'ano': a.get('ano') or c['ano']}
                        candidatos.append((site, a))
                        print(f"  SEPARADO: {site} {l['u']} tem {a['km']} km e estava no {c['id']} ({c['km']} km)")
                        continue
                    print(f"  km mudou: {c['id']} tinha {c['km']} km, o anúncio do {site} diz {a['km']} (único anúncio: fica)")
                    c['km'] = a['km']
                elif k not in saiu and dif > KM_AVISO:
                    print(f"  CONFERIR: {site} {l['u']} diz {a['km']} km e o {c['id']} tem {c['km']} km")
                if k not in saiu and site == 'Webmotors' and a.get('km') and dif <= KM_OUTRO and a['km'] != c['km']:
                    c['km'] = a['km']                     # o Webmotors é a fonte da km do carro: atualiza
                if k in saiu:
                    c['links'].remove(l); caiu.setdefault(c['id'], []).append(l)
                elif k in preco:
                    mudancas.setdefault(c['id'], []).append((l.get('p'), preco[k]))
                    l['p'] = preco[k]
        candidatos += [(site, a) for a in novos]

    # preço do carro só muda quando um anúncio dele mudou NESTA rodada: o anúncio que dava o preço
    # mudou, ou outro anúncio do mesmo carro ficou mais barato
    for c in ativos:
        if c['id'] not in mudancas or not c['preco']: continue
        ps = [novo for velho, novo in mudancas[c['id']] if velho == c['preco'] or novo < c['preco']]
        if ps and min(ps) != c['preco']:
            novo = min(ps)
            c.setdefault('hist', []).append({'d': HOJE, 'p': c['preco']})
            ev(t='baixou' if novo < c['preco'] else 'subiu', id=c['id'], de=c['preco'], para=novo)
            c['preco'] = novo

    # anúncio novo: primeiro tenta ligar a um carro que já temos (repost, outro site), senão é carro novo
    n = max(int(c['id'].split('-')[1]) for c in d)
    novos_carros = 0
    candidatos.sort(key=lambda x: PRIORIDADE.index(x[0]) if x[0] in PRIORIDADE else 99)
    for site, a in candidatos:
        # mais de um carro pode bater: fica o mais parecido (mesma cidade, depois km e preço mais perto).
        # Antes pegava o primeiro da lista e ligou um anúncio de Ribeirão Preto a um carro de Votorantim.
        iguais = [c for c in ativos if mesmo_carro(c, a)]
        alvo = min(iguais, key=lambda c: (sem_acento(c.get('cid')) != sem_acento(a.get('cid')), abs(c['km'] - a['km']),
                                          abs(c['preco'] - a['p'])), default=None)
        foto = None
        if not alvo:
            # não bateu pelos números: confere a foto contra os carros parecidos (reanúncio com outro preço)
            detalhes(site, a)
            if a.get('img'):
                foto = COLETA / f"foto-{chave(site, a['u'])}.jpg"
                try:
                    capa('tmp', a['img'], foto)
                    alvo = reanuncio(ativos, a, assinatura(foto))
                    if alvo: print(f"  reanúncio: {site} {a['u']} é o {alvo['id']} (mesma foto)")
                except Exception as e:
                    print('  sem foto para comparar', a['u'], e); foto = None
        link = {'s': site, 'u': a['u'], 'p': a['p'], 'c': a['cid']}
        if alvo:
            if foto: foto.unlink(missing_ok=True)
            if not any(chave(site, l['u']) == chave(site, a['u']) for l in alvo['links'] if l['s'] == site):
                alvo['links'].append(link)
            # o anúncio que dava o preço caiu nesta rodada e este é o que ficou: o preço do carro passa a ser o dele
            if alvo['id'] in caiu and a['p'] and a['p'] != alvo['preco'] \
                    and not any(l.get('p') == alvo['preco'] for l in alvo['links'] if l is not link):
                alvo.setdefault('hist', []).append({'d': HOJE, 'p': alvo['preco']})
                ev(t='baixou' if a['p'] < alvo['preco'] else 'subiu', id=alvo['id'], de=alvo['preco'], para=a['p'])
                alvo['preco'] = a['p']
            if alvo['cor'] == 'Não informada' and a.get('cor') not in (None, '', 'Não informada'): alvo['cor'] = a['cor']
            if not alvo['cid'] and a.get('cid'): alvo['cid'] = a['cid']
            continue
        n += 1; idc = f'c300-{n:03d}'
        al = []
        if a.get('unico') and a.get('garantia'): al.append('Único dono, com garantia de fábrica (anúncio)')
        elif a.get('unico'): al.append('Único dono (anúncio)')
        elif a.get('garantia'): al.append('Com garantia de fábrica (anúncio)')
        detalhes(site, a); link['c'] = a.get('cid', '')
        tem_capa = False
        if foto and foto.exists():
            foto.rename(raiz / f'dados/capas-originais/{idc}.jpg'); tem_capa = True
        elif a.get('img'):
            try: capa(idc, a['img']); tem_capa = True
            except Exception as e: print('  sem capa', idc, e)
        c = {'ano': a['ano'], 'fab': '', 'mod': 'C 300 AMG Line EQ Boost híbrido', 'cor': a.get('cor') or 'Não informada',
             'banco': 'Não aparece', 'preco': a['p'], 'km': a['km'], 'cid': a['cid'], 'uf': a['uf'], 'bl': bool(a.get('bl')),
             'links': [link], 'al': al, 'dt': HOJE, 'id': idc, 'capa': tem_capa}
        d.append(c); ativos.append(c); novos_carros += 1
        ev(t='novo', id=idc)

    # carro sem nenhum anúncio no ar saiu da lista (Instagram não é conferido: fica)
    sairam = 0
    for c in ativos:
        if c['id'] in caiu and not c['links']:
            c['links'] = caiu[c['id']]          # guarda os links antigos para o histórico
            c['saiu'] = HOJE; sairam += 1
            ev(t='saiu', id=c['id'], p=c['preco'])

    ARQ.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    EVENTOS.write_text(json.dumps(eventos, ensure_ascii=False, indent=1))
    # coleta aplicada vai para o arquivo morto: rodar "juntar" de novo não aplica duas vezes
    morto = COLETA / f'feito-{HOJE}'; morto.mkdir(exist_ok=True)
    for arq in arquivos:
        if arq.exists(): arq.rename(morto / f'{arq.stem}-{dt.datetime.now():%H%M%S}.json')
    hoje = [e for e in eventos if e['d'] == HOJE]
    conta = lambda t: sum(e['t'] == t for e in hoje)
    print(f"Sites conferidos: {', '.join(sorted(conferidos))}")
    print(f"Novos: {conta('novo')} | baixaram: {conta('baixou')} | subiram: {conta('subiu')} | saíram: {conta('saiu')}")
    print(f"Na lista agora: {sum(not c.get('saiu') for c in d)} carros")


def conhecidos():
    """Imprime o JS window._k = {id: [preço, km do carro]} dos anúncios do Webmotors que já estão na lista."""
    d = json.loads(ARQ.read_text())
    k = {chave('Webmotors', l['u']): [l.get('p') or 0, 0 if c.get('saiu') else c['km']]
         for c in d for l in c['links'] if l['s'] == 'Webmotors'}
    print('window._k=' + json.dumps(k, separators=(',', ':')) + ';Object.keys(_k).length')


def webmotors(arquivo):
    """Lê as fatias coladas do Chrome (linhas S|, P|, N|) e grava dados/minas/coleta/webmotors.json."""
    U = 'https://www.webmotors.com.br/comprar/mercedes-benz/c-300/20-eq-boost-hibrido-amg-line-9g-tronic/4-portas/{}/{}'
    snap = {'site': 'Webmotors', 'quando': HOJE, 'forma': 'diferenca', 'saiu': [], 'preco': {}, 'novos': [], 'km': {}}
    for ln in pathlib.Path(arquivo).read_text().splitlines():
        f = ln.strip().split('|')
        if f[0] == 'S': snap['saiu'].append(f[1])
        elif f[0] == 'P': snap['preco'][f[1]] = int(f[2])
        elif f[0] == 'K':
            _, i, ano, km, cid, uf, p, img = f
            snap['km'][i] = {'u': U.format(ano, i), 'ano': int(ano), 'km': int(km), 'cid': cid, 'uf': uf, 'p': int(p),
                             'img': img.replace('~', 'https://image.webmotors.com.br/_fotos/anunciousados/gigante/') if img else ''}
        elif f[0] == 'N':
            _, i, ano, km, cid, uf, p, cor, fl, img = f
            if 'LEIL' in fl: print('ATENÇÃO: anúncio fala de leilão, confira à mão:', i)
            snap['novos'].append({'u': U.format(ano, i), 'ano': int(ano), 'km': int(km), 'cid': cid, 'uf': uf, 'p': int(p),
                                  'cor': cor_ok(cor), 'bl': 'BLIND' in fl, 'unico': 'UNICO' in fl, 'garantia': 'GAR' in fl,
                                  'img': img.replace('~', 'https://image.webmotors.com.br/_fotos/anunciousados/gigante/') if img else ''})
    total = sum(1 for c in json.loads(ARQ.read_text()) if not c.get('saiu') for l in c['links'] if l['s'] == 'Webmotors')
    if len(snap['saiu']) > max(20, total * 0.25):
        return print(f"Webmotors: {len(snap['saiu'])} anúncios 'saíram' de uma vez — leitura incompleta (filtro de cidade?). Nada gravado.")
    COLETA.mkdir(parents=True, exist_ok=True)
    (COLETA / 'webmotors.json').write_text(json.dumps(snap, ensure_ascii=False, indent=1))
    print(f"Webmotors: saíram {len(snap['saiu'])}, mudou preço {len(snap['preco'])}, km diferente {len(snap['km'])}, "
          f"fora da lista {len(snap['novos'])}")


COR_FB = {'Grey': 'Cinza', 'Gray': 'Cinza', 'Silver': 'Prata', 'Black': 'Preto', 'White': 'Branco', 'Blue': 'Azul',
          'Red': 'Vermelho', 'Green': 'Verde', 'Brown': 'Marrom', 'Beige': 'Bege'}


def facebook(arquivo=None):
    """Sem arquivo: imprime o JS window._f com os anúncios do Facebook da lista (para o facebook.js).
    Com arquivo (as fatias F| coladas do Chrome): grava dados/minas/coleta/facebook.json para o juntar."""
    d = json.loads(ARQ.read_text())
    links = {chave('Facebook', l['u']).rstrip('/').split('/')[-1]: l
             for c in d if not c.get('saiu') for l in c['links'] if l['s'] == 'Facebook'}
    if not arquivo:
        return print('window._f=' + json.dumps({i: 1 for i in links}, separators=(',', ':')) + ';Object.keys(_f).length')
    lidos, fora, erro = {}, 0, 0
    for ln in pathlib.Path(arquivo).read_text().splitlines():
        f = ln.strip().split('|')
        if f[0] != 'F' or len(f) < 9: continue
        lidos[f[1]] = f
    anuncios = []
    for i, l in links.items():
        f = lidos.get(i)
        if f and f[2] == '1': fora += 1; continue                        # o Facebook diz que saiu do ar
        if not f or f[2] != '0':                                         # não leu: fica como estava
            erro += 1; anuncios.append({'u': l['u'], 'p': l.get('p')}); continue
        if len(f) >= 10: _, _, _, kmc, kmd, cor, p, cid, uf, ano = f[:10]
        else: _, _, _, kmc, cor, p, cid, uf, ano = f[:9]; kmd = ''
        ok = lambda x: int(x) if x.isdigit() and 300 <= int(x) < 300000 and not 2015 <= int(x) <= 2030 else 0
        kmc, kmd = ok(kmc), ok(kmd)
        # a km da descrição é mais exata (17.300 x 18.000 do campo), mas só vale se estiver perto da do campo
        km = kmd if kmd and (not kmc or abs(kmd - kmc) <= 3000) else kmc
        anuncios.append({'u': l['u'], 'p': int(p) if p.isdigit() and 100000 <= int(p) <= 2000000 else l.get('p'),
                         'km': km, 'cor': COR_FB.get(cor, 'Não informada'),
                         'cid': l.get('c') if cid and (l.get('c') or '').startswith(cid) else cid, 'uf': uf,
                         'ano': int(ano) if ano.isdigit() else 0})
    if erro > len(links) * 0.3:
        return print(f'Facebook: {erro} de {len(links)} anúncios não foram lidos — algo deu errado (login?). Nada gravado.')
    COLETA.mkdir(parents=True, exist_ok=True)
    (COLETA / 'facebook.json').write_text(json.dumps({'site': 'Facebook', 'quando': HOJE, 'forma': 'completa',
        'so_conferencia': True, 'anuncios': anuncios}, ensure_ascii=False, indent=1))
    print(f'Facebook: {len(links)} anúncios na lista · {fora} saíram do ar · {erro} não lidos (ficam como estavam)')


def repetidos(aplicar=False):
    """Procura na lista carros que são o mesmo (foto igual + estado, ano, km, preço e cor parecidos).
    Sem --juntar só mostra. Com --juntar, o carro mais antigo fica com os anúncios do outro."""
    d = json.loads(ARQ.read_text())
    ativos = [c for c in d if not c.get('saiu')]
    dist = lambda x, y: sum(p != q for p, q in zip(x, y))
    pares = []
    for i, a in enumerate(ativos):
        for b in ativos[i + 1:]:
            if not parecido(a, b['ano'], b['km'], b['preco'], b['uf'], b.get('cor')): continue
            sa, sb = assin_carro(a), assin_carro(b)
            if sa and sb and dist(sa, sb) <= FOTO_IGUAL: pares.append((a, b))
    fora = set()
    for a, b in pares:
        if a['id'] in fora or b['id'] in fora: continue
        print(f"{a['id']} {a['km']} km R$ {a['preco']} {a['cid']}  =  {b['id']} {b['km']} km R$ {b['preco']} {b['cid']}")
        if not aplicar: continue
        for l in b['links']:
            if not any(x['s'] == l['s'] and x['u'] == l['u'] for x in a['links']): a['links'].append(l)
        for k in ('al', 'hist'):
            for x in b.get(k) or []:
                if x not in (a.get(k) or []): a.setdefault(k, []).append(x)
        if a['cor'] == 'Não informada': a['cor'] = b['cor']
        a['preco'] = min(a['preco'], b['preco']); a['dt'] = min(a['dt'], b['dt']); a['bl'] = a['bl'] or b['bl']
        fora.add(b['id'])
    if aplicar and fora:
        ARQ.write_text(json.dumps([c for c in d if c['id'] not in fora], ensure_ascii=False, indent=1))
        if EVENTOS.exists():
            ev = json.loads(EVENTOS.read_text())
            EVENTOS.write_text(json.dumps([e for e in ev if e['id'] not in fora], ensure_ascii=False, indent=1))
        for i in fora: (raiz / f'dados/capas-originais/{i}.jpg').unlink(missing_ok=True)
    print(f"{len(fora) if aplicar else len(pares)} repetido(s){' juntado(s)' if aplicar else ' (rode com --juntar para juntar)'}")


if __name__ == '__main__':
    acao = sys.argv[1]
    if acao == 'webmotors': webmotors(sys.argv[2])
    elif acao == 'facebook': facebook(sys.argv[2] if len(sys.argv) > 2 else None)
    elif acao == 'repetidos': repetidos('--juntar' in sys.argv)
    else: {'coletar': coletar, 'juntar': juntar, 'conhecidos': conhecidos}[acao]()
