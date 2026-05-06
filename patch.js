// ================================================================
// DamWatch v3.1 — 패치 파일
// 변경 내용:
//   1. Supabase 실시간 연동 (K-water 데이터 복구)
//   2. 36개 댐 전체 드롭다운 반영
//   3. 신규 댐 H-V 곡선 데이터 추가
//   4. 신규 댐 소개 내용 추가
//   5. 신규 댐 지역 컨텍스트 추가
// ================================================================

// ─────────────────────────────────────
// 1. Supabase 설정
// ─────────────────────────────────────
const SUPABASE_URL  = 'https://naiuecbapaxsnhvlfops.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5haXVlY2JhcGF4c25odmxmb3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTE3NDMsImV4cCI6MjA5MzQ2Nzc0M30.Au62wKZmnv_VhF1-bbd2IkmSHt-sroWCEmO89L-0XYs';

async function supabaseFetch(table, query = '') {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch(e) {
    console.warn('[DamWatch] Supabase 연결 실패 → 모의 데이터 사용:', e.message);
    return null;
  }
}

// ─────────────────────────────────────
// 2. 경보 계산 헬퍼
// ─────────────────────────────────────
function _calcAlert(r) {
  if (r >= 85) return { level:'danger',  color:'#FF4444', message:'⚠️ 홍수 경보', code:3 };
  if (r >= 70) return { level:'warning', color:'#FF8C00', message:'🔶 주의',       code:2 };
  if (r <= 20) return { level:'drought', color:'#CC7700', message:'🏜️ 가뭄 경보', code:2 };
  if (r <= 35) return { level:'low',     color:'#FFD700', message:'💧 저수 주의',  code:1 };
  return         { level:'normal',  color:'#00CC66', message:'✅ 정상',       code:0 };
}

// ─────────────────────────────────────
// 3. loadDashboard 오버라이드 (Supabase 실시간)
// ─────────────────────────────────────
async function loadDashboard() {
  const realtimeRows = await supabaseFetch('dam_realtime', '?select=*');

  let dams;
  if (realtimeRows && realtimeRows.length > 0) {
    // 실시간 데이터 + 정적 메타데이터 병합
    dams = MOCK_DAMS.map(mockDam => {
      const rt = realtimeRows.find(r => r.dam_id === mockDam.id);
      if (!rt) return mockDam; // DB에 없으면 모의 데이터 유지
      const storage_rate = parseFloat(rt.storage_rate) || mockDam.storage_rate;
      return {
        ...mockDam,
        level:        parseFloat(rt.level)        || mockDam.level,
        volume:       parseFloat(rt.volume)       || mockDam.volume,
        storage_rate,
        inflow:       parseFloat(rt.inflow)       || mockDam.inflow,
        outflow:      parseFloat(rt.outflow)      || mockDam.outflow,
        time:         rt.updated_at               || mockDam.time,
        is_mock:      false,
        alert:        _calcAlert(storage_rate),
      };
    });

    const latestUpdate = realtimeRows.reduce(
      (a, r) => (!a || r.updated_at > a ? r.updated_at : a), null
    );
    const updatedStr = latestUpdate
      ? new Date(latestUpdate).toLocaleTimeString('ko-KR')
      : '—';
    document.getElementById('last-updated').textContent =
      `✅ K-water 실시간 · ${updatedStr}`;
  } else {
    dams = MOCK_DAMS;
    document.getElementById('last-updated').textContent =
      '⚠️ 모의 데이터 (K-water 미연결)';
  }

  allDams = dams;

  const avgRate    = allDams.reduce((a, d) => a + d.storage_rate, 0) / allDams.length;
  const alertCount = allDams.filter(d => d.alert.code >= 2).length;
  const totalStor  = allDams.reduce((a, d) => a + d.volume, 0);
  const totalCap   = allDams.reduce((a, d) => a + d.full,   0);

  document.getElementById('sum-total').textContent = Math.round(totalStor).toLocaleString();

  const totalPctEl = document.getElementById('sum-total-pct');
  totalPctEl.dataset.capVal = Math.round(totalCap);
  totalPctEl.textContent = `총 용량 ${Math.round(totalCap).toLocaleString()} 백만톤 중`;

  document.getElementById('sum-avg').textContent = avgRate.toFixed(1);
  const avgSubEl = document.getElementById('sum-avg-sub');
  avgSubEl.dataset.avgVal = avgRate;
  avgSubEl.textContent =
    avgRate >= 70 ? '⚠️ 평균 저수율 높음'
    : avgRate <= 35 ? '💧 평균 저수율 낮음'
    : '✅ 평균 정상 범위';

  document.getElementById('sum-alert').textContent = alertCount;
  const alertSubEl = document.getElementById('sum-alert-sub');
  alertSubEl.dataset.alertVal = alertCount;
  alertSubEl.textContent = alertCount > 0 ? '경보/주의 댐 있음' : '모든 댐 정상';

  renderDamGrid(allDams);
}

