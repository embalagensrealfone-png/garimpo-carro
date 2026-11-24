// Coletor do Webmotors. Roda DENTRO do Chrome do Carlos (extensão Claude in Chrome), numa aba aberta em
// https://www.webmotors.com.br/carros/estoque/mercedes-benz/c-300/20-eq-boost-hibrido-amg-line-9g-tronic?tipoveiculo=carros&marca1=mercedes-benz&modelo1=c-300&versao1=20-eq-boost-hibrido-amg-line-9g-tronic&page=1
// (o Webmotors barra robô fora de um navegador de verdade). A resposta da extensão volta cortada em
// ~1.000 letras, então o coletor guarda tudo na página e devolve em fatias pequenas.
// Passo a passo completo: ferramentas/minas/COMO-RODAR.md
window.minas = {
  // 1) lê todas as páginas da busca (Brasil todo) num iframe escondido
  async coletar() {
    const BUSCA = location.href.split('&page=')[0] + '&page=';
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const ler = (doc) => {
      const out = new Map();
      for (const a of doc.querySelectorAll('a[href*="/comprar/mercedes-benz/c-300/"]')) {
        const u = a.href.split('?')[0]; if (out.has(u)) continue;
        let c = a; for (let k = 0; k < 8 && c && !/R\$/.test(c.innerText || ''); k++) c = c.parentElement;
        const t = c ? c.innerText.replace(/\s+/g, ' ') : '';
        const m = t.match(/(\d{4})\/(\d{4}) • ([\d.]+) Km (.+?) \((\w\w)\) R\$ ([\d.]+)/); if (!m) continue;
        const img = c.querySelector('img[src^="http"]');
        out.set(u, { id: u.split('/').pop(), u, ano: +m[2], km: +m[3].replace(/\./g, ''), cid: m[4].trim(), uf: m[5],
                     p: +m[6].replace(/\./g, ''), img: img ? img.src.split('?')[0] : '' });
      }
      return out;
    };
    const todos = new Map();
    for (let pag = 1; pag <= 15; pag++) {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-3000px;width:1300px;height:2000px'; f.src = BUSCA + pag; document.body.appendChild(f);
      await new Promise((r) => (f.onload = r));
      let achados = new Map();
      for (let i = 0; i < 15; i++) {
        await espera(800); f.contentWindow.scrollTo(0, f.contentDocument.body.scrollHeight);
        const agora = ler(f.contentDocument); if (agora.size && agora.size === achados.size) break; achados = agora;
      }
      f.remove();
      const antes = todos.size; achados.forEach((v, k) => todos.set(k, v));
      if (!achados.size || todos.size === antes) break;
    }
    this.todos = [...todos.values()];
    return this.todos.length + ' anúncios';
  },
  // 2) compara com o que já temos (window._k = {id: preço}, gerado por `minas.py conhecidos`)
  comparar() {
    const viv = new Map(this.todos.map((x) => [x.id, x]));
    this.saiu = Object.keys(_k).filter((i) => !viv.has(i));
    this.preco = Object.keys(_k).filter((i) => viv.has(i) && viv.get(i).p !== _k[i]).map((i) => [i, viv.get(i).p]);
    this.novos = this.todos.filter((x) => !(x.id in _k) && x.ano >= 2022 && x.ano <= 2025);
    return `saíram ${this.saiu.length} · mudou preço ${this.preco.length} · não estão na lista ${this.novos.length}`;
  },
  // 3) abre o anúncio de cada um que não está na lista para pegar cor, blindagem, único dono e garantia.
  //    Demora ~3 s por carro e continua rodando mesmo se a extensão der "timeout": chame de novo até terminar.
  async detalhes() {
    this.det = this.det || {};
    for (const x of this.novos) {
      if (this.det[x.id]) continue;
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-3000px;width:1300px;height:2000px'; f.src = x.u; document.body.appendChild(f);
      await new Promise((r) => (f.onload = r));
      let t = '';
      for (let i = 0; i < 14; i++) {
        await new Promise((r) => setTimeout(r, 600));
        t = f.contentDocument.body.innerText.replace(/\s+/g, ' ');
        if (/ Cor \w/.test(t) && /Sobre o vendedor|Itens de ve/.test(t)) break;
      }
      f.remove();
      const cor = (t.match(/ Cor (\w+(?: \w+)?) (?:Aceita|Único|Todas|IPVA|Licenciado|Blindado|Alienado|Garantia|Sobre)/) || [])[1] || '';
      const fl = [/Blindado Sim/.test(t) && 'BLIND', /Único dono Sim/.test(t) && 'UNICO', /Garantia de fábrica Sim/.test(t) && 'GAR',
                  /leil[aã]o/i.test(t) && 'LEIL'].filter(Boolean).join(',');
      this.det[x.id] = { cor, fl };
    }
    return Object.keys(this.det).length + ' de ' + this.novos.length;
  },
  // 4) devolve o resultado em fatias de 12 linhas: minas.fatia(0), minas.fatia(1)… até vir vazio
  fatia(n) {
    if (!this.linhas) {
      const curta = (u) => u.replace('https://image.webmotors.com.br/_fotos/anunciousados/gigante/', '~');
      this.linhas = [...this.saiu.map((i) => `S|${i}`), ...this.preco.map(([i, p]) => `P|${i}|${p}`),
        ...this.novos.map((x) => { const d = this.det[x.id] || {}; return ['N', x.id, x.ano, x.km, x.cid, x.uf, x.p, d.cor || '', d.fl || '', curta(x.img)].join('|'); })];
    }
    return this.linhas.slice(n * 12, n * 12 + 12).join('\n');
  },
};
'coletor pronto';
