const https = require('https');
const http  = require('http');
const fs    = require('fs');

function fetchUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function fetchRound(round) {
  const apiUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
  /* 직접 접속 먼저 시도 */
  const direct = await fetchUrl(apiUrl);
  if (direct) {
    try {
      const j = JSON.parse(direct);
      if (j && j.returnValue === 'success') return j;
    } catch(e) {}
  }
  /* 프록시 시도 */
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
  ];
  for (const p of proxies) {
    const res = await fetchUrl(p);
    if (!res) continue;
    try {
      const outer = JSON.parse(res);
      const inner = outer.contents ? JSON.parse(outer.contents) : outer;
      if (inner && inner.returnValue === 'success') return inner;
    } catch(e) {}
  }
  return null;
}

async function main() {
  const htmlPath = process.argv[2] || 'lotto645_f33.html';
  if (!fs.existsSync(htmlPath)) { console.error(`파일 없음: ${htmlPath}`); process.exit(1); }

  let html = fs.readFileSync(htmlPath, 'utf8');
  const labelMatch = html.match(/let freqLabel = '1~(\d+)회'/);
  if (!labelMatch) { console.error('freqLabel 못 찾음'); process.exit(1); }
  let lastRound = parseInt(labelMatch[1]);
  console.log(`현재 내장 데이터: 1~${lastRound}회`);

  const FREQ = {}, COLD = {};
  html.match(/let FREQ = \{([\s\S]*?)\};/)[1].replace(/(\d+):(\d+)/g, (_,k,v) => FREQ[parseInt(k)]=parseInt(v));
  html.match(/let COLD = \{([\s\S]*?)\};/)[1].replace(/(\d+):(\d+)/g, (_,k,v) => COLD[parseInt(k)]=parseInt(v));

  let newCount = 0;
  for (let r = lastRound + 1; r <= lastRound + 100; r++) {
    console.log(`  ${r}회 조회 중...`);
    const data = await fetchRound(r);
    if (!data) break;
    [data.drwtNo1,data.drwtNo2,data.drwtNo3,data.drwtNo4,data.drwtNo5,data.drwtNo6]
      .forEach(n => { FREQ[n] = (FREQ[n]||0)+1; });
    lastRound = r; newCount++;
  }

  if (newCount === 0) { console.log('이미 최신 데이터!'); process.exit(0); }
  console.log(`✅ ${newCount}회차 추가 → 1~${lastRound}회`);

  Object.entries(FREQ).sort((a,b)=>a[1]-b[1]).forEach(([n],i) => { COLD[parseInt(n)] = 45-i; });

  const nums = Array.from({length:45},(_,i)=>i+1);
  html = html.replace(/let FREQ = \{[\s\S]*?\};/, 'let FREQ = {\n  '+nums.map(n=>`${n}:${FREQ[n]}`).join(',')+'\n};');
  html = html.replace(/let COLD = \{[\s\S]*?\};/, 'let COLD = {\n  '+nums.map(n=>`${n}:${COLD[n]}`).join(',')+'\n};');
  html = html.replace(/let freqLabel = '[^']*'/, `let freqLabel = '1~${lastRound}회'`);
  html = html.replace(/(<span id="freq-label">)[^<]*/, `$11~${lastRound}회`);
  html = html.replace(/(<span id="bt-data-label">)[^<]*/, `$11~${lastRound}`);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`💾 저장 완료! (1~${lastRound}회)`);
}

main().catch(e => { console.error(e); process.exit(1); });
