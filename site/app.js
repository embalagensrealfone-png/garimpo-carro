// Garimpo Carro — a peneira roda toda no navegador: são menos de 200 carros, 80 KB de dados.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const reais = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const milKm = (v) => (v >= 1000 ? Math.round(v / 1000) + ' mil' : v) + ' km';
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  let D = [], ULT = '';
  const PADRAO = { semLeilao: true, bl: 'todos', ano: [], uf: [], cor: [], banco: [], site: [], nov: [], vend: [], pmin: 0, pmax: 0, kmin: 0, kmax: 0, cid: '', ordem: 'fipe' };
  const LISTAS = ['ano', 'uf', 'cor', 'banco', 'site', 'nov', 'vend'];
  let F = { ...PADRAO };

  // ── Estado na URL: quem compartilha o link manda a peneira junto ──
  function lerUrl() {
    const p = new URLSearchParams(location.hash.slice(1));
    const lista = (k) => (p.get(k) ? p.get(k).split(',') : []);
    F = {
      ...PADRAO,
      semLeilao: p.get('leilao') !== '1',
      bl: p.get('bl') || 'todos',
      ...Object.fromEntries(LISTAS.map((k) => [k, lista(k)])),
      // 'preco' e 'km' são o máximo (links antigos e a busca da página inicial usam esses nomes)
      pmin: +p.get('pmin') || 0, pmax: +p.get('preco') || 0,
      kmin: +p.get('kmin') || 0, kmax: +p.get('km') || 0,
      cid: p.get('cid') || '',
      ordem: p.get('ordem') || 'fipe',
    };
  }
  function gravarUrl() {
    const p = new URLSearchParams();
    if (!F.semLeilao) p.set('leilao', '1');
    if (F.bl !== 'todos') p.set('bl', F.bl);
    for (const k of LISTAS) if (F[k].length) p.set(k, F[k].join(','));
    if (F.pmin) p.set('pmin', F.pmin);
    if (F.pmax) p.set('preco', F.pmax);
    if (F.kmin) p.set('kmin', F.kmin);
    if (F.kmax) p.set('km', F.kmax);
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
    // dentro de cada grupo de chips vale "qualquer um destes"; entre grupos, todos juntos
    for (const [k, g] of Object.entries(GRUPOS)) {
      if (k !== ignorar && F[k].length && ![].concat(g.val(c)).some((v) => F[k].includes(v))) return false;
    }
    // preço/km não informado não é "barato": só entra quando a peneira dele está aberta
    if ((F.pmin || F.pmax) && !(c.preco > 0 && c.preco >= F.pmin && (!F.pmax || c.preco <= F.pmax))) return false;
    if ((F.kmin || F.kmax) && !(c.km > 0 && c.km >= F.kmin && (!F.kmax || c.km <= F.kmax))) return false;
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
    $('.meta', li).innerHTML = [c.km ? `<b>${milKm(c.km)}</b> ${textoKm(c)}` : 'km não informado', onde].join(' · ') + `<span class="desde"> · na lista desde ${dataBR(c.dt)}</span>`;

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
    marcarRapidos(); marcarPerto();
    gravarUrl();
  }

  // ── Chips com contagem: cada opção diz quantos carros sobrariam ──
  const GRUPOS = {
    ano: { el: '#f-ano', val: (c) => String(c.ano), ord: (a, b) => a - b },
    uf: { el: '#f-uf', val: (c) => c.uf, ord: (a, b) => (a === 'Não informado') - (b === 'Não informado') || a.localeCompare(b) },
    cor: { el: '#f-cor', val: (c) => c.cor, ord: null },
    banco: { el: '#f-banco', val: (c) => c.banco, ord: null },
    site: { el: '#f-site', val: (c) => [...new Set(c.links.map((l) => l.s))], ord: null },
    nov: { el: '#f-nov', val: novidades, ord: (a, b) => a.localeCompare(b) * -1, rot: { novo: 'Novos na última conferida', baixou: 'Baixou de preço' } },
    vend: { el: '#f-vend', val: vendedor, ord: null, rot: { dono: 'Único dono', garantia: 'Com garantia' } },
  };
  function novidades(c) {
    const t = [];
    if (c.dt === ULT) t.push('novo');                 // mesmo critério do selo "Novo · dd/mm"

    if (baixouRecente(c)) t.push('baixou');
    return t;
  }
  function vendedor(c) {
    const t = [], txt = c.al.map((a) => a.t).join(' ');
    if (/único dono/i.test(txt)) t.push('dono');
    if (/garantia/i.test(txt)) t.push('garantia');
    return t;
  }
  function montarChips() {
    for (const [k, g] of Object.entries(GRUPOS)) {
      const cont = {};
      D.forEach((c) => [].concat(g.val(c)).forEach((v) => { cont[v] = (cont[v] || 0) + 1; }));
      let vals = Object.keys(cont);
      vals = g.ord ? vals.sort(g.ord) : vals.sort((a, b) => cont[b] - cont[a]);
      $(g.el).innerHTML = vals.map((v) => `<label><input type="checkbox" name="${k}" value="${esc(v)}"><span>${esc(g.rot ? g.rot[v] : v)} <small data-n></small></span></label>`).join('');
      $(g.el).closest('fieldset').hidden = !vals.length;
    }
  }
  function contarChips() {
    for (const [k, g] of Object.entries(GRUPOS)) {
      const base = D.filter((c) => passa(c, k));
      const cont = {};
      base.forEach((c) => [].concat(g.val(c)).forEach((v) => { cont[v] = (cont[v] || 0) + 1; }));
      $(g.el).querySelectorAll('input').forEach((i) => { i.nextElementSibling.querySelector('[data-n]').textContent = cont[i.value] || 0; });
    }
  }

  function sincronizarForm() {
    const f = $('#peneira');
    f.semLeilao.checked = F.semLeilao;
    f.querySelectorAll('input[name=bl]').forEach((r) => (r.checked = r.value === F.bl));
    for (const k of Object.keys(GRUPOS)) f.querySelectorAll(`input[name=${k}]`).forEach((i) => (i.checked = F[k].includes(i.value)));
    for (const k of ['pmin', 'pmax', 'kmin', 'kmax']) faixaValor($('#f-' + k), F[k]);
    $('#f-cid').value = F.cid; $('#ordem').value = F.ordem;
  }
  // valor que veio de link e não está na lista de opções (ex.: 255.000) ganha opção própria
  function faixaValor(sel, v) {
    if (v && ![...sel.options].some((o) => +o.value === v)) {
      const ehPreco = /p(min|max)/.test(sel.id);
      sel.add(new Option(ehPreco ? reais(v) : milKm(v), v));
      [...sel.options].slice(1).sort((a, b) => a.value - b.value).forEach((o) => sel.add(o));
    }
    sel.value = v || '';
  }
  function montarFaixas() {
    const passo = (lo, hi, p) => { const r = []; for (let v = Math.ceil(lo / p) * p; v <= hi; v += p) r.push(v); return r; };
    const precos = D.map((c) => c.preco).filter(Boolean), kms = D.map((c) => c.km).filter(Boolean);
    const P = passo(Math.min(...precos), Math.max(...precos) + 10000, 10000), K = passo(0, Math.max(...kms) + 5000, 5000).filter((v) => v);
    const encher = (id, vals, fmt, vazio) => { const s = $(id); s.innerHTML = ''; s.add(new Option(vazio, '')); vals.forEach((v) => s.add(new Option(fmt(v), v))); };
    encher('#f-pmin', P, reais, 'de qualquer'); encher('#f-pmax', P, reais, 'até qualquer');
    encher('#f-kmin', K, milKm, 'de 0 km'); encher('#f-kmax', K, milKm, 'até qualquer');
  }

  // ── Filtros rápidos: um toque liga, outro desliga; o estado sai sempre de F (mesmo da peneira) ──
  const iguais = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  const alterna = (k, v) => { F[k] = F[k].includes(v) ? F[k].filter((x) => x !== v) : [...F[k], v]; };
  let PERTO = null; try { PERTO = JSON.parse(sessionStorage.getItem('gc-perto')); } catch (e) { /* sem acesso */ }
  const RAPIDOS = [
    { id: 'perto', rot: () => (PERTO ? `Perto de mim · ${PERTO.join(', ')}` : 'Perto de mim'), on: () => PERTO && iguais(F.uf, PERTO),
      toca: () => { if (PERTO && iguais(F.uf, PERTO)) F.uf = []; else return pertoDeMim(); } },
    { id: 'p300', rot: () => 'Até R$ 300 mil', on: () => F.pmax === 300000 && !F.pmin, toca: () => { if (F.pmax === 300000 && !F.pmin) F.pmax = 0; else { F.pmax = 300000; F.pmin = 0; } } },
    { id: 'a24', rot: () => '2024 ou mais', on: () => F.ano.length && iguais(F.ano, anosDesde(2024)), toca: () => { F.ano = iguais(F.ano, anosDesde(2024)) ? [] : anosDesde(2024); } },
    { id: 'km30', rot: () => 'Até 30 mil km', on: () => F.kmax === 30000 && !F.kmin, toca: () => { if (F.kmax === 30000 && !F.kmin) F.kmax = 0; else { F.kmax = 30000; F.kmin = 0; } } },
    { id: 'dono', rot: () => 'Único dono', on: () => F.vend.includes('dono'), toca: () => alterna('vend', 'dono') },
    { id: 'baixou', rot: () => 'Baixou de preço', on: () => F.nov.includes('baixou'), toca: () => alterna('nov', 'baixou') },
    { id: 'novo', rot: () => 'Novos', on: () => F.nov.includes('novo'), toca: () => alterna('nov', 'novo') },
  ];
  const anosDesde = (a) => [...new Set(D.map((c) => c.ano).filter((x) => x >= a))].sort().map(String);
  function montarRapidos() {
    $('#rapidos').innerHTML = RAPIDOS.map((r) => `<button type="button" data-r="${r.id}" aria-pressed="false">${r.id === 'perto' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="9.5" r="2.4" fill="currentColor"/></svg>' : ''}<span></span></button>`).join('');
    $('#rapidos').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = RAPIDOS.find((x) => x.id === b.dataset.r);
      await r.toca(); sincronizarForm(); desenhar();
    });
  }
  function marcarRapidos() {
    $('#rapidos').querySelectorAll('[data-r]').forEach((b) => {
      const r = RAPIDOS.find((x) => x.id === b.dataset.r);
      b.setAttribute('aria-pressed', r.on() ? 'true' : 'false');
      $('span', b).textContent = r.rot();
    });
    // quantos filtros estão ligados, no botão da peneira (celular)
    const n = LISTAS.reduce((s, k) => s + (F[k].length ? 1 : 0), 0) + (F.pmin || F.pmax ? 1 : 0) + (F.kmin || F.kmax ? 1 : 0)
      + (F.cid ? 1 : 0) + (F.bl !== 'todos' ? 1 : 0) + (F.semLeilao ? 0 : 1);
    const pn = $('#pen-n'); pn.hidden = !n; pn.textContent = n;
    $('#abre-peneira').setAttribute('aria-label', n ? `Peneira, ${n} filtro${n > 1 ? 's' : ''} ligado${n > 1 ? 's' : ''}` : 'Peneira');
  }

  // ── Perto de mim: a localização fica no aparelho. Achamos a capital mais próxima e as que estão a
  // até 500 km dela, sem mandar a posição para nenhum serviço de fora ──
  const CAPITAIS = { AC: [-9.97, -67.81], AL: [-9.67, -35.74], AP: [0.03, -51.07], AM: [-3.12, -60.02], BA: [-12.97, -38.5], CE: [-3.73, -38.53],
    DF: [-15.79, -47.88], ES: [-20.32, -40.34], GO: [-16.69, -49.26], MA: [-2.53, -44.3], MT: [-15.6, -56.1], MS: [-20.47, -54.62], MG: [-19.92, -43.94],
    PA: [-1.46, -48.49], PB: [-7.12, -34.86], PR: [-25.43, -49.27], PE: [-8.05, -34.9], PI: [-5.09, -42.8], RJ: [-22.91, -43.17], RN: [-5.79, -35.21],
    RS: [-30.03, -51.23], RO: [-8.76, -63.9], RR: [2.82, -60.67], SC: [-27.6, -48.55], SP: [-23.55, -46.63], SE: [-10.91, -37.07], TO: [-10.18, -48.33] };
  function km(a, b) {
    const r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }
  function pertoDeMim() {
    const b = $('#rapidos [data-r=perto] span'), bp = $('#f-perto');
    const aviso = (t) => { [b, bp].forEach((el) => el && (el.textContent = t)); setTimeout(() => { marcarRapidos(); marcarPerto(); }, 2600); };
    if (!navigator.geolocation) { aviso('Sem localização neste aparelho'); return Promise.resolve(); }
    [b, bp].forEach((el) => el && (el.textContent = 'Procurando você…'));
    return new Promise((ok) => navigator.geolocation.getCurrentPosition((pos) => {
      const eu = [pos.coords.latitude, pos.coords.longitude];
      const dist = Object.entries(CAPITAIS).map(([uf, c]) => [uf, km(eu, c)]).sort((x, y) => x[1] - y[1]);
      PERTO = dist.filter(([, d], i) => i === 0 || d <= 500).map(([uf]) => uf);
      try { sessionStorage.setItem('gc-perto', JSON.stringify(PERTO)); } catch (e) { /* aba anônima */ }
      F.uf = PERTO.slice(); ok();
    }, (err) => { aviso(err.code === 1 ? 'Localização bloqueada' : 'Não achei sua localização'); ok(); }, { timeout: 12000, maximumAge: 600000 }));
  }
  function marcarPerto() {
    const bp = $('#f-perto'); if (!bp) return;
    const on = PERTO && iguais(F.uf, PERTO);
    bp.setAttribute('aria-pressed', on ? 'true' : 'false');
    bp.textContent = PERTO ? `Perto de mim · ${PERTO.join(', ')}` : 'Perto de mim';
  }

  function lerForm() {
    const f = $('#peneira');
    F.semLeilao = f.semLeilao.checked;
    F.bl = f.querySelector('input[name=bl]:checked').value;
    for (const k of Object.keys(GRUPOS)) F[k] = [...f.querySelectorAll(`input[name=${k}]:checked`)].map((i) => i.value);
    for (const k of ['pmin', 'pmax', 'kmin', 'kmax']) F[k] = +$('#f-' + k).value || 0;
    F.cid = $('#f-cid').value.trim();
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
  // ── Alerta no WhatsApp: o site é estático, então o pedido vai por mensagem para o nosso número, com a
  //    peneira escrita e um código no fim. O Carlos cadastra com ferramentas/alertas.py, e depois de cada
  //    Minas o mesmo script monta as mensagens de quem tem novidade. ──
  const WHATS = '5548991740811';
  function resumoPeneira() {
    const faixa = (a, b, f) => (a && b ? `${f(a)} a ${f(b)}` : a ? `a partir de ${f(a)}` : `até ${f(b)}`);
    const nomes = (k) => F[k].map((v) => (GRUPOS[k].rot ? GRUPOS[k].rot[v] : v)).join(', ');
    const r = [];
    r.push(['Ano', F.ano.length ? [...F.ano].sort().join(', ') : 'qualquer']);
    r.push(['Preço', F.pmin || F.pmax ? faixa(F.pmin, F.pmax, reais) : 'qualquer']);
    r.push(['Km', F.kmin || F.kmax ? faixa(F.kmin, F.kmax, (v) => v.toLocaleString('pt-BR')) : 'qualquer']);
    r.push(['Estados', F.uf.length ? F.uf.join(', ') : 'Brasil todo']);
    if (F.cid) r.push(['Cidade', F.cid]);
    if (F.cor.length) r.push(['Cor', nomes('cor')]);
    if (F.banco.length) r.push(['Banco', nomes('banco')]);
    if (F.vend.length) r.push(['Vendedor', nomes('vend')]);
    if (F.site.length) r.push(['Site', nomes('site')]);
    if (F.bl !== 'todos') r.push(['Blindagem', F.bl === 'sim' ? 'só blindados' : 'sem blindagem']);
    r.push(['Leilão', F.semLeilao ? 'sem carro de leilão' : 'inclui leilão']);
    return r;
  }
  function codigoPeneira(av) {
    const p = new URLSearchParams();
    for (const k of ['ano', 'uf', 'cor', 'banco', 'site', 'vend']) if (F[k].length) p.set(k, F[k].join(','));
    if (F.pmin) p.set('pmin', F.pmin);
    if (F.pmax) p.set('preco', F.pmax);
    if (F.kmin) p.set('kmin', F.kmin);
    if (F.kmax) p.set('km', F.kmax);
    if (F.cid) p.set('cid', F.cid);
    if (F.bl !== 'todos') p.set('bl', F.bl);
    if (!F.semLeilao) p.set('leilao', '1');
    p.set('av', av.join(','));
    return decodeURIComponent(p.toString());
  }
  function abrirAlerta() {
    $('#alerta-resumo').innerHTML = resumoPeneira().map(([k, v]) => `<li><b>${esc(k)}</b> ${esc(v)}</li>`).join('');
    $('#alerta-erro').hidden = true;
    $('#alerta').showModal();
  }
  function pedirAlerta() {
    const av = [$('#alerta-novo').checked && 'novo', $('#alerta-baixou').checked && 'baixou'].filter(Boolean);
    $('#alerta-erro').hidden = !!av.length;
    if (!av.length) return;
    const linhas = ['Quero receber alerta da C 300 pelo Garimpo Carro:',
      ...resumoPeneira().map(([k, v]) => `• ${k}: ${v}`),
      `• Avisar: ${av.map((a) => (a === 'novo' ? 'carro novo' : 'baixa de preço')).join(' e ')}`,
      '', `(código do alerta: ${codigoPeneira(av)})`];
    window.open(`https://wa.me/${WHATS}?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank', 'noopener');
    $('#alerta').close();
  }

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
    montarChips(); montarFaixas(); montarRapidos(); pepitas(); lerUrl(); sincronizarForm(); desenhar();
    if (carroAlvo) document.fonts.ready.then(() => setTimeout(() => irPara(carroAlvo, true), 60));
    $('#linhas').addEventListener('click', (e) => { const b = e.target.closest('.compartilha'); if (b) compartilhar(b); });

    $('#peneira').addEventListener('input', (e) => { if (e.target.id !== 'f-cid') lerForm(); });
    let t; $('#f-cid').addEventListener('input', () => { clearTimeout(t); t = setTimeout(lerForm, 180); });
    $('#ordem').addEventListener('change', (e) => { F.ordem = e.target.value; desenhar(); });
    const limpar = () => { F = { ...PADRAO, ordem: F.ordem }; sincronizarForm(); desenhar(); };
    $('#limpa').addEventListener('click', limpar); $('#limpa2').addEventListener('click', limpar);
    $('#abre-peneira').addEventListener('click', () => gaveta(true));
    $('#f-perto').addEventListener('click', async () => {
      if (PERTO && iguais(F.uf, PERTO)) F.uf = []; else await pertoDeMim();
      sincronizarForm(); desenhar();
    });
    $('#fecha-peneira').addEventListener('click', () => gaveta(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#peneira').classList.contains('aberta')) gaveta(false); });
    document.body.addEventListener('click', (e) => { if (document.body.classList.contains('peneira-aberta') && !e.target.closest('#peneira, #abre-peneira')) gaveta(false); });
    $('#pepitas').addEventListener('click', (e) => { const a = e.target.closest('[data-alvo]'); if (a) { e.preventDefault(); irPara(a.dataset.alvo); } });

    estadoBotao();
    $('#minas-btn').addEventListener('click', abrirMinas);
    $('#alerta-btn').addEventListener('click', abrirAlerta);
    $('#alerta-btn2').addEventListener('click', abrirAlerta);
    $('#alerta-fecha').addEventListener('click', () => $('#alerta').close());
    $('#alerta').addEventListener('click', (e) => { if (e.target.id === 'alerta') $('#alerta').close(); });
    $('#alerta-ir').addEventListener('click', pedirAlerta);
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