// ─────────────────────────────────────
// 4. openDamModal 오버라이드 (Supabase 실시간)
// ─────────────────────────────────────
async function openDamModal(damId) {
  document.getElementById('modal-overlay').classList.add('open');
  const tabsEl = document.querySelector('.detail-tabs');
  if (tabsEl) tabsEl.style.display = '';
  document.getElementById('modal-title').textContent = '로딩 중...';
  resetLiquidFill();

  // Supabase에서 해당 댐 실시간 데이터 조회
  let d = makeMockDetail(damId);
  const rows = await supabaseFetch('dam_realtime', `?dam_id=eq.${damId}&select=*`);

  if (rows && rows.length > 0) {
    const rt = rows[0];
    const level        = parseFloat(rt.level)        || d.realtime.level;
    const volume       = parseFloat(rt.volume)       || d.realtime.volume;
    const storage_rate = parseFloat(rt.storage_rate) || d.realtime.storage_rate;
    const inflow       = parseFloat(rt.inflow)       || d.realtime.inflow;
    const outflow      = parseFloat(rt.outflow)      || d.realtime.outflow;

    d.realtime = {
      level, volume, storage_rate, inflow, outflow,
      time:    rt.updated_at || d.realtime.time,
      is_mock: false,
      volume_linear: volume * 0.95,
    };
    d.alert = _calcAlert(storage_rate);

    // 예측 계산
    const net     = inflow - outflow;
    const netPerH = net * 3600 / 1e6;
    d.prediction  = { net_flow_cms: net };
    const remaining = d.info.full - volume;
    if (net > 0 && netPerH > 0) {
      const hours = Math.round(remaining / netPerH);
      d.prediction.to_full = { hours, days: Math.round(hours / 24) };
    } else if (net < 0 && Math.abs(netPerH) > 0) {
      const hours = Math.round(volume / Math.abs(netPerH));
      d.prediction.to_empty = { days: Math.round(hours / 24) };
    }

    // 체감 단위 갱신
    d.intuitive = {
      olympic_pools:        Math.round(volume * 1e6 / 2500),
      seoul_citizens_years: (volume * 1e6 / (600 * 365 * 9700000)).toFixed(1),
      acre_feet:            Math.round(volume * 810.71),
      korea_population_days:(volume * 1e6 / (600 * 50000000 / 1000)).toFixed(1),
    };
  }

  currentDam = d;
  const isEN = currentLang === 'en';

  document.getElementById('modal-title').textContent = d.info.name;
  document.getElementById('modal-sub').textContent = isEN
    ? `${d.info.river} | Full capacity ${d.info.full} M.ton | ${d.realtime.is_mock ? '⚠️ Demo data' : '✅ K-water Live'}`
    : `${d.info.river} | 만수위 ${d.info.full} 백만톤 | ${d.realtime.is_mock ? '⚠️ 모의 데이터' : '✅ K-water 실시간'}`;

  document.getElementById('d-rate').textContent  = d.realtime.storage_rate;
  document.getElementById('d-level').textContent = d.realtime.level.toFixed(2);
  document.getElementById('d-vol').textContent   = d.realtime.volume.toLocaleString();
  document.getElementById('d-full').textContent  = d.info.full.toLocaleString();

  const bar = document.getElementById('d-bar');
  bar.style.width = '0%';
  const alertLevel = d.alert.level;
  bar.className = 'storage-bar-fill' +
    (alertLevel === 'danger'  ? ' danger'  :
     alertLevel === 'warning' ? ' warning' :
     (alertLevel === 'drought' || alertLevel === 'low') ? ' drought' : '');

  document.getElementById('d-in').textContent  = d.realtime.inflow.toFixed(1);
  document.getElementById('d-out').textContent = d.realtime.outflow.toFixed(1);
  document.getElementById('d-net').textContent = (d.realtime.inflow - d.realtime.outflow).toFixed(1);

  const iv = d.intuitive;
  document.getElementById('d-intuitive').innerHTML = `
    <div class="intuitive-item"><div class="intuitive-emoji">🏊</div><div class="intuitive-val">${Number(iv.olympic_pools).toLocaleString()}</div><div class="intuitive-desc">${isEN ? 'Olympic Pools' : '올림픽 수영장'}</div></div>
    <div class="intuitive-item"><div class="intuitive-emoji">👨‍👩‍👧</div><div class="intuitive-val">${iv.seoul_citizens_years}</div><div class="intuitive-desc">${isEN ? 'Seoul/yr Use' : '서울시민 연간사용'}</div></div>
    <div class="intuitive-item"><div class="intuitive-emoji">🇺🇸</div><div class="intuitive-val">${Number(iv.acre_feet).toLocaleString()}</div><div class="intuitive-desc">Acre-feet</div></div>
  `;

  const pred = d.prediction;
  let predText = isEN
    ? `Net inflow: ${pred.net_flow_cms > 0 ? '+' : ''}${pred.net_flow_cms} ㎥/s`
    : `순유입: ${pred.net_flow_cms > 0 ? '+' : ''}${pred.net_flow_cms} ㎥/s`;
  if (pred.to_full)  predText += isEN
    ? `\n→ Full in ~${pred.to_full.days} days (${pred.to_full.hours}h)`
    : `\n→ 만수위까지 약 ${pred.to_full.days}일 (${pred.to_full.hours}시간)`;
  if (pred.to_empty) predText += isEN
    ? `\n→ Empty in ~${pred.to_empty.days} days`
    : `\n→ 고갈까지 약 ${pred.to_empty.days}일`;
  document.getElementById('d-predict-text').textContent = predText;

  document.getElementById('sim-outflow').value = d.realtime.outflow;
  document.getElementById('sim-outflow-val').textContent = d.realtime.outflow;
  updateSimulation();

  switchDetailTab('realtime');
  renderHistoryChart(d.history);
  renderHVChart(d.hv_curve);

  const wiOut = document.getElementById('wi-out');
  if (wiOut) wiOut.value = Math.round(d.realtime.outflow);
  updateWhatIf();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      triggerLiquidFill(d.realtime.storage_rate, alertLevel);
      bar.style.width = Math.min(d.realtime.storage_rate, 100) + '%';
    });
  });
}

