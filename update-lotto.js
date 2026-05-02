const https = require('https');
const fs    = require('fs');
const path  = require('path');

/* ── 동행복권 API에서 회차 데이터 가져오기 ── */
function fetchRound(round) {
  return new Promise((resolve) => {
    const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  /* HTML 파일 경로 — Actions 환경에서는 repo 루트 기준 */
  const htmlPath = process.argv[2] || 'lotto645_f27.html';
  if (!fs.existsSync(htmlPath)) {
    console.error(`파일 없음: ${htmlPath}`);
    process.exit(1);
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  /* 현재 내장된 freqLabel 에서 마지막 회차 추출 */
  const labelMatch = html.match(/let freqLabel = '1~(\d+)회'/);
  if (!labelMatch) { console.error('freqLabel 못 찾음'); process.exit(1); }
  let lastRound = parseInt(labelMatch[1]);
  console.log(`현재 내장 데이터: 1~${lastRound}회`);

  /* 현재 FREQ 파싱 */
  const freqMatch = html.match(/let FREQ = \{([\s\S]*?)\};/);
  const coldMatch = html.match(/let COLD = \{([\s\S]*?)\};/);
  if (!freqMatch || !coldMatch) { console.error('FREQ/COLD 못 찾음'); process.exit(1); }

  const FREQ = {};
  const COLD = {};
  freqMatch[1].replace(/(\d+):(\d+)/g, (_, k, v) => FREQ[parseInt(k)] = parseInt(v));
  coldMatch[1].replace(/(\d+):(\d+)/g, (_, k, v) => COLD[parseInt(k)] = parseInt(v));

  /* 새 회차 데이터 순차 가져오기 */
  let newCount = 0;
  for (let r = lastRound + 1; r <= lastRound + 100; r++) {
    console.log(`  ${r}회 조회 중...`);
    const data = await fetchRound(r);
    if (!data || data.returnValue !== 'success') break;
    [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6]
      .forEach(n => { FREQ[n] = (FREQ[n] || 0) + 1; });
    lastRound = r;
    newCount++;
  }

  if (newCount === 0) {
    console.log('이미 최신 데이터입니다. 업데이트 불필요.');
    process.exit(0);
  }

  console.log(`✅ ${newCount}회차 추가 (1~${lastRound}회)`);

  /* COLD 재계산 */
  Object.entries(FREQ).sort((a, b) => a[1] - b[1])
    .forEach(([n], idx) => { COLD[parseInt(n)] = 45 - idx; });

  /* HTML 파일 업데이트 */
  const nums = Array.from({length: 45}, (_, i) => i + 1);
  const freqStr  = 'let FREQ = {\n  ' + nums.map(n => `${n}:${FREQ[n]}`).join(',') + '\n};';
  const coldStr  = 'let COLD = {\n  ' + nums.map(n => `${n}:${COLD[n]}`).join(',') + '\n};';
  const newLabel = `1~${lastRound}회`;

  html = html.replace(/let FREQ = \{[\s\S]*?\};/, freqStr);
  html = html.replace(/let COLD = \{[\s\S]*?\};/, coldStr);
  html = html.replace(/let freqLabel = '[^']*'/, `let freqLabel = '${newLabel}'`);
  /* bt-data-label, freq-label span 도 교체 */
  html = html.replace(/(<span id="freq-label">)[^<]*/, `$11~${lastRound}회`);
  html = html.replace(/(<span id="bt-data-label">)[^<]*/, `$11~${lastRound}`);

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`💾 저장 완료: ${htmlPath} (1~${lastRound}회)`);
}

main().catch(e => { console.error(e); process.exit(1); });
