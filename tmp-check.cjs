const fs = require('fs');

const scriptRe = /<script(?![^>]*\ssrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g;

for (const lang of ['ko', 'zh', 'en', 'ja']) {
  const html = fs.readFileSync(`dist/${lang}/index.html`, 'utf8');
  let m;
  let ok = 0;
  const bad = [];
  while ((m = scriptRe.exec(html)) !== null) {
    const body = m[1];
    try {
      // 仅解析不执行，用于捕获语法错误
      new Function(body);
      ok += 1;
    } catch (e) {
      bad.push(e.message);
    }
  }
  console.log(lang.padEnd(3), `inlineScripts=${ok}`, bad.length ? 'SYNTAX_ERROR: ' + bad.join(' / ') : 'syntax-ok');
}