// ─────────────────────────────────────
// 5. HV_DATA 확장 (20개 신규 댐)
// ─────────────────────────────────────
// HV_DATA가 정의된 후 실행되도록 패치 함수 사용
function _patchHVData() {
  if (typeof HV_DATA === 'undefined') return;
  Object.assign(HV_DATA, {
    hoengseong:     [[164,0],[168,8],[172,29],[176,57],[181,86.9]],
    namgang:        [[20,0],[26,30],[31,100],[36,210],[42,309]],
    gunwi:          [[122,0],[126,5],[129,16],[132,33],[136,47.5]],
    gimcheonbuhang: [[145,0],[150,10],[155,36],[160,73],[165,105]],
    seongdeok:      [[112,0],[115,5],[118,18],[122,37],[126,53.5]],
    bohyeonsan:     [[190,0],[194,5],[199,18],[203,37],[208,56.6]],
    gwangdong:      [[690,0],[695,0.8],[700,2.8],[705,5.8],[710,8.5]],
    dalbang:        [[640,0],[645,0.5],[650,1.7],[655,3.5],[660,5.1]],
    yeongcheon:     [[132,0],[135,5],[139,18],[143,37],[146,55.9]],
    angye:          [[104,0],[107,0.15],[110,0.55],[113,1.1],[116,1.6]],
    gampo:          [[82,0],[85,0.15],[89,0.5],[92,1.0],[96,1.5]],
    unmun:          [[100,0],[104,12],[108,43],[112,88],[116,132.5]],
    daegok:         [[92,0],[96,3.5],[100,12],[104,25],[107,36]],
    sayeon:         [[85,0],[88,3.5],[92,12],[96,25],[100,36]],
    daeam:          [[72,0],[75,0.3],[79,1.1],[82,2.2],[86,3.2]],
    seonam:         [[67,0],[70,0.25],[73,0.9],[77,2.0],[80,2.8]],
    yeoncho:        [[77,0],[80,0.5],[84,1.7],[87,3.5],[91,5]],
    gucheon:        [[80,0],[83,0.55],[87,1.9],[91,4.0],[94,5.8]],
    sueo:           [[85,0],[88,7.5],[92,25],[96,52],[100,77]],
    pyeongnim:      [[52,0],[55,0.7],[59,2.3],[62,4.8],[66,7.1]],
  });
}

