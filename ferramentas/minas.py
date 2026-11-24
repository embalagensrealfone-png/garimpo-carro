# Atualizar Minas: confere todos os anúncios da lista e procura C 300 novos.
#
#   python3 ferramentas/minas.py coletar   → lê UsadosBR, Só Carrão, Mobiauto, OLX e confere o Mercado Livre
#   (o Webmotors é lido pelo Chrome do Carlos: ferramentas/minas/COMO-RODAR.md)
#   python3 ferramentas/minas.py juntar    → aplica tudo em dados/c300.json e anota o que mudou em
#                                            dados/minas/eventos.json (é isso que o botão Minas do site mostra)
#   python3 ferramentas/gerar.py           → monta o site
#
# Facebook e Instagram não entram: pedem login. Os carros que só existem lá ficam como estão.
import html, json, pathlib, re, subprocess, sys, time, urllib.request, datetime as dt

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
PRIORIDADE = ['Webmotors', 'UsadosBR', 'Só Carrão', 'Mobiauto', 'OLX', 'Mercado Livre']


def capa(idc, url):
    tmp = COLETA / f'{idc}.img'
    tmp.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read())
    jpg = raiz / f'dados/capas-originais/{idc}.jpg'
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '--resampleWidth', '400', str(tmp), '--out', str(jpg)], check=True, capture_output=True)
    subprocess.run(['sips', '--cropToHeightWidth', '300', '400', str(jpg)], check=True, capture_output=True)
    tmp.unlink()


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
    for arq in arquivos:
        snap = json.loads(arq.read_text())
        if snap.get('quando') != HOJE:
            print(f"{arq.name}: coleta de {snap.get('quando')}, não de hoje — ignorada"); continue
        site = snap['site']; conferidos.add(site)
        if snap['forma'] == 'completa':
            no_ar = {chave(site, a['u']): a for a in snap['anuncios']}
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
        for c in ativos:
            for l in list(c['links']):
                if l['s'] != site: continue
                k = chave(site, l['u'])
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
        alvo = next((c for c in ativos if mesmo_carro(c, a)), None)
        link = {'s': site, 'u': a['u'], 'p': a['p'], 'c': a['cid']}
        if alvo:
            if not any(chave(site, l['u']) == chave(site, a['u']) for l in alvo['links'] if l['s'] == site):
                alvo['links'].append(link)
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
        if a.get('img'):
            try: capa(idc, a['img']); tem_capa = True
            except Exception as e: print('  sem capa', idc, e)
        c = {'ano': a['ano'], 'fab': '', 'mod': 'C 300 AMG Line EQ Boost híbrido', 'cor': a.get('cor') or 'Não informada',
             'banco': 'Não aparece', 'preco': a['p'], 'km': a['km'], 'cid': a['cid'], 'uf': a['uf'], 'bl': bool(a.get('bl')),
             'links': [link], 'al': al, 'dt': HOJE, 'id': idc, 'capa': tem_capa}
        d.append(c); ativos.append(c); novos_carros += 1
        ev(t='novo', id=idc)

    # carro sem nenhum anúncio no ar saiu da lista (Facebook/Instagram não são conferidos: ficam)
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
    """Imprime o JS window._k = {id: preço} dos anúncios do Webmotors que já estão na lista."""
    d = json.loads(ARQ.read_text())
    k = {chave('Webmotors', l['u']): l.get('p') or 0 for c in d if not c.get('saiu') for l in c['links'] if l['s'] == 'Webmotors'}
    print('window._k=' + json.dumps(k, separators=(',', ':')) + ';Object.keys(_k).length')


def webmotors(arquivo):
    """Lê as fatias coladas do Chrome (linhas S|, P|, N|) e grava dados/minas/coleta/webmotors.json."""
    U = 'https://www.webmotors.com.br/comprar/mercedes-benz/c-300/20-eq-boost-hibrido-amg-line-9g-tronic/4-portas/{}/{}'
    snap = {'site': 'Webmotors', 'quando': HOJE, 'forma': 'diferenca', 'saiu': [], 'preco': {}, 'novos': []}
    for ln in pathlib.Path(arquivo).read_text().splitlines():
        f = ln.strip().split('|')
        if f[0] == 'S': snap['saiu'].append(f[1])
        elif f[0] == 'P': snap['preco'][f[1]] = int(f[2])
        elif f[0] == 'N':
            _, i, ano, km, cid, uf, p, cor, fl, img = f
            if 'LEIL' in fl: print('ATENÇÃO: anúncio fala de leilão, confira à mão:', i)
            snap['novos'].append({'u': U.format(ano, i), 'ano': int(ano), 'km': int(km), 'cid': cid, 'uf': uf, 'p': int(p),
                                  'cor': cor_ok(cor), 'bl': 'BLIND' in fl, 'unico': 'UNICO' in fl, 'garantia': 'GAR' in fl,
                                  'img': img.replace('~', 'https://image.webmotors.com.br/_fotos/anunciousados/gigante/') if img else ''})
    COLETA.mkdir(parents=True, exist_ok=True)
    (COLETA / 'webmotors.json').write_text(json.dumps(snap, ensure_ascii=False, indent=1))
    print(f"Webmotors: saíram {len(snap['saiu'])}, mudou preço {len(snap['preco'])}, fora da lista {len(snap['novos'])}")


if __name__ == '__main__':
    acao = sys.argv[1]
    if acao == 'webmotors': webmotors(sys.argv[2])
    else: {'coletar': coletar, 'juntar': juntar, 'conhecidos': conhecidos}[acao]()
