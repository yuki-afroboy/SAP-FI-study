/* app/ を単一 HTML にまとめる。配布用・オフライン用。
   使い方: node tools/bundle.js [出力パス]  (既定: dist/lab.html) */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), app = path.join(root, 'app');
const out = process.argv[2] || path.join(root, 'dist', 'lab.html');

const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(app, 'css', 'style.css'), 'utf8');
const order = ['data', 'engine', 'store', 'missions', 'drills', 'ui'];
const js = order.map(n => fs.readFileSync(path.join(app, 'js', n + '.js'), 'utf8')).join('\n');

/* index.html の <body> 内だけを取り出す（Artifact は head/body を自前で用意するため） */
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<script src="js\/[^"]+"><\/script>/g, '');
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'SAP FI 実習ラボ'])[1];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out,
  `<title>${title}</title>\n<style>\n${css}\n</style>\n${body.trim()}\n<script>\n${js}\n</script>\n`);
console.log('wrote', out, (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