// ─────────────────────────────────────
// 6. DAM_INTRO 확장 (신규 댐 소개)
// ─────────────────────────────────────
function _patchDAMIntro() {
  if (typeof DAM_INTRO === 'undefined') return;
  Object.assign(DAM_INTRO, {
    hoengseong: {
      nickname: '강원 내륙의 수원',
      built: 2000, height_m: 48, length_m: 220,
      purpose: ['홍수 조절', '생활 용수', '농업 용수'],
      capacity: 86.9, power_mw: 0, supply_city: '횡성·원주', river: '섬강',
      history: '1994년 착공, 2000년 준공. 강원도 횡성군 갑천면 섬강 상류에 건설된 다목적댐. 원주 지역의 생활·공업용수 공급원으로, 강원 내륙의 만성적 물 부족을 해소했다.',
      without: '횡성댐 없이는 원주·횡성 지역의 생활용수 공급이 불안정하고, 섬강 유역 봄 홍수 피해가 반복됐을 것이다.',
      facts: ['저수량 0.87억 톤 — 원주·횡성 용수 담당', '강원 내륙 최대 수원', '섬강 유역 홍수 조절', '횡성한우 산지의 수원'],
      visit: '강원 횡성군 갑천면. 횡성호 수변공원, 드라이브 코스 유명.',
    },
    namgang: {
      nickname: '남강의 심장, 진주의 자부심',
      built: 2001, height_m: 34, length_m: 1126,
      purpose: ['홍수 조절', '생활·공업 용수', '농업 용수'],
      capacity: 309, power_mw: 14, supply_city: '진주·사천·창원', river: '남강',
      history: '1969년 초기 준공, 2001년 확장 완공. 경남 진주시 남강에 건설된 다목적댐. 확장 공사로 저수량이 크게 늘어 경남 서부 핵심 수원이 됐다. 진주성 남강유등축제의 무대이기도 하다.',
      without: '남강댐 없이는 진주 시내 홍수가 반복되고, 사천항공우주산단과 창원공단 용수 공급이 불안정했을 것이다.',
      facts: ['저수량 3.1억 톤 — 경남 서부 최대', '진주성 남강유등축제의 수원', '사천항공우주산단 용수 공급', '낙동강 지류 홍수 방어 역할'],
      visit: '경남 진주시 수곡면. 진주호 수변공원·전망대 운영.',
    },
    gunwi: {
      nickname: '경북 내륙의 소중한 수원',
      built: 1979, height_m: 38, length_m: 310,
      purpose: ['농업 용수', '생활 용수'],
      capacity: 47.5, power_mw: 0, supply_city: '군위·의성', river: '위천',
      history: '1976년 착공, 1979년 준공. 경북 군위군 위천에 건설된 농업·생활용수 전용댐. 경북 북부 내륙 농업지대의 안정적 수원으로 운영되어 왔다.',
      without: '군위댐 없이는 군위·의성 농업지대의 가뭄 피해가 반복됐을 것. 경북 북부 쌀·사과 생산에도 영향이 컸을 것이다.',
      facts: ['저수량 0.48억 톤', '경북 북부 농업용수 공급', '위천 유역 가뭄 대비', '군위 사과 산지의 수원'],
      visit: '경북 군위군 삼국유사면. 인근 삼국유사테마파크.',
    },
    gimcheonbuhang: {
      nickname: '경북 서부의 21세기 새 수원',
      built: 2009, height_m: 52, length_m: 410,
      purpose: ['홍수 조절', '생활·공업 용수'],
      capacity: 105, power_mw: 0, supply_city: '김천·구미', river: '감천',
      history: '2002년 착공, 2009년 준공. 경북 김천시 부항면 감천 상류에 건설된 다목적댐. 경북 서부의 만성적 물 부족 해소를 위해 21세기 초 건설된 신규 댐이다.',
      without: '김천부항댐 없이는 김천·구미 지역 생활용수 부족이 심각했을 것. 구미 국가산단의 공업용수 공급도 불안정했을 것이다.',
      facts: ['저수량 1.1억 톤', '감천 유역 홍수 저감', '김천혁신도시 용수 공급', '21세기 첫 경북 신규 다목적댐'],
      visit: '경북 김천시 부항면. 부항댐 수변 드라이브 코스.',
    },
    seongdeok: {
      nickname: '상주·구미 북부의 수원',
      built: 1993, height_m: 40, length_m: 315,
      purpose: ['농업 용수', '생활 용수'],
      capacity: 53.5, power_mw: 0, supply_city: '상주·구미 북부', river: '광천',
      history: '1988년 착공, 1993년 준공. 경북 상주시 광천에 건설된 소형 다목적댐. 낙동강 중상류 농업지대에 안정적인 용수를 공급하기 위해 건설됐다.',
      without: '성덕댐 없이는 상주·구미 북부 농업지대의 가뭄 피해가 잦았을 것. 낙동강 취수 의존도가 높아져 수질 문제도 가중됐을 것이다.',
      facts: ['저수량 0.54억 톤', '낙동강 농업지대 안정적 수원', '상주곶감·사과 산지의 용수', '조용한 수변 자연환경 보전'],
      visit: '경북 상주시 공검면. 성덕저수지 수변 생태공원.',
    },
    bohyeonsan: {
      nickname: '영천·포항의 용수 공급원',
      built: 1994, height_m: 48, length_m: 350,
      purpose: ['생활 용수', '농업 용수'],
      capacity: 56.6, power_mw: 0, supply_city: '영천·경산·포항 일부', river: '자호천',
      history: '1988년 착공, 1994년 준공. 경북 영천시 자호천에 건설된 용수전용댐. 경북 동부 지역의 생활·농업용수 공급원이며, 인근 보현산천문대로도 유명하다.',
      without: '보현산댐 없이는 영천·경산 지역의 가뭄 피해가 심각했을 것. 포항공단 일부 용수 공급도 불안정했을 것이다.',
      facts: ['저수량 0.57억 톤', '영천한약재·포도 농업용수 공급', '인근 보현산천문대 — 국내 최대 광학망원경', '경북 동부 핵심 수원'],
      visit: '경북 영천시 화북면. 보현산댐과 보현산천문대 함께 방문.',
    },
    unmun: {
      nickname: '대구 250만의 청정 식수원',
      built: 1985, height_m: 55, length_m: 310,
      purpose: ['생활 용수', '농업 용수'],
      capacity: 132.5, power_mw: 0, supply_city: '대구·경산·청도', river: '운문천',
      history: '1980년 착공, 1985년 준공. 경북 청도군 운문천에 건설된 용수전용댐. 대구광역시 상수도의 핵심 공급원 중 하나로, 낙동강 의존도를 낮추는 데 결정적으로 기여했다.',
      without: '운문댐 없이는 대구 250만 시민의 식수 공급이 심각하게 부족했을 것. 낙동강 의존도가 높아져 수질 오염 문제도 더 심각했을 것이다.',
      facts: ['저수량 1.3억 톤 — 대구 상수도 25% 공급', '청정 수질 1급수 유지', '운문사 비구니 도량의 수원', '청도 와인터널 지역 용수'],
      visit: '경북 청도군 운문면. 운문사와 함께 방문 권장.',
    },
    sueo: {
      nickname: '여수·광양 산업의 생명수',
      built: 1991, height_m: 46, length_m: 400,
      purpose: ['생활·공업 용수'],
      capacity: 77, power_mw: 0, supply_city: '여수·광양·순천', river: '수어천',
      history: '1985년 착공, 1991년 준공. 전남 광양시 수어천에 건설된 용수전용댐. 여수국가산업단지와 광양제철소의 핵심 공업용수 공급원이며, 전남 동부 3개 도시 생활용수도 담당한다.',
      without: '수어댐 없이는 여수 LG화학·GS칼텍스와 광양제철소의 정상 가동이 어려웠을 것이다. 전남 동부 경제의 핵심 인프라.',
      facts: ['저수량 0.77억 톤', '여수국가산단·광양제철 공업용수 담당', '전남 동부 3개 도시 생활용수 공급', '수어호 낚시 명소'],
      visit: '전남 광양시 옥룡면. 수어호 수변공원.',
    },
    gwangdong: {
      nickname: '해발 700m, 가장 높은 댐',
      built: 1982, height_m: 45, length_m: 355,
      purpose: ['생활 용수', '농업 용수'],
      capacity: 8.5, power_mw: 0, supply_city: '태백·삼척', river: '골지천',
      history: '1978년 착공, 1982년 준공. 강원 태백시 골지천에 건설된 소형 용수댐. 해발 700m 이상의 고원 도시 태백의 유일한 대형 수원으로, 탄광 도시 발전기의 산업용수도 담당했다.',
      without: '광동댐 없이는 태백·삼척 고원 지역의 만성적 물 부족이 지속됐을 것. 1960~80년대 탄광도시 태백의 산업 발전도 어려웠을 것이다.',
      facts: ['해발 700m 고지 위치 — 국내에서 가장 높은 곳의 댐', '태백시 유일 대형 수원', '한강·낙동강 분수령 부근', '태백 석탄박물관 인근'],
      visit: '강원 태백시. 태백 석탄박물관·고원자생식물원과 함께 방문.',
    },
    dalbang: {
      nickname: '태백의 오래된 보조 수원',
      built: 1959, height_m: 28, length_m: 220,
      purpose: ['생활 용수'],
      capacity: 5.1, power_mw: 0, supply_city: '태백', river: '달방천',
      history: '1956년 착공, 1959년 준공. 강원 태백시 달방천에 건설된 소형 생활용수댐. 광동댐이 건설되기 전 태백의 주요 수원이었으며, 탄광 시대의 역사를 간직하고 있다.',
      without: '달방댐 없이는 1960~70년대 태백 탄광 산업 시기의 용수 공급이 심각하게 부족했을 것이다.',
      facts: ['광동댐 이전 태백 주요 수원', '탄광 도시 태백 역사의 증인', '현재는 보조 비상 수원으로 운영', '태백 도심 근접'],
      visit: '강원 태백시 달방동.',
    },
    yeongcheon: {
      nickname: '경북 동부의 핵심 수원',
      built: 1980, height_m: 46, length_m: 316,
      purpose: ['생활 용수', '농업 용수'],
      capacity: 55.9, power_mw: 0, supply_city: '영천·경산', river: '자호천',
      history: '1976년 착공, 1980년 준공. 경북 영천시 자호천에 건설된 용수전용댐. 영천·경산 지역의 생활·농업용수 핵심 공급원으로, 경산시 대학도시 발전의 숨은 공신이다.',
      without: '영천댐 없이는 경산시의 급격한 인구 증가에 대응하는 용수 공급이 불가능했을 것이다.',
      facts: ['저수량 0.56억 톤', '영천 포도·한약재 농업용수', '경산 대학도시 용수 공급', '보현산댐과 연계 운영'],
      visit: '경북 영천시 자양면.',
    },
    angye: {
      nickname: '경북 내륙 소도시의 수원',
      built: 1975, height_m: 25, length_m: 206,
      purpose: ['농업 용수'],
      capacity: 1.6, power_mw: 0, supply_city: '의성·군위', river: '위천',
      history: '1972년 착공, 1975년 준공. 경북 의성군 안계면 위천에 건설된 소형 농업용수댐. 경북 내륙 농업지대에 안정적 농업용수를 공급하기 위해 건설됐다.',
      without: '안계댐 없이는 의성·군위 내륙 농경지의 봄 가뭄 피해가 더 심각했을 것이다.',
      facts: ['저수량 0.016억 톤', '의성 마늘·고추 농업용수', '경북 내륙 소형 댐 대표 사례', '가뭄 취약 지역 안정적 수원'],
      visit: '경북 의성군 안계면. 의성마늘 생산지 인근.',
    },
    gampo: {
      nickname: '경주 동해안의 수원',
      built: 1968, height_m: 22, length_m: 183,
      purpose: ['생활 용수', '농업 용수'],
      capacity: 1.5, power_mw: 0, supply_city: '경주 감포읍', river: '남천',
      history: '1965년 착공, 1968년 준공. 경북 경주시 감포읍 남천에 건설된 소형 용수댐. 동해안 해안 도시 감포의 물 부족 해소를 위해 건설됐다.',
      without: '감포댐 없이는 경주 동해안 지역의 만성적 물 부족이 지속됐을 것이다.',
      facts: ['경주 동해안 유일 수원', '감포항 어업·관광 용수 공급', '신라 천년 도시 경주의 보조 수원', '동해안 드라이브 코스 인근'],
      visit: '경북 경주시 감포읍. 감포 해안 관광지 인근.',
    },
    daegok: {
      nickname: '울산의 첫 번째 식수원',
      built: 1965, height_m: 36, length_m: 304,
      purpose: ['생활 용수'],
      capacity: 36, power_mw: 0, supply_city: '울산', river: '대곡천',
      history: '1962년 착공, 1965년 준공. 울산광역시 대곡천에 건설된 상수원댐. 울산 중화학공업 발전기에 도시 용수를 담당한 역사적 댐이다. 세계문화유산 반구대 암각화 바로 옆에 위치해 수몰 논란이 계속됐다.',
      without: '대곡댐 없이는 1960~70년대 울산 중화학공업 발전기에 도시 용수가 심각하게 부족했을 것이다.',
      facts: ['국보 285호 반구대 암각화 인근 — 수몰 논란의 중심', '울산 최초 상수원 댐', '대곡천 1급수 청정 수질', '사연댐과 함께 울산 이중 상수원 구성'],
      visit: '울산 울주군 언양면. 반구대 암각화 탐방 시 함께 방문 필수.',
    },
    sayeon: {
      nickname: '울산의 두 번째 식수원',
      built: 1965, height_m: 36, length_m: 260,
      purpose: ['생활 용수'],
      capacity: 36, power_mw: 0, supply_city: '울산', river: '태화강',
      history: '1962년 착공, 1965년 준공. 울산광역시 태화강 상류에 건설된 상수원댐. 대곡댐과 함께 울산시 이중 상수원 시스템을 구성하며 안정적인 식수 공급을 담당한다.',
      without: '사연댐 없이는 울산 산업화 시기의 폭발적 용수 수요를 감당할 수 없었을 것이다.',
      facts: ['저수량 0.36억 톤', '태화강 상류 청정 수질', '대곡댐과 이중 수원 시스템 구성', '태화강 국가정원 연계'],
      visit: '울산 울주군 언양면. 태화강 국가정원과 연계 방문.',
    },
    yeoncho: {
      nickname: '거제의 핵심 수원',
      built: 1967, height_m: 35, length_m: 263,
      purpose: ['생활 용수'],
      capacity: 5, power_mw: 0, supply_city: '거제', river: '연초천',
      history: '1964년 착공, 1967년 준공. 경남 거제시 연초천에 건설된 생활용수댐. 섬 지역인 거제시의 물 부족 문제를 해결하기 위해 건설됐으며, 거제 조선소 발전의 기반이 됐다.',
      without: '연초댐 없이는 거제도 주민의 만성적 물 부족이 지속됐을 것. 세계 최대 조선소인 삼성·대우 조선소 발전도 어려웠을 것이다.',
      facts: ['거제 주요 수원', '거제 조선소 산업 발전의 기반', '구천댐과 연계 운영', '거제 해안 관광의 수원'],
      visit: '경남 거제시 연초면. 거제 해금강·외도 관광지 접근로 인근.',
    },
    gucheon: {
      nickname: '거제의 보조 수원',
      built: 1971, height_m: 33, length_m: 280,
      purpose: ['생활 용수'],
      capacity: 5.8, power_mw: 0, supply_city: '거제', river: '구천',
      history: '1968년 착공, 1971년 준공. 경남 거제시 구천에 건설된 생활용수댐. 연초댐과 함께 거제시 이중 수원 시스템을 구성해 인구 증가에 대응했다.',
      without: '구천댐 없이는 거제 인구 급증에 따른 용수 부족이 더 심각했을 것이다.',
      facts: ['저수량 0.058억 톤', '연초댐과 연계 운영 — 이중 수원 시스템', '거제 시민 보조 수원', '삼성·대우 조선소 인근'],
      visit: '경남 거제시 동부면.',
    },
    daeam: {
      nickname: '경남 함안의 농업 수원',
      built: 1975, height_m: 27, length_m: 215,
      purpose: ['농업 용수'],
      capacity: 3.2, power_mw: 0, supply_city: '함안', river: '대암천',
      history: '1972년 착공, 1975년 준공. 경남 함안군 대암천에 건설된 소형 농업용수댐. 낙동강 하류 함안평야의 농업용수 보조 공급원으로 운영된다.',
      without: '대암댐 없이는 함안 농업지대의 봄 가뭄 피해가 더 자주 발생했을 것이다.',
      facts: ['저수량 0.032억 톤', '함안 딸기·수박 농업용수', '낙동강 하류 농업지대 지원', '아라가야 역사 도시 함안의 용수'],
      visit: '경남 함안군 법수면. 아라가야 유적지 인근.',
    },
    seonam: {
      nickname: '남해 섬마을의 수원',
      built: 1973, height_m: 24, length_m: 193,
      purpose: ['농업 용수', '생활 용수'],
      capacity: 2.8, power_mw: 0, supply_city: '남해', river: '선암천',
      history: '1970년 착공, 1973년 준공. 경남 남해군 선암천에 건설된 소형 용수댐. 섬 지역인 남해군의 농업·생활용수 공급을 위해 건설됐으며, 남해 마늘·유자 농업의 수원이다.',
      without: '선암댐 없이는 남해 섬 지역의 물 부족이 심각하여 마늘·유자 농업에 큰 타격이 있었을 것이다.',
      facts: ['남해 마늘·유자 농업용수', '해안 섬 지역 수원의 귀중함', '남해 독일마을 인근', '다랭이마을 계단식 논의 수원'],
      visit: '경남 남해군 서면. 남해 독일마을·다랭이마을 인근.',
    },
    pyeongnim: {
      nickname: '전남 장성의 생명수',
      built: 1983, height_m: 30, length_m: 237,
      purpose: ['농업 용수', '생활 용수'],
      capacity: 7.1, power_mw: 0, supply_city: '장성·담양', river: '평림천',
      history: '1979년 착공, 1983년 준공. 전남 장성군 평림천에 건설된 소형 용수댐. 호남고속도로 인근 장성·담양 지역의 농업·생활용수 공급원이다.',
      without: '평림댐 없이는 장성·담양 지역의 봄 가뭄 피해가 잦았을 것이다.',
      facts: ['저수량 0.071억 톤', '장성 황룡강 튤립축제 지역 용수', '담양 메타세쿼이아 길 인근', '전남 북부 소형 수원 대표'],
      visit: '전남 장성군 삼서면. 장성호 수변공원.',
    },
  });
}

