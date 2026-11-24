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
    const queda = baixouRecente(c);
    if (queda) selos.insertAdjacentHTML('beforeend', `<span class="selo baixou">Baixou ${reais(queda)}</span>`);
    if (!selos.children.length) selos.remove();

    const fab = c.fab && c.fab !== String(c.ano) ? `${c.fab}/${c.ano}` : String(c.ano);
    $('.titulo', li).innerHTML = `C 300 ${fab} · ${esc(c.cor)} <small>banco ${esc(c.banco.toLowerCase())}</small>`;
    const onde = c.cid ? `${esc(c.cid)}${c.uf && c.uf !== 'Não informado' ? '/' + c.uf : ''}` : (c.uf !== 'Não informado' ? c.uf : 'Cidade não informada');
    $('.meta', li).innerHTML = [c.km ? `<b>${milKm(c.km)}</b> ${textoKm(c)}` : 'km não informado', onde, `na lista desde ${dataBR(c.dt)}`].join(' · ');

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
    else { ca.classList.add(t.k); ca.textContent = t.titulo; }
    // FIPE em cima do preço: quem lê compara os dois números de cara, e o selo fica só com a %
    const fr = $('.fipe-ref', li);
    if (c.fipe && c.preco) fr.innerHTML = `FIPE ${c.ano} <b>${reais(c.fipe)}</b>`; else fr.remove();

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
  // ── Laudo: só a % contra a FIPE do ano (pedido do Carlos, 23/11/2026) ──
  let KM_MEDIA = {};
  const margem = (c) => (c.dif != null ? c.dif : 9);
  const grupo = (c) => (c.dif == null ? 1 : 0);
  function textoLaudo(c) {
    if (c.dif == null) return null;
    // "Na FIPE" só até R$ 1.000 de diferença, pra mais ou pra menos (Carlos, 23/11/2026).
    // Diferença menor que 1% ganha uma casa decimal, senão viraria "0% abaixo".
    const ref = `FIPE ${c.ano}: ${reais(c.fipe)}`;
    if (Math.abs(c.preco - c.fipe) <= 1000) return { k: 'na', titulo: 'Na FIPE', curto: 'na FIPE', ref };
    const a = Math.abs(c.dif) * 100;
    const p = a < 0.95 ? a.toFixed(1).replace('.', ',') : Math.round(a);
    if (c.dif < 0) return { k: 'abaixo', titulo: `${p}% abaixo da FIPE`, curto: `${p}% abaixo da FIPE`, ref };
    if (c.dif > 0) return { k: 'acima', titulo: `${p}% acima da FIPE`, curto: `${p}% acima da FIPE`, ref };
    return { k: 'na', titulo: 'Na FIPE', curto: 'na FIPE', ref };
  }
  // "20% menos km que a média da 2024 (30 mil km)": abaixo de 5% de diferença conta como na média
  function textoKm(c) {
    const m = KM_MEDIA[c.ano]; if (c.kmrel == null || !m) return '';
    const p = Math.round(Math.abs(c.kmrel) * 100);
    if (p < 5) return `<span class="kmrel">na média de km da ${c.ano}</span>`;
    return c.kmrel < 0
      ? `<span class="kmrel menos" title="Média da ${c.ano}: ${milKm(m)}">${p}% menos km que a média da ${c.ano}</span>`
      : `<span class="kmrel mais" title="Média da ${c.ano}: ${milKm(m)}">${p}% mais km que a média da ${c.ano}</span>`;
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
    const top = D.filter((c) => c.dif != null && c.dif <= -0.02 && !c.leilao && !c.bl && c.capa && !c.al.some((a) => a.k === 'risco'))
      .sort(ORDENS.fipe).slice(0, 3);
    $('#pepitas').innerHTML = top.map((c) => `
      <li class="pepita-item"><a href="#${c.id}" data-alvo="${c.id}">
        <img src="img/${c.id}.jpg" alt="" width="64" height="48">
        <span><b>C 300 ${c.ano} · ${esc(c.cor)}</b><small>${c.km ? milKm(c.km) + ' · ' : ''}${esc(c.cid || c.uf)}${c.cid ? '/' + c.uf : ''}</small></span>
        <span class="pp">${reais(c.preco)}<em class="carimbo abaixo">${Math.round(Math.abs(c.dif) * 100)}% abaixo da FIPE</em></span>
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

  // ── Minas: o que mudou desde a última visita. Cada visitante minera 1x por dia (pedido do Carlos,
  // 24/11/2026). O robô (ferramentas/minas.py) é quem confere os sites; o botão só revela o que ele achou.
  // O limite mora no navegador da pessoa: trocar de navegador "reseta", e tudo bem para o que ele é.
  let MINAS = [];
  const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const lerMinas = () => { try { return JSON.parse(localStorage.getItem('gc-minas')) || null; } catch (e) { return null; } };
  const gravarMinas = (v) => { try { localStorage.setItem('gc-minas', JSON.stringify(v)); } catch (e) { /* aba anônima */ } };
  function baixouRecente(c) {
    if (!c.hist || !c.hist.length || !c.preco) return 0;
    const limite = new Date(ULT + 'T12:00'); limite.setDate(limite.getDate() - 30);
    const h = c.hist.filter((x) => new Date(x.d + 'T12:00') >= limite);
    return h.length && h[0].p > c.preco ? h[0].p - c.preco : 0;
  }
  function estadoBotao() {
    const st = lerMinas(); const b = $('#minas-btn');
    const feito = st && st.dia === hojeLocal();
    b.classList.toggle('feito', !!feito);
    $('#minas-rot').textContent = feito ? 'Minas ✓' : 'Minas';
    const ultimoN = MINAS.length ? MINAS[MINAS.length - 1].n : -1;
    $('#minas-ponto').hidden = feito || (st && st.n >= ultimoN) || !MINAS.length;
    b.setAttribute('aria-label', feito ? 'Minas: você já minerou hoje. Ver o resultado' : 'Minas: ver o que mudou desde sua última visita');
  }
  function itemCarro(c, extra) {
    return `<li class="pepita-item"><a href="#${c.id}" data-alvo="${c.id}">
      ${c.capa ? `<img src="img/${c.id}.jpg" alt="" width="64" height="48">` : '<span></span>'}
      <span><b>C 300 ${c.ano} · ${esc(c.cor)}</b><small>${c.km ? milKm(c.km) + ' · ' : ''}${esc(c.cid || c.uf)}${c.cid ? '/' + c.uf : ''}</small></span>
      <span class="pp">${extra}</span></a></li>`;
  }
  function abrirMinas() {
    let st = lerMinas();
    const primeira = !st;
    const hoje = hojeLocal();
    let de;
    if (st && st.dia === hoje) de = st.de;                     // já minerou hoje: mostra o mesmo resultado
    else {
      // primeira vez: mostra a última semana; depois, tudo que entrou desde a última mineração
      if (st) de = st.n;
      else {
        const sem = new Date(ULT + 'T12:00'); sem.setDate(sem.getDate() - 7);
        de = Math.max(-1, ...MINAS.filter((e) => new Date(e.d + 'T12:00') < sem).map((e) => e.n));
      }
      st = { dia: hoje, de, n: MINAS.length ? MINAS[MINAS.length - 1].n : -1 };
      gravarMinas(st);
      const b = $('#minas-btn'); b.classList.add('cavando'); setTimeout(() => b.classList.remove('cavando'), 1000);
    }
    const ev = MINAS.filter((e) => e.n > de);
    const porId = new Map(D.map((c) => [c.id, c]));
    const novos = ev.filter((e) => e.t === 'novo' && porId.has(e.id)).map((e) => porId.get(e.id)).sort(ORDENS.fipe);
    const baixou = ev.filter((e) => e.t === 'baixou' && porId.has(e.id));
    const saiu = ev.filter((e) => e.t === 'saiu');
    const placar = [[novos.length, novos.length === 1 ? 'carro novo' : 'carros novos', ''], [baixou.length, 'baixaram de preço', ''], [saiu.length, saiu.length === 1 ? 'saiu do ar' : 'saíram do ar', 'saiu']]
      .filter(([n]) => n).map(([n, t, k]) => `<li class="${k}"><b>${n}</b><span>${t}</span></li>`).join('');
    let h = '';
    if (!ev.length) h = '<p class="minas-vazio">A mina não mudou desde a sua última visita. A lista é conferida nos sites aos poucos: volte amanhã.</p>';
    else {
      h += `<ul class="minas-placar">${placar}</ul>`;
      if (baixou.length) h += `<h3>Baixaram de preço</h3><ol class="pepitas-lista">${baixou.map((e) => itemCarro(porId.get(e.id),
        `<s>${reais(e.de)}</s>${reais(e.para)}<em>−${reais(e.de - e.para)}</em>`)).join('')}</ol>`;
      if (novos.length) {
        h += `<h3>Novos na mina</h3><ol class="pepitas-lista">${novos.slice(0, 6).map((c) => itemCarro(c,
          `${c.preco ? reais(c.preco) : '—'}${textoLaudo(c) ? `<em class="carimbo ${textoLaudo(c).k}">${textoLaudo(c).titulo}</em>` : ''}`)).join('')}</ol>`;
        if (novos.length > 6) h += `<button type="button" class="minas-todos" id="minas-todos">Ver os ${novos.length} novos na lista</button>`;
      }
      if (saiu.length) h += `<h3>Saíram do ar</h3><ul class="minas-saiu">${saiu.map((e) =>
        `<li><span><b>C 300 ${e.ano} · ${esc(e.cor)}</b> · ${e.km ? milKm(e.km) + ' · ' : ''}${esc(e.cid || e.uf)}${e.cid ? '/' + e.uf : ''}</span><span>${e.p ? reais(e.p) : ''}</span></li>`).join('')}</ul>`;
    }
    $('#minas-corpo').innerHTML = h;
    const quando = MINAS.length ? dataBR(MINAS[MINAS.length - 1].d) : null;
    $('#minas-sub').textContent = primeira || st.primeira ? 'O que mudou na mina nos últimos 7 dias.' : 'O que mudou desde a sua última mineração.';
    if (primeira) { st.primeira = true; gravarMinas(st); }
    $('#minas-pe').textContent = `Você minera 1 vez por dia: a próxima é amanhã.${quando ? ` Sites conferidos pela última vez em ${quando}.` : ''}`;
    estadoBotao();
    const dlg = $('#minas');
    if (!dlg.open) dlg.showModal();
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
    D = pacote.carros; ULT = pacote.atualizado; MINAS = pacote.minas || [];
    $('#h-total').textContent = D.length;
    // o letreiro diz onde garimpamos de verdade, contado dos dados: nunca "Brasil inteiro" sem ser
    const ufs = [...new Set(D.map((c) => c.uf).filter((u) => u && u !== 'Não informado'))];
    $('#h-onde').textContent = ufs.every((u) => ['SP', 'PR', 'SC', 'RS'].includes(u)) ? 'SP e no Sul.' : `${ufs.length} estados.`;
    document.querySelector('.ct-de').textContent = D.length;
    $('#h-data').textContent = new Date(ULT + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#r-fipe').textContent = `código ${pacote.fipe.codigo} (${pacote.fipe.modelo}), referência de ${pacote.fipe.mes}`;
    KM_MEDIA = pacote.km_media || {};
    $('#tabela-fipe tbody').innerHTML = Object.entries(pacote.fipe.anos).filter(([a]) => D.some((c) => String(c.ano) === a))
      .map(([a, v]) => `<tr><td>${a}</td><td>${reais(v)}</td><td>${KM_MEDIA[a] ? milKm(KM_MEDIA[a]) : '—'}</td></tr>`).join('');

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

    estadoBotao();
    $('#minas-btn').addEventListener('click', abrirMinas);
    $('#minas-fecha').addEventListener('click', () => $('#minas').close());
    $('#minas').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {                                                 // clique fora da caixa fecha
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { e.currentTarget.close(); return; }
      }
      const a = e.target.closest('[data-alvo]');
      if (a) { e.preventDefault(); $('#minas').close(); irPara(a.dataset.alvo); return; }
      if (e.target.id === 'minas-todos') { $('#minas').close(); F = { ...PADRAO, ordem: 'recentes' }; sincronizarForm(); desenhar(); $('#livro').scrollIntoView({ behavior: 'smooth' }); }
    });
  }
  iniciar();
})();
