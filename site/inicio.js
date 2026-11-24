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
})();