// ─────────────────────────────────────
// 7. DAM_LOCAL_CONTEXT 확장
// ─────────────────────────────────────
function _patchLocalContext() {
  if (typeof DAM_LOCAL_CONTEXT === 'undefined') return;
  Object.assign(DAM_LOCAL_CONTEXT, {
    hoengseong:     { city:'횡성·원주',  pop: 110, landmark:'횡성호(9km²)',   landmark_unit:'여의도 3배',   shower_school:'횡성 갑천초 500명 기준' },
    namgang:        { city:'진주·사천',  pop: 380, landmark:'진주호(27km²)',  landmark_unit:'여의도 9배',   shower_school:'진주 수곡초 500명 기준' },
    gunwi:          { city:'군위·의성',  pop:  80, landmark:'군위호(6km²)',   landmark_unit:'여의도 2배',   shower_school:'군위 군위초 500명 기준' },
    gimcheonbuhang: { city:'김천·구미',  pop: 140, landmark:'부항호(7km²)',   landmark_unit:'여의도 2배',   shower_school:'김천 부항초 500명 기준' },
    seongdeok:      { city:'상주·구미',  pop:  90, landmark:'성덕호(5km²)',   landmark_unit:'여의도 2배',   shower_school:'상주 성덕초 500명 기준' },
    bohyeonsan:     { city:'영천·포항',  pop: 100, landmark:'보현산댐(5km²)', landmark_unit:'여의도 2배',   shower_school:'영천 화산초 500명 기준' },
    gwangdong:      { city:'태백·삼척',  pop:  45, landmark:'광동호(3km²)',   landmark_unit:'여의도 1배',   shower_school:'태백 장성초 500명 기준' },
    dalbang:        { city:'태백',       pop:  40, landmark:'달방호(2km²)',   landmark_unit:'여의도 0.7배', shower_school:'태백 달방초 500명 기준' },
    yeongcheon:     { city:'영천·경산',  pop: 120, landmark:'영천호(9km²)',   landmark_unit:'여의도 3배',   shower_school:'영천 영천초 500명 기준' },
    angye:          { city:'의성·군위',  pop:  30, landmark:'안계호(1km²)',   landmark_unit:'여의도 0.4배', shower_school:'의성 안계초 500명 기준' },
    gampo:          { city:'경주',       pop:  25, landmark:'감포호(1km²)',   landmark_unit:'여의도 0.3배', shower_school:'경주 감포초 500명 기준' },
    unmun:          { city:'대구·경산',  pop:2500, landmark:'운문호(10km²)',  landmark_unit:'여의도 3배',   shower_school:'청도 운문초 500명 기준' },
    daegok:         { city:'울산',       pop: 360, landmark:'대곡호(5km²)',   landmark_unit:'여의도 2배',   shower_school:'울산 대곡초 500명 기준' },
    sayeon:         { city:'울산',       pop: 360, landmark:'사연호(5km²)',   landmark_unit:'여의도 2배',   shower_school:'울산 사연초 500명 기준' },
    daeam:          { city:'함안',       pop:  60, landmark:'대암호(1km²)',   landmark_unit:'여의도 0.4배', shower_school:'함안 대암초 500명 기준' },
    seonam:         { city:'남해',       pop:  40, landmark:'선암호(1km²)',   landmark_unit:'여의도 0.3배', shower_school:'남해 선암초 500명 기준' },
    yeoncho:        { city:'거제',       pop: 250, landmark:'연초호(3km²)',   landmark_unit:'여의도 1배',   shower_school:'거제 연초초 500명 기준' },
    gucheon:        { city:'거제',       pop: 250, landmark:'구천호(2km²)',   landmark_unit:'여의도 0.7배', shower_school:'거제 구천초 500명 기준' },
    sueo:           { city:'여수·광양',  pop: 590, landmark:'수어호(8km²)',   landmark_unit:'여의도 3배',   shower_school:'광양 수어초 500명 기준' },
    pyeongnim:      { city:'장성·담양',  pop:  80, landmark:'평림호(2km²)',   landmark_unit:'여의도 0.7배', shower_school:'장성 평림초 500명 기준' },
  });
}

