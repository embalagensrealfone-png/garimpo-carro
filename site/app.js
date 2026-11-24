// Garimpo Carro — a peneira roda toda no navegador: são menos de 200 carros, 80 KB de dados.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const reais = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const milKm = (v) => (v >= 1000 ? Math.round(v / 1000) + ' mil' : v) + ' km';
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  let D = [], ULT = '';
  const PADRAO = { semLeilao: true, bl: 'todos', ano: [], uf: [], cor: [], banco: [], preco: 460000, km: 80000, cid: '', ordem: 'fipe' };
  let F = { ...PADRAO };

  // ── Estado na URL: quem compartilha o link manda a peneira junto ──
  function lerUrl() {
    const p = new URLSearchParams(location.hash.slice(1));
    const lista = (k) => (p.get(k) ? p.get(k).split(',') : []);
    F = {
      ...PADRAO,
      semLeilao: p.get('leilao') !== '1',
      bl: p.get('bl') || 'todos',
      ano: lista('ano'), uf: lista('uf'), cor: lista('cor'), banco: lista('banco'),
      preco: +p.get('preco') || PADRAO.preco,
      km: +p.get('km') || PADRAO.km,
      cid: p.get('cid') || '',
      ordem: p.get('ordem') || 'fipe',
    };
  }
  function gravarUrl() {
    const p = new URLSearchParams();
    if (!F.semLeilao) p.set('leilao', '1');
    if (F.bl !== 'todos') p.set('bl', F.bl);
    for (const k of ['ano', 'uf', 'cor', 'banco']) if (F[k].length) p.set(k, F[k].join(','));
    if (F.preco < PADRAO.preco) p.set('preco', F.preco);
    if (F.km < PADRAO.km) p.set('km', F.km);
    if (F.cid) p.set('cid', F.cid);
    if (F.ordem !== 'fipe') p.set('ordem', F.ordem);
    const h = p.toString();
    history.replaceState(null, '', h ? '#' + h : location.pathname);
  }

  // ── Peneira ──
  function passa(c, ignorar) {
    if (F.semLeilao && c.leilao) return false;
    if (F.bl === 'nao' && c.bl) return false;
    if (F.bl === 'sim' && !c.bl) return false;
    if (ignorar !== 'ano' && F.ano.length && !F.ano.includes(String(c.ano))) return false;
    if (ignorar !== 'uf' && F.uf.length && !F.uf.includes(c.uf)) return false;
    if (ignorar !== 'cor' && F.cor.length && !F.cor.includes(c.cor)) return false;
    if (ignorar !== 'banco' && F.banco.length && !F.banco.includes(c.banco)) return false;
    // preço não informado não é "barato": só entra quando a peneira de preço está aberta
    if (F.preco < PADRAO.preco && !(c.preco > 0 && c.preco <= F.preco)) return false;
    if (F.km < PADRAO.km && !(c.km > 0 && c.km <= F.km)) return false;
    if (F.cid && !semAcento(c.cid).includes(semAcento(F.cid))) return false;
    return true;
  }
  const ORDENS = {
    // preço suspeito não é o "melhor negócio": vai depois dos limpos, ainda visível
    // "melhor negócio" = mais abaixo do esperado para a km; os de "desconfie" vão para o fim,
    // blindados (sem comparação justa) logo antes deles
    fipe: (a, b) => grupo(a) - grupo(b) || margem(a) - margem(b),
    recentes: (a, b) => b.dt.localeCompare(a.dt) || margem(a) - margem(b),
    preco: (a, b) => (a.preco || 9e9) - (b.preco || 9e9),
    km: (a, b) => (a.km || 9e9) - (b.km || 9e9),
    ano: (a, b) => b.ano - a.ano || margem(a) - margem(b),
  };

  // ── Desenho ──
  const tpl = $('#t-linha');
  function linha(c) {
    const li = tpl.content.firstElementChild.cloneNode(true);
    li.id = c.id;
    const principal = c.links[0];
    const foto = $('.foto', li);
    foto.href = principal.u;
    foto.setAttribute('aria-label', 'Ver fotos no anúncio de ' + principal.s);
    if (c.capa) {
      const img = $('img', foto);
      img.src = 'img/' + c.id + '.jpg';
      img.alt = `C 300 ${c.ano} ${c.cor.toLowerCase()}`;
    } else { foto.classList.add('sem'); foto.textContent = ''; }

    const selos = $('.selos', li);
    if (c.leilao) selos.insertAdjacentHTML('beforeend', '<span class="selo leilao">Passou por leilão</span>');
    if (c.bl) selos.insertAdjacentHTML('beforeend', '<span class="selo blind">Blindado</span>');
    if (c.dt === ULT) selos.insertAdjacentHTML('beforeend', `<span class="selo novo">Novo · ${dataBR(c.dt)}</span>`);
    if (!selos.children.length) selos.remove();

    const fab = c.fab && c.fab !== String(c.ano) ? `${c.fab}/${c.ano}` : String(c.ano);
    $('.titulo', li).innerHTML = `C 300 ${fab} · ${esc(c.cor)} <small>banco ${esc(c.banco.toLowerCase())}</small>`;
    const onde = c.cid ? `${esc(c.cid)}${c.uf && c.uf !== 'Não informado' ? '/' + c.uf : ''}` : (c.uf !== 'Não informado' ? c.uf : 'Cidade não informada');
    $('.meta', li).innerHTML = [c.km ? `<b>${milKm(c.km)}</b>` : 'km não informado', onde, `na lista desde ${dataBR(c.dt)}`].join(' · ');

    const al = $('.alertas', li);
    // risco primeiro: do lado do comprador
    const ordemAl = { risco: 0, bom: 1, nota: 2 };
    c.al.filter((a) => !/leil/i.test(a.t) || !c.leilao || a.t.length > 40)
      .sort((a, b) => ordemAl[a.k] - ordemAl[b.k])
      .forEach((a) => al.insertAdjacentHTML('beforeend', `<li class="${a.k}">${esc(a.t)}</li>`));
    if (c.al.some((a) => a.k === 'risco')) li.classList.add('tem-risco');
    if (!al.children.length) al.remove();

    const pr = $('.preco', li);
    if (c.preco) pr.textContent = reais(c.preco); else { pr.textContent = 'Preço não informado'; pr.classList.add('sem'); }
    const ca = $('.carimbo', li);
    const t = textoLaudo(c);
    if (!t) ca.classList.add('vazio');
    else { ca.classList.add(t.k); ca.innerHTML = `${t.titulo}<small>${t.ref}</small>`; }

    const sites = $('.sites', li);
    const comp = $('.compartilha', li); comp.dataset.id = c.id;
    comp.setAttribute('aria-label', `Compartilhar a C 300 ${c.ano} ${c.cor.toLowerCase()} de ${c.cid || c.uf}`);
    // um botão por site; o mesmo carro repostado no mesmo site vira chips "2", "3", não botões repetidos
    const porSite = new Map();
    c.links.forEach((l) => { if (!porSite.has(l.s)) porSite.set(l.s, []); porSite.get(l.s).push(l.u); });
    porSite.forEach((urls, s) => {
      const g = document.createElement('span'); g.className = 'site';
      urls.forEach((u, i) => {
        const a = document.createElement('a');
        a.href = u; a.target = '_blank'; a.rel = 'noopener nofollow';
        if (i === 0) { a.textContent = s; a.setAttribute('aria-label', `Abrir o anúncio no ${s} (nova aba)`); }
        else { a.className = 'outro'; a.textContent = i + 1; a.setAttribute('aria-label', `Abrir o anúncio ${i + 1} no ${s} (nova aba)`); }
        g.append(a);
      });
      sites.append(g);
    });
    return li;
  }
  // "preço bem abaixo da média" é alerta: o carimbo não pode elogiar o mesmo carro
  // ── Laudo: o carro contra os iguais a ele (mesmo ano, mesma km), calculado em ferramentas/gerar.py ──
  const margem = (c) => (c.laudo && c.laudo.m != null ? c.laudo.m : 9);
  const grupo = (c) => (!c.laudo ? 2 : c.laudo.k === 'desconfie' ? 3 : c.laudo.k === 'blindado' ? 1 : 0);
  function textoLaudo(c) {
    const L = c.laudo; if (!L) return null;
    const fipe = c.fipe ? `FIPE ${c.ano}: ${reais(c.fipe)}` : '';
    if (L.k === 'blindado') return { k: 'na', titulo: 'Blindado · sem comparação', curto: 'blindado', ref: fipe + ' (sem blindagem)' };
    const p = Math.round(Math.abs(L.m) * 100);
    const ref = `Esperado ${L.semkm ? '(km não informada)' : 'para a km'}: ${reais(L.esp)}` + (fipe ? ` · ${fipe}` : '');
    if (L.k === 'desconfie') return { k: 'suspeito', titulo: `${p}% abaixo · desconfie`, curto: `${p}% abaixo do mercado (bom demais: desconfie)`, ref };
    if (L.k === 'abaixo') return { k: 'abaixo', titulo: `${p}% abaixo do mercado`, curto: `${p}% abaixo do mercado`, ref };
    if (L.k === 'acima') return { k: 'acima', titulo: `${p}% acima do mercado`, curto: `${p}% acima do mercado`, ref };
    return { k: 'na', titulo: 'Preço normal para a km', curto: 'preço normal para a km', ref };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  let ultimoTotal = -1;
  function desenhar() {
    const lista = D.filter((c) => passa(c)).sort(ORDENS[F.ordem] || ORDENS.fipe);
    const ol = $('#linhas');
    ol.replaceChildren(...lista.map(linha));
    $('#vazio').hidden = lista.length > 0;
    const ct = $('#ct');
    ct.textContent = lista.length; $('#ct2').textContent = lista.length;
    if (ultimoTotal !== -1 && ultimoTotal !== lista.length) { ct.classList.remove('peneirou'); void ct.offsetWidth; ct.classList.add('peneirou'); }
    ultimoTotal = lista.length;
    contarChips();
    gravarUrl();
  }

  // ── Chips com contagem: cada opção diz quantos carros sobrariam ──
  const GRUPOS = {
    ano: { el: '#f-ano', val: (c) => String(c.ano), ord: (a, b) => a - b },
    uf: { el: '#f-uf', val: (c) => c.uf, ord: (a, b) => (a === 'Não informado') - (b === 'Não informado') || a.localeCompare(b) },
    cor: { el: '#f-cor', val: (c) => c.cor, ord: null },
    banco: { el: '#f-banco', val: (c) => c.banco, ord: null },
  };
  function montarChips() {
    for (const [k, g] of Object.entries(GRUPOS)) {
      const cont = {};
      D.forEach((c) => { const v = g.val(c); cont[v] = (cont[v] || 0) + 1; });
      let vals = Object.keys(cont);
      vals = g.ord ? vals.sort(g.ord) : vals.sort((a, b) => cont[b] - cont[a]);
      $(g.el).innerHTML = vals.map((v) => `<label><input type="checkbox" name="${k}" value="${esc(v)}"><span>${esc(v)} <small data-n></small></span></label>`).join('');
    }
  }
  function contarChips() {
    for (const [k, g] of Object.entries(GRUPOS)) {
      const base = D.filter((c) => passa(c, k));
      const cont = {};
      base.forEach((c) => { const v = g.val(c); cont[v] = (cont[v] || 0) + 1; });
      $(g.el).querySelectorAll('input').forEach((i) => { i.nextElementSibling.querySelector('[data-n]').textContent = cont[i.value] || 0; });
    }
  }

  function sincronizarForm() {
    const f = $('#peneira');
    f.semLeilao.checked = F.semLeilao;
    f.querySelectorAll('input[name=bl]').forEach((r) => (r.checked = r.value === F.bl));
    for (const k of Object.keys(GRUPOS)) f.querySelectorAll(`input[name=${k}]`).forEach((i) => (i.checked = F[k].includes(i.value)));
    $('#f-preco').value = F.preco; $('#f-km').value = F.km; $('#f-cid').value = F.cid; $('#ordem').value = F.ordem;
    rotulosFaixa();
  }
  function rotulosFaixa() {
    $('#f-preco-v').textContent = F.preco >= PADRAO.preco ? 'Qualquer preço' : reais(F.preco);
    $('#f-km-v').textContent = F.km >= PADRAO.km ? 'Qualquer km' : milKm(F.km);
  }

  function lerForm() {
    const f = $('#peneira');
    F.semLeilao = f.semLeilao.checked;
    F.bl = f.querySelector('input[name=bl]:checked').value;
    for (const k of Object.keys(GRUPOS)) F[k] = [...f.querySelectorAll(`input[name=${k}]:checked`)].map((i) => i.value);
    F.preco = +$('#f-preco').value; F.km = +$('#f-km').value; F.cid = $('#f-cid').value.trim();
    rotulosFaixa();
    desenhar();
  }

  function pepitas() {
    const top = D.filter((c) => c.laudo && c.laudo.k === 'abaixo' && !c.leilao && c.capa && !c.al.some((a) => a.k === 'risco'))
      .sort(ORDENS.fipe).slice(0, 3);
    $('#pepitas').innerHTML = top.map((c) => `
      <li class="pepita-item"><a href="#${c.id}" data-alvo="${c.id}">
        <img src="img/${c.id}.jpg" alt="" width="64" height="48">
        <span><b>C 300 ${c.ano} · ${esc(c.cor)}</b><small>${c.km ? milKm(c.km) + ' · ' : ''}${esc(c.cid || c.uf)}${c.cid ? '/' + c.uf : ''}</small></span>
        <span class="pp">${reais(c.preco)}<em class="carimbo abaixo">${Math.round(Math.abs(c.laudo.m) * 100)}% abaixo do mercado</em></span>
      </a></li>`).join('');
  }

  function irPara(id, chegando) {
    let el = document.getElementById(id);
    if (!el) { F = { ...PADRAO }; sincronizarForm(); desenhar(); el = document.getElementById(id); }
    if (!el) return;
    // quem chega por link de um carro vai direto, sem animação: a página ainda está montando
    const suave = !chegando && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'center' });
    el.classList.add('alvo'); setTimeout(() => el.classList.remove('alvo'), chegando ? 4000 : 2200);
  }

  // ── Compartilhar um carro: no celular abre o menu do aparelho (WhatsApp incluso); no computador copia ──
  async function compartilhar(botao) {
    const c = D.find((x) => x.id === botao.dataset.id); if (!c) return;
    const url = location.origin + location.pathname + '#carro=' + c.id;
    const tl = textoLaudo(c);
    const laudo = tl ? ` · ${tl.curto}` : '';
    const texto = `Mercedes C 300 ${c.ano} ${c.cor.toLowerCase()}, ${c.km ? milKm(c.km) + ', ' : ''}${c.cid || c.uf}: ${c.preco ? reais(c.preco) : 'preço não informado'}${laudo}${c.leilao ? ' (passou por leilão)' : ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Garimpo Carro', text: texto, url }); } catch (e) { /* a pessoa fechou o menu */ }
      return;
    }
    const antes = botao.textContent;
    try { await navigator.clipboard.writeText(texto + '\n' + url); botao.textContent = 'Link copiado'; }
    catch (e) { window.prompt('Copie o link:', url); }
    setTimeout(() => (botao.textContent = antes), 2200);
  }

  // ── Gaveta da peneira no celular ──
  function gaveta(abrir) {
    const pen = $('#peneira');
    if (abrir) { pen.setAttribute('role', 'dialog'); pen.setAttribute('aria-modal', 'true'); }
    else { pen.removeAttribute('role'); pen.removeAttribute('aria-modal'); }
    ['header.placa', '#livro', 'footer.rodape'].forEach((s) => { const el = $(s); if (el) el.inert = abrir; });
    pen.classList.toggle('aberta', abrir);
    document.body.classList.toggle('peneira-aberta', abrir);
    $('#abre-peneira').setAttribute('aria-expanded', abrir);
    if (abrir) $('#peneira').querySelector('input').focus({ preventScroll: true }); else $('#abre-peneira').focus({ preventScroll: true });
  }

  async function iniciar() {
    let pacote;
    try {
      const r = await fetch('dados.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      pacote = await r.json();
    } catch (e) {
      $('#linhas').innerHTML = '<li class="vazio"><p class="vazio-t">Não deu para carregar a lista.</p><p>Verifique a internet e recarregue a página.</p></li>';
      return;
    }
    D = pacote.carros; ULT = pacote.atualizado;
    $('#h-total').textContent = D.length;
    // o letreiro diz onde garimpamos de verdade, contado dos dados: nunca "Brasil inteiro" sem ser
    const ufs = [...new Set(D.map((c) => c.uf).filter((u) => u && u !== 'Não informado'))];
    $('#h-onde').textContent = ufs.every((u) => ['SP', 'PR', 'SC', 'RS'].includes(u)) ? 'SP e no Sul.' : `${ufs.length} estados.`;
    document.querySelector('.ct-de').textContent = D.length;
    $('#h-data').textContent = new Date(ULT + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#r-fipe').textContent = `código ${pacote.fipe.codigo} (${pacote.fipe.modelo}), referência de ${pacote.fipe.mes}`;
    $('#tabela-mercado tbody').innerHTML = Object.entries(pacote.mercado || {})
      .map(([a, v]) => `<tr><td>${a}</td><td>${v.n}</td><td>− ${reais(v.por10mil)}</td><td>± ${reais(v.variacao)}</td></tr>`).join('');
    $('#tabela-fipe tbody').innerHTML = Object.entries(pacote.fipe.anos).filter(([a]) => D.some((c) => String(c.ano) === a))
      .map(([a, v]) => `<tr><td>${a}</td><td>${reais(v)}</td></tr>`).join('');

    // link de um carro só (#carro=id): lido antes de lerUrl, porque gravarUrl reescreve o endereço
    const carroAlvo = new URLSearchParams(location.hash.slice(1)).get('carro');
    montarChips(); pepitas(); lerUrl(); sincronizarForm(); desenhar();
    if (carroAlvo) document.fonts.ready.then(() => setTimeout(() => irPara(carroAlvo, true), 60));
    $('#linhas').addEventListener('click', (e) => { const b = e.target.closest('.compartilha'); if (b) compartilhar(b); });

    $('#peneira').addEventListener('input', (e) => { if (e.target.id !== 'f-cid') lerForm(); });
    let t; $('#f-cid').addEventListener('input', () => { clearTimeout(t); t = setTimeout(lerForm, 180); });
    $('#ordem').addEventListener('change', (e) => { F.ordem = e.target.value; desenhar(); });
    const limpar = () => { F = { ...PADRAO, ordem: F.ordem }; sincronizarForm(); desenhar(); };
    $('#limpa').addEventListener('click', limpar); $('#limpa2').addEventListener('click', limpar);
    $('#abre-peneira').addEventListener('click', () => gaveta(true));
    $('#fecha-peneira').addEventListener('click', () => gaveta(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#peneira').classList.contains('aberta')) gaveta(false); });
    document.body.addEventListener('click', (e) => { if (document.body.classList.contains('peneira-aberta') && !e.target.closest('#peneira, #abre-peneira')) gaveta(false); });
    $('#pepitas').addEventListener('click', (e) => { const a = e.target.closest('[data-alvo]'); if (a) { e.preventDefault(); irPara(a.dataset.alvo); } });
  }
  iniciar();
})();
