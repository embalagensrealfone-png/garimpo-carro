// Página inicial: os números das placas saem dos dados de verdade (nunca número inventado),
// e a vitrine gira sozinha devagar, parando quando a pessoa mexe nela.
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const trilho = $('#trilho');
  const banners = [...trilho.children];
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Pontos e setas ──
  banners.forEach((b, i) => {
    const p = document.createElement('button');
    p.type = 'button'; p.setAttribute('aria-label', `Placa ${i + 1} de ${banners.length}`);
    p.addEventListener('click', () => { ir(i); parar(); });
    $('#pontos').append(p);
  });
  const pontos = [...$('#pontos').children];
  let atual = 0;
  function ir(i) {
    atual = (i + banners.length) % banners.length;
    trilho.scrollTo({ left: banners[atual].offsetLeft - trilho.offsetLeft, behavior: reduzir ? 'auto' : 'smooth' });
  }
  // o deslizar com o dedo também conta: o ponto aceso segue a placa que está na tela
  const obs = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (e.intersectionRatio > 0.6) {
      atual = banners.indexOf(e.target);
      pontos.forEach((p, i) => p.setAttribute('aria-current', i === atual ? 'true' : 'false'));
    }
  }), { root: trilho, threshold: [0.6] });
  banners.forEach((b) => obs.observe(b));

  $('#ant').addEventListener('click', () => { ir(atual - 1); parar(); });
  $('#prox').addEventListener('click', () => { ir(atual + 1); parar(); });
  trilho.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); parar(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); parar(); }
  });

  // ── Gira sozinha a cada 6,5 s; mouse em cima, foco ou toque param ──
  let timer = null, parado = reduzir;
  const girar = () => { if (!parado && !timer) timer = setInterval(() => ir(atual + 1), 6500); };
  const pausar = () => { clearInterval(timer); timer = null; };
  function parar() { parado = true; pausar(); }
  const vit = $('.vitrine');
  vit.addEventListener('mouseenter', pausar);
  vit.addEventListener('mouseleave', girar);
  vit.addEventListener('focusin', pausar);
  vit.addEventListener('focusout', girar);
  trilho.addEventListener('touchstart', parar, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? pausar() : girar()));
  girar();

  // ── Números das placas e do cartão do modelo ──
  fetch('dados.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => {
    const C = d.carros;
    const n = {
      carros: C.length,
      sites: new Set(C.flatMap((c) => c.links.map((l) => l.s))).size,
      links: C.reduce((s, c) => s + c.links.length, 0),
      alertas: C.filter((c) => c.leilao || c.bl || c.al.some((a) => a.k === 'risco')).length,
      // mesma regra do carimbo: até R$ 1.000 de diferença é "Na FIPE", não "abaixo"
      abaixo: C.filter((c) => c.fipe && c.preco && c.fipe - c.preco > 1000).length,
    };
    const semana = new Date(d.atualizado + 'T12:00'); semana.setDate(semana.getDate() - 7);
    n.novos = (d.minas || []).filter((e) => new Date(e.d + 'T12:00') >= semana).length;
    document.querySelectorAll('[data-n]').forEach((el) => { if (n[el.dataset.n] != null) el.textContent = n[el.dataset.n].toLocaleString('pt-BR'); });
    $('#m-total').textContent = C.length;
    $('#m-ufs').textContent = new Set(C.map((c) => c.uf).filter((u) => u && u !== 'Não informado')).size;
    // foto do cartão: a melhor pepita do dia (mais abaixo da FIPE, sem risco, com capa)
    // (pula foto com faixa branca dos lados, que no cartão largo fica feia)
    const tops = C.filter((c) => c.capa && c.dif != null && !c.leilao && !c.bl && !c.al.some((a) => a.k === 'risco'))
      .sort((a, b) => a.dif - b.dif).slice(0, 12);
    const branca = (img) => {
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      return [[3, 0.3], [3, 0.7], [cv.width - 4, 0.3], [cv.width - 4, 0.7]].some(([px, py]) => {
        const p = x.getImageData(px, Math.round(cv.height * py), 1, 1).data;
        return p[0] > 240 && p[1] > 240 && p[2] > 240;
      });
    };
    (function tenta(i) {
      if (i >= tops.length) return;
      const img = new Image();
      img.onload = () => { try { if (branca(img)) return tenta(i + 1); } catch (e) { /* segue com essa */ } $('#modelo-foto').src = img.src; };
      img.onerror = () => tenta(i + 1);
      img.src = `img/${tops[i].id}.jpg`;
    })(0);
  }).catch(() => { /* sem dados, as placas ficam com o texto e o traço */ });

  // ── Pedido de garimpo: marca → modelo → versão saem da tabela FIPE (catalogo.json) ──
  const WHATS = '5548991740811'; // número da empresa com DDI e DDD, só dígitos (ex.: 5548999999999)
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const bm = $('#b-marca'), bmod = $('#b-modelo'), bv = $('#b-versao');
  const de = $('#b-ano-de'), ate = $('#b-ano-ate'), erro = $('#b-erro'), botao = $('#b-ir');
  const opc = (sel, lista, primeira) => {
    sel.innerHTML = '';
    if (primeira) sel.add(new Option(primeira, ''));
    lista.forEach((v) => sel.add(new Option(v, v)));
  };
  const anoAgora = new Date().getFullYear() + 1;
  const anos = []; for (let a = anoAgora; a >= 2010; a--) anos.push(String(a));
  opc(de, anos.slice().reverse(), 'de'); opc(ate, anos, 'até');

  $('#b-ufs').innerHTML = UFS.map((u) => `<label><input type="checkbox" value="${u}"><span>${u}</span></label>`).join('');
  const ufsMarcadas = () => [...document.querySelectorAll('#b-ufs input:checked')].map((i) => i.value);
  $('#b-ufs').addEventListener('change', () => {
    const u = ufsMarcadas();
    $('#b-estados-rot').textContent = u.length ? (u.length > 6 ? `${u.length} estados` : u.join(', ')) : 'Brasil todo';
  });

  let CAT = {};
  fetch('catalogo.json').then((r) => r.json()).then((c) => {
    CAT = c; opc(bm, Object.keys(c), 'Escolha a marca');
  }).catch(() => opc(bm, [], 'Não carregou, recarregue a página'));
  bm.addEventListener('change', () => {
    const mods = bm.value ? Object.keys(CAT[bm.value]) : [];
    opc(bmod, mods, bm.value ? 'Escolha o modelo' : 'Escolha a marca'); bmod.disabled = !bm.value;
    opc(bv, [], 'Qualquer versão'); bv.disabled = true; modo();
  });
  bmod.addEventListener('change', () => {
    opc(bv, bmod.value ? CAT[bm.value][bmod.value] : [], 'Qualquer versão'); bv.disabled = !bmod.value; modo();
  });
  bv.addEventListener('change', modo);

  // a C 300 AMG Line já está garimpada: em vez de pedir, abre a lista com a peneira pronta
  const ehC300 = () => bm.value === 'Mercedes-Benz' && bmod.value === 'C 300' && (!bv.value || /AMG Line/.test(bv.value));
  function modo() { botao.textContent = ehC300() ? 'Ver as C 300 já garimpadas' : 'Pedir garimpo no WhatsApp'; }

  const reais = (el) => +el.value.replace(/\D/g, '') || 0;
  [$('#b-pmin'), $('#b-pmax')].forEach((el) => el.addEventListener('input', () => {
    const v = reais(el); el.value = v ? v.toLocaleString('pt-BR') : '';
  }));

  $('#busca').addEventListener('submit', (e) => {
    e.preventDefault();
    const a1 = +de.value || 0, a2 = +ate.value || 0, p1 = reais($('#b-pmin')), p2 = reais($('#b-pmax'));
    let msg = '';
    if (!bm.value) msg = 'Escolha a marca.';
    else if (!bmod.value) msg = 'Escolha o modelo.';
    else if (a1 && a2 && a1 > a2) msg = 'O ano inicial está depois do final.';
    else if (p1 && p2 && p1 > p2) msg = 'O preço mínimo está acima do máximo.';
    erro.hidden = !msg; erro.textContent = msg;
    if (msg) return;
    const ufs = ufsMarcadas();

    if (ehC300()) {
      const q = new URLSearchParams();
      const lista = [2022, 2023, 2024, 2025].filter((a) => (!a1 || a >= a1) && (!a2 || a <= a2));
      if (lista.length && lista.length < 4) q.set('ano', lista.join(','));
      if (ufs.length) q.set('uf', ufs.join(','));
      if (p2) q.set('preco', p2);
      location.href = 'c300.html' + (q.toString() ? '#' + q : '');
      return;
    }
    const brl = (v) => 'R$ ' + v.toLocaleString('pt-BR');
    const linhas = [
      'Olá! Quero um garimpo pelo Garimpo Carro:',
      `• Carro: ${bm.value} ${bmod.value}${bv.value ? ' ' + bv.value : ''}`,
      `• Ano: ${a1 && a2 ? (a1 === a2 ? a1 : `${a1} a ${a2}`) : a1 ? `de ${a1} em diante` : a2 ? `até ${a2}` : 'qualquer'}`,
      `• Preço: ${p1 && p2 ? `${brl(p1)} a ${brl(p2)}` : p1 ? `a partir de ${brl(p1)}` : p2 ? `até ${brl(p2)}` : 'qualquer'}`,
      `• Estados: ${ufs.length ? ufs.join(', ') : 'Brasil todo'}`,
    ];
    window.open(`https://wa.me/${WHATS}?text=${encodeURIComponent(linhas.join('\n'))}`, '_blank', 'noopener');
  });
})();
