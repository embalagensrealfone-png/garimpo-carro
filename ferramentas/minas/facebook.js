// Conferência do Facebook Marketplace. Roda DENTRO do Chrome do Carlos (extensão Claude in Chrome), numa
// aba aberta em https://www.facebook.com/marketplace/ com a conta dele logada. O Facebook não tem busca
// que o robô consiga ler, então aqui só conferimos, um por um, os anúncios que já estão na lista:
// se ainda está no ar, o preço, a km, a cor e a cidade. Iframe e fetch não trazem os dados do anúncio;
// por isso cada um abre numa janela ("fbler") que o script lê.
// Passo a passo completo: ferramentas/minas/COMO-RODAR.md
window.fbminas = {
  // 1) window._f = {item: 1} vem de `python3 ferramentas/minas.py facebook` (colar antes)
  conferir() {
    this.r = this.r || {};
    this.fim = false;
    (async () => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      let w = null;
      for (const id of Object.keys(_f)) {
        if (this.r[id]) continue;
        w = window.open('/marketplace/item/' + id + '/', 'fbler');
        let t = '', sumiu = false;
        for (let i = 0; i < 25; i++) {
          await espera(800);
          try {
            // anúncio removido: o Facebook redireciona para /marketplace/...?unavailable_product=1
            if (/unavailable_product=1/.test(w.location.href)) { sumiu = true; break; }
            if (!w.location.href.includes(id)) continue;          // ainda mostrando o anúncio anterior
            t = w.document.body.innerText.replace(/\s+/g, ' ');
          } catch (e) { t = ''; }
          if (/km rodados|Descrição do vendedor/.test(t) && /R\$/.test(t)) break;
          if (/não está mais disponível|não está disponível|indisponível|Este anúncio foi removido/i.test(t)) break;
        }
        const fora = sumiu || /não está mais disponível|não está disponível|indisponível|Este anúncio foi removido/i.test(t.slice(0, 4000));
        const km = (t.match(/([\d.]+) km rodados/) || [])[1] || '';
        const desc = (t.match(/Descrição do vendedor (.{0,400})/) || [])[1] || '';
        const kmDesc = (desc.match(/([\d]{1,3}(?:\.\d{3})+|\d{4,6}) ?km/i) || [])[1] || '';
        const lugar = t.match(/Anunciado há .{1,30}? em ([^,]+), (\w\w)\b/) || [];
        this.r[id] = {
          fora: fora ? '1' : (km || /R\$/.test(t) ? '0' : 'E'),          // E = não conseguiu ler
          km: km.replace(/\./g, ''),                                      // km do campo "km rodados"
          kmd: kmDesc.replace(/\./g, ''),                                 // km escrita na descrição (o minas.py escolhe)
          cor: (t.match(/Cor externa: (\w+)/) || [])[1] || '',
          p: ((t.match(/R\$\s?([\d.]+)/) || [])[1] || '').replace(/\./g, ''),
          cid: lugar[1] || '', uf: lugar[2] || '',
          ano: (t.match(/\b(20\d\d) Mercedes/i) || [])[1] || '',
        };
      }
      if (w) w.close();
      this.fim = true;
    })();
    return 'conferindo ' + Object.keys(_f).length + ' anúncios (uns 6 s cada)';
  },
  // 2) chame até vir "N de N · pronto"
  andamento() { return Object.keys(this.r || {}).length + ' de ' + Object.keys(_f).length + (this.fim ? ' · pronto' : ''); },
  // 3) resultado em fatias de 12 linhas (a extensão corta a resposta em ~1.000 letras): fbminas.fatia(0), fbminas.fatia(1)… até vir vazio
  fatia(n) {
    const l = Object.entries(this.r).map(([id, x]) => ['F', id, x.fora, x.km, x.kmd, x.cor.slice(0, 6), x.p, x.cid.slice(0, 16), x.uf, x.ano].join('|'));
    return l.slice(n * 12, n * 12 + 12).join('\n');
  },
};
'conferidor pronto';