// ─────────────────────────────────────
// 8. 드롭다운 select 36개 댐으로 업데이트
// ─────────────────────────────────────
function _updateSelectOptions() {
  const NEW_OPTS_CALC = `
    <optgroup label="── 중형 다목적댐 (100~500백만톤) ──">
      <option value="namgang"        data-full="309"   data-minl="20"  data-maxl="42">남강댐 (남강, 만수 309백만톤)</option>
      <option value="hoengseong"     data-full="86.9"  data-minl="164" data-maxl="181">횡성댐 (섬강, 만수 86.9백만톤)</option>
      <option value="gimcheonbuhang" data-full="105"   data-minl="145" data-maxl="165">김천부항댐 (감천, 만수 105백만톤)</option>
      <option value="unmun"          data-full="132.5" data-minl="100" data-maxl="116">운문댐 (운문천, 만수 132.5백만톤)</option>
      <option value="sueo"           data-full="77"    data-minl="85"  data-maxl="100">수어댐 (수어천, 만수 77백만톤)</option>
      <option value="gunwi"          data-full="47.5"  data-minl="122" data-maxl="136">군위댐 (위천, 만수 47.5백만톤)</option>
      <option value="seongdeok"      data-full="53.5"  data-minl="112" data-maxl="126">성덕댐 (광천, 만수 53.5백만톤)</option>
      <option value="bohyeonsan"     data-full="56.6"  data-minl="190" data-maxl="208">보현산댐 (자호천, 만수 56.6백만톤)</option>
      <option value="yeongcheon"     data-full="55.9"  data-minl="132" data-maxl="146">영천댐 (자호천, 만수 55.9백만톤)</option>
    </optgroup>
    <optgroup label="── 소형 용수전용댐 ──">
      <option value="daegok"         data-full="36"    data-minl="92"  data-maxl="107">대곡댐 (대곡천, 만수 36백만톤)</option>
      <option value="sayeon"         data-full="36"    data-minl="85"  data-maxl="100">사연댐 (태화강, 만수 36백만톤)</option>
      <option value="gwangdong"      data-full="8.5"   data-minl="690" data-maxl="710">광동댐 (골지천, 만수 8.5백만톤)</option>
      <option value="dalbang"        data-full="5.1"   data-minl="640" data-maxl="660">달방댐 (달방천, 만수 5.1백만톤)</option>
      <option value="angye"          data-full="1.6"   data-minl="104" data-maxl="116">안계댐 (위천, 만수 1.6백만톤)</option>
      <option value="gampo"          data-full="1.5"   data-minl="82"  data-maxl="96">감포댐 (남천, 만수 1.5백만톤)</option>
      <option value="daeam"          data-full="3.2"   data-minl="72"  data-maxl="86">대암댐 (대암천, 만수 3.2백만톤)</option>
      <option value="seonam"         data-full="2.8"   data-minl="67"  data-maxl="80">선암댐 (선암천, 만수 2.8백만톤)</option>
      <option value="yeoncho"        data-full="5"     data-minl="77"  data-maxl="91">연초댐 (연초천, 만수 5백만톤)</option>
      <option value="gucheon"        data-full="5.8"   data-minl="80"  data-maxl="94">구천댐 (구천, 만수 5.8백만톤)</option>
      <option value="pyeongnim"      data-full="7.1"   data-minl="52"  data-maxl="66">평림댐 (평림천, 만수 7.1백만톤)</option>
    </optgroup>`;

  const NEW_OPTS_EDU = `
    <optgroup label="── 중형 다목적댐 ──">
      <option value="namgang">남강댐 / Namgang</option>
      <option value="hoengseong">횡성댐 / Hoengseong</option>
      <option value="gimcheonbuhang">김천부항댐 / Gimcheon-Buhang</option>
      <option value="unmun">운문댐 / Unmun</option>
      <option value="sueo">수어댐 / Sueo</option>
    </optgroup>
    <optgroup label="── 소형 용수전용댐 ──">
      <option value="yeongcheon">영천댐 / Yeongcheon</option>
      <option value="daegok">대곡댐 / Daegok</option>
      <option value="sayeon">사연댐 / Sayeon</option>
    </optgroup>`;

  // 계산기 드롭다운 업데이트
  const expDam = document.getElementById('exp-dam');
  if (expDam) {
    const lastGroup = expDam.querySelector('optgroup:last-of-type');
    if (lastGroup) lastGroup.insertAdjacentHTML('afterend', NEW_OPTS_CALC);
  }

  // 교육 스플라인 드롭다운 업데이트
  const eduDam = document.getElementById('edu-dam-select');
  if (eduDam) {
    const lastGroup = eduDam.querySelector('optgroup:last-of-type');
    if (lastGroup) lastGroup.insertAdjacentHTML('afterend', NEW_OPTS_EDU);
  }

  // 교육 역사 드롭다운 업데이트
  const histDam = document.getElementById('hist-dam-select');
  if (histDam) {
    const lastGroup = histDam.querySelector('optgroup:last-of-type');
    if (lastGroup) lastGroup.insertAdjacentHTML('afterend', NEW_OPTS_EDU);
  }
}

// ─────────────────────────────────────
// 9. 초기화 실행
// ─────────────────────────────────────
(function _initPatch() {
  // 데이터 패치 (즉시 실행 — JS 객체는 이미 정의됨)
  _patchHVData();
  _patchDAMIntro();
  _patchLocalContext();

  // DOM 패치 (DOM 준비 후 실행)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _updateSelectOptions);
  } else {
    _updateSelectOptions();
  }

  console.log('[DamWatch patch.js v3.1] 로드 완료 — Supabase 연동 + 36개 댐 + 소개 내용 추가');
})();
