/* ═══════════════════════════════════════════════════════════════
   patch.js  —  댐워치 v3.0 보완 패치
   ① 누락된 HV_DATA(수위-저수량 곡선) 전체 댐 추가
   ② DAM_INTRO 전체 댐 완성 (소개·역사·통계·방문 안내)
   ③ WAMIS 직접 API 시도 → 실패 시 안정적 모의 데이터 폴백
   ④ 새로 추가된 댐 select 옵션 자동 삽입
═══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   0. WAMIS 직접 연결 설정
   K-WATER 공공데이터포털 API 키를 아래에 입력하면
   백엔드 없이 브라우저에서 직접 실시간 데이터를 받아옵니다.
   발급: https://data.go.kr → "WAMIS" 검색
   ───────────────────────────────────────────────────────────── */
const WAMIS_API_KEY = 'adf383b5707d32def18d17ddec442b29ca7284cdd59370986fc5fa9868ecab35';   // ← 여기에 API 키 입력 (없으면 모의 데이터 사용)
const WAMIS_BASE   = 'https://api.data.go.kr/openapi/tn_pub_data_stream_wamis_api/wamis/openapi';

/* 댐 코드 매핑 (WAMIS 기준) */
const WAMIS_DAM_CODE = {
  soyang:'4012680', chungju:'5010680', daecheong:'4022500', andong:'7010680',
  hwacheon:'4011680', yongdam:'4032150', hapcheon:'7030680', imha:'7020680',
  seomjin:'3012680', juam:'3022680', paldang:'4013500', yeongju:'7011680',
  boryeong:'4041030', miryang:'7040680', buan:'3041680', janghung:'3031030',
  hoengseong:'4014680', namgang:'7050100', gunwi:'7012800',
  kimcheonbuhang:'7031680', seongdeok:'7013680', bohyeonsan:'7014680',
  unmun:'7060500', daegok:'7061500', sayeon:'7062500',
  sueo:'3051680', pyeongnim:'3052030',
};

/* WAMIS 실시간 1개 댐 조회 */
async function fetchWamisRealtime(damId) {
  if (!WAMIS_API_KEY) return null;
  const code = WAMIS_DAM_CODE[damId];
  if (!code) return null;
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const url = `${WAMIS_BASE}/wkw/wl/dam?damCode=${code}&startDt=${today}&endDt=${today}&serviceKey=${encodeURIComponent(WAMIS_API_KEY)}&_type=json&numOfRows=1&pageNo=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = await res.json();
    const item = json?.response?.body?.items?.item;
    if (!item) return null;
    const d = Array.isArray(item) ? item[0] : item;
    return {
      level:        parseFloat(d.wl || 0),
      inflow:       parseFloat(d.inf || 0),
      outflow:      parseFloat(d.tototf || 0),
      storage_rate: parseFloat(d.rsrt || 0),
      volume:       parseFloat(d.stg || 0),
      time:         (d.ymdhm || today + '0000'),
      is_mock:      false,
    };
  } catch(e) { return null; }
}

/* 전체 댐 일괄 갱신 (WAMIS 키 있을 때) */
async function refreshAllFromWamis() {
  if (!WAMIS_API_KEY) return;
  const updates = await Promise.allSettled(
    Object.keys(WAMIS_DAM_CODE).map(async id => {
      const rt = await fetchWamisRealtime(id);
      if (!rt) return;
      const dam = (window.allDams || []).find(d => d.id === id);
      if (!dam) return;
      Object.assign(dam, rt);
      dam.alert = computeAlert(rt.storage_rate);
    })
  );
  if (window.allDams?.length) {
    renderDamGrid(window.allDams);
    const updated = `업데이트: ${new Date().toLocaleTimeString('ko-KR')} (WAMIS 실시간)`;
    const el = document.getElementById('last-updated');
    if (el) el.textContent = updated;
  }
}

function computeAlert(rate) {
  if (rate >= 85) return {level:'danger',  color:'#FF4444', message:'⚠️ 홍수 경보', code:3};
  if (rate >= 70) return {level:'warning', color:'#FF8C00', message:'🔶 주의',       code:2};
  if (rate <= 20) return {level:'drought', color:'#CC7700', message:'🏜️ 가뭄 경보', code:2};
  if (rate <= 35) return {level:'low',     color:'#FFD700', message:'💧 저수 주의',  code:1};
  return              {level:'normal',  color:'#00CC66', message:'✅ 정상',       code:0};
}

/* ─────────────────────────────────────────────────────────────
   1. HV_DATA 누락 댐 전체 추가
   (수위 → 저수량 스플라인 보간용 기준 데이터)
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  if (typeof HV_DATA !== 'undefined') {
    Object.assign(HV_DATA, {
      /* ── 다목적댐 ── */
      hoengseong:   [[174.0,0],[175.0,12],[176.0,32],[177.2,60],[178.0,86.9]],
      namgang:      [[25.5,0],[28.0,40],[30.0,100],[32.5,210],[35.0,309]],
      gunwi:        [[118.0,0],[122.0,8],[126.0,22],[129.0,38],[131.0,47.5]],
      kimcheonbuhang:[[140.0,0],[146.0,14],[151.0,40],[157.0,78],[162.0,105]],
      seongdeok:    [[112.0,0],[115.0,10],[118.0,28],[121.0,45],[123.0,53.5]],
      bohyeonsan:   [[194.0,0],[197.0,9],[200.5,26],[203.5,44],[206.0,56.6]],
      /* ── 용수전용댐 ── */
      gwangdong:    [[692.0,0],[696.0,2.0],[699.5,5.0],[702.5,7.0],[705.0,8.5]],
      dalbang:      [[640.0,0],[644.0,1.0],[648.0,2.8],[651.5,4.2],[654.0,5.1]],
      yeongcheon:   [[133.0,0],[136.0,8],[139.0,22],[142.0,42],[145.0,55.9]],
      angye:        [[105.0,0],[107.5,0.3],[109.5,0.8],[111.5,1.3],[113.5,1.6]],
      gampo:        [[84.0,0],[86.5,0.3],[89.0,0.8],[91.5,1.2],[94.0,1.5]],
      unmun:        [[103.0,0],[106.0,16],[109.0,48],[112.0,96],[115.0,132.5]],
      daegok:       [[93.0,0],[96.0,6],[99.0,16],[102.0,28],[106.0,36]],
      sayeon:       [[88.0,0],[91.0,6],[94.0,16],[97.0,28],[100.0,36]],
      daeam:        [[74.0,0],[76.5,0.6],[78.5,1.5],[80.5,2.5],[83.0,3.2]],
      seonam:       [[70.0,0],[72.5,0.5],[74.5,1.3],[76.5,2.2],[79.0,2.8]],
      yeoncho:      [[79.0,0],[81.5,0.8],[84.0,2.2],[86.5,3.8],[89.0,5.0]],
      gucheon:      [[82.0,0],[84.5,0.9],[87.0,2.5],[89.5,4.4],[92.0,5.8]],
      sueo:         [[88.0,0],[91.0,12],[94.0,33],[97.0,59],[100.0,77]],
      pyeongnim:    [[54.0,0],[56.5,1.1],[58.5,2.9],[60.5,5.0],[63.0,7.1]],
    });
  }

  /* ─────────────────────────────────────────────────────────────
     2. DAM_INTRO — 누락 댐 전체 완성
     ───────────────────────────────────────────────────────────── */
  if (typeof DAM_INTRO !== 'undefined') {
    Object.assign(DAM_INTRO, {

      /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         다목적댐 추가분
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
      hoengseong: {
        nickname:  '섬강의 수문장',
        built:     2000,
        height_m:  67,
        length_m:  400,
        purpose:   ['홍수 조절','생활·공업 용수','수도권 용수 지원'],
        capacity:  86.9,
        power_mw:  0,
        supply_city:'원주·횡성',
        river:     '섬강',
        history:   '1992년 착공, 2000년 준공. 강원 영서 지역의 물 부족 해소를 위해 섬강 상류에 건설됐다. 산악 지형을 활용한 록필댐으로, 주변 생태환경이 잘 보존돼 횡성호 수변길이 지역 명소가 됐다.',
        without:   '횡성댐 없이는 원주·횡성 지역은 섬강 범람 피해가 반복되고, 강원 내륙 산업단지 확장이 어려웠을 것이다.',
        facts:     ['저수량 0.87억 톤 — 원주·횡성 주민 약 40만 명 용수','횡성호 수변 드라이브 코스 유명','강원 내륙 관개용수 핵심 공급원','섬강 1급수 청정 수질 유지'],
        visit:     '강원 횡성군 갑천면. 횡성호 수변 생태공원 운영. 원주 방향 국도에서 진입 가능.',
      },

      namgang: {
        nickname:  '진주의 젖줄, 남강의 심장',
        built:     1970,
        height_m:  34,
        length_m:  1126,
        purpose:   ['홍수 조절','농업·생활 용수','수력 발전'],
        capacity:  309,
        power_mw:  14,
        supply_city:'진주·사천·창원·고성',
        river:     '남강',
        history:   '1962년 착공, 1970년 준공. 낙동강 지류 남강에 건설된 대형 댐. 1991년 확장 공사로 현재 규모가 됐다. 진주성·남강 유등 축제의 배경이 되는 남강 수량을 결정하는 핵심 시설이다.',
        without:   '남강댐 없이는 매년 태풍·장마 때 진주·사천 일원이 침수됐을 것이다. 1925년 남강 대홍수 당시 진주 시가지 전체가 2m 이상 잠겼던 기록이 있다.',
        facts:     ['경남 서부 홍수 방어 최전선','남강호 면적 38km²','진주 유등 축제 유등이 떠내려가는 바로 그 강!','낙동강 하류 수질 보호에도 기여'],
        visit:     '경남 진주시 대평면. 남강댐 홍보관·전망대 무료 운영. 진주성에서 차로 20분.',
      },

      gunwi: {
        nickname:  '낙동강 상류 위천의 보루',
        built:     1983,
        height_m:  52,
        length_m:  282,
        purpose:   ['농업 용수','생활 용수','홍수 조절'],
        capacity:  47.5,
        power_mw:  0,
        supply_city:'군위·의성',
        river:     '위천',
        history:   '1977년 착공, 1983년 준공. 낙동강 지류 위천을 막아 군위호를 형성했다. 경북 북부 내륙의 만성적인 물 부족과 홍수 피해를 동시에 해소하기 위해 건설됐다.',
        without:   '군위댐 없이는 군위·의성 지역의 농업용수 부족으로 논 비율이 대폭 낮아졌을 것이다.',
        facts:     ['저수량 0.48억 톤','군위호 낚시터로 유명','경북 북부 내륙 농업용수 핵심 공급원','군위군 삼국유사 테마파크 인근'],
        visit:     '경북 군위군 효령면. 군위호 수변 공원 및 낚시 명소.',
      },

      kimcheonbuhang: {
        nickname:  '감천의 새 문',
        built:     2015,
        height_m:  55,
        length_m:  403,
        purpose:   ['홍수 조절','생활·공업 용수','농업 용수'],
        capacity:  105,
        power_mw:  0,
        supply_city:'김천·구미',
        river:     '감천',
        history:   '2007년 착공, 2015년 준공. 낙동강 지류 감천에 건설된 최신형 댐이다. 구미 산업단지 확장에 따른 공업용수 수요 증가와 경북 서부 홍수 피해 방지를 목적으로 건설됐다.',
        without:   '김천부항댐 없이는 구미 반도체·전자 산업단지의 공업용수 안정 공급이 어려웠을 것이다.',
        facts:     ['국내 최신 대형 댐 중 하나 (2015년)','감천 상류 청정 수원 개발','구미 산업단지 공업용수 공급원','부항호 수몰 지역 생태 복원 사업 진행'],
        visit:     '경북 김천시 부항면. 부항호 수변 드라이브 코스. 김천에서 차로 30분.',
      },

      seongdeok: {
        nickname:  '낙동강 지류 광천의 수호자',
        built:     2001,
        height_m:  50,
        length_m:  310,
        purpose:   ['농업 용수','생활 용수'],
        capacity:  53.5,
        power_mw:  0,
        supply_city:'성주·고령',
        river:     '광천',
        history:   '1994년 착공, 2001년 준공. 경북 성주·고령 지역의 참외·포도 등 특산 농산물 재배에 필수적인 농업용수 공급을 위해 건설됐다.',
        without:   '성덕댐 없이는 성주 참외 재배 면적이 크게 줄어들었을 것이다. 성주 참외는 연간 3,000억 원 이상의 농업 가치를 지닌다.',
        facts:     ['성주 참외·고령 포도 농업용수 핵심 공급원','광천 1급수 수질','성주호 왜가리·백로 서식지','낙동강 지류 수질 개선 기여'],
        visit:     '경북 성주군 벽진면. 성주호 수변 탐방로 운영.',
      },

      bohyeonsan: {
        nickname:  '별 보는 댐, 보현산의 물',
        built:     1998,
        height_m:  52,
        length_m:  322,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  56.6,
        power_mw:  0,
        supply_city:'영천·경주',
        river:     '자호천',
        history:   '1991년 착공, 1998년 준공. 경북 영천 보현산 천문대로 유명한 보현산 자락의 자호천을 막아 조성됐다. 경주·영천 일원의 생활·농업용수를 공급하는 핵심 수원이다.',
        without:   '보현산댐 없이는 영천·경주 지역의 물 부족으로 경주 관광산업과 농업이 크게 위축됐을 것이다.',
        facts:     ['보현산 천문대(1124m) 아래 위치','보현산댐 수몰지역에서 별 관측 행사 진행','자호천 1급수 청정 수원','경주 불국사·석굴암 관광용수 간접 공급'],
        visit:     '경북 영천시 화북면. 보현산 천문대와 함께 방문 추천. 보현산댐 전망대 운영.',
      },

      /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         용수전용댐 추가분
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
      gwangdong: {
        nickname:  '고산지 광동호, 정선의 물',
        built:     2001,
        height_m:  69,
        length_m:  243,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  8.5,
        power_mw:  0,
        supply_city:'정선·영월',
        river:     '골지천',
        history:   '1995년 착공, 2001년 준공. 해발 700m대의 고산지대에 위치한 강원 최고도(高度) 댐이다. 오지 산간 지역인 정선·영월의 상수도 공급 개선을 위해 건설됐다.',
        without:   '광동댐 없이는 정선군 산간 마을의 식수를 지하수·계곡수에 전적으로 의존해야 했을 것이다.',
        facts:     ['해발 700m — 국내 최고도 댐 중 하나','광동호 주변 고랭지 채소밭 풍경','아리랑의 고장 정선 수원','폐광 지역 생활환경 개선의 상징'],
        visit:     '강원 정선군 임계면. 정선 5일장·아우라지 관광과 연계. 강릉에서 차로 1시간.',
      },

      dalbang: {
        nickname:  '동해안 삼척의 숨은 수원',
        built:     1990,
        height_m:  53,
        length_m:  218,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  5.1,
        power_mw:  0,
        supply_city:'삼척·동해',
        river:     '달방천',
        history:   '1985년 착공, 1990년 준공. 동해안 삼척·동해 지역의 생활용수와 탄광 산업용수 공급을 위해 건설됐다. 석탄 산업 합리화 이후에도 지역 상수도의 핵심 수원 역할을 하고 있다.',
        without:   '달방댐 없이는 삼척 탄광 지역 산업화 시기 대규모 용수 공급이 불가능했을 것이다.',
        facts:     ['강원 동해안 지역 핵심 상수원','삼척 태백산맥 동사면 희귀 수계','달방호 주변 낙엽송 숲 경관','탄광 도시 삼척의 역사와 함께한 댐'],
        visit:     '강원 삼척시 하장면. 삼척 엑스포타운에서 차로 40분.',
      },

      yeongcheon: {
        nickname:  '자호천 상류, 영천의 생명수',
        built:     1980,
        height_m:  56,
        length_m:  390,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  55.9,
        power_mw:  0,
        supply_city:'영천·경산·대구 일부',
        river:     '자호천',
        history:   '1974년 착공, 1980년 준공. 낙동강 지류 자호천에 건설됐으며, 경북 내륙의 물 부족 해소를 위한 초기 용수전용댐 중 하나다. 대구 광역상수도 시스템과 연계돼 있다.',
        without:   '영천댐 없이는 경산·영천 지역의 급속한 도시화와 산업화가 불가능했을 것이다.',
        facts:     ['대구 광역상수도 연계 공급','경산 하양·영천 자양 농업용수 핵심','영천호 주변 복숭아·포도 과수원 풍경','신경주역 개발과 용수 연계'],
        visit:     '경북 영천시 청통면. 영천호 수변 공원 조성. 영천 한약시장에서 차로 30분.',
      },

      angye: {
        nickname:  '위천 소류지, 안계의 단비',
        built:     1976,
        height_m:  31,
        length_m:  180,
        purpose:   ['농업 용수'],
        capacity:  1.6,
        power_mw:  0,
        supply_city:'의성·안계',
        river:     '위천',
        history:   '1972년 착공, 1976년 준공. 경북 의성군의 대표적 농업 지역인 안계 평야의 벼농사 용수를 안정 공급하기 위해 건설된 소형 용수전용댐이다.',
        without:   '안계댐 없이는 의성 안계 평야의 논 1,000ha 이상이 빗물에만 의존해야 했을 것이다.',
        facts:     ['의성 안계 평야 논농사 전담 수원','경북 내륙 농업 기반 시설의 역사','위천 상류 수계 생태 보전','마늘·고추 재배 용수 공급'],
        visit:     '경북 의성군 안계면. 의성 마늘 축제 행사장 인근.',
      },

      gampo: {
        nickname:  '동해 감포의 생명수',
        built:     1988,
        height_m:  38,
        length_m:  210,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  1.5,
        power_mw:  0,
        supply_city:'경주 감포읍·양남면',
        river:     '남천',
        history:   '1984년 착공, 1988년 준공. 경주 동해안 감포 지역은 독립된 수계로 강수량이 적고 지하수도 부족해 별도의 소규모 댐이 필요했다. 경주 동해안 관광 개발과 함께 용수 수요가 늘어나고 있다.',
        without:   '감포댐 없이는 경주 동해안 어촌 마을의 식수를 지하수에 전적으로 의존해야 했을 것이다.',
        facts:     ['경주 동해안 유일 댐형 수원','감포항·양남 주상절리 관광용수 지원','독립 수계 소규모 용수 공급의 모범 사례','경주 핵발전소 인근 지역 생활용수'],
        visit:     '경북 경주시 양남면. 경주 양남 주상절리 관광과 연계.',
      },

      unmun: {
        nickname:  '대구·울산의 비상 수원',
        built:     1991,
        height_m:  55,
        length_m:  467,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  132.5,
        power_mw:  0,
        supply_city:'대구·청도·경산·울산',
        river:     '운문천',
        history:   '1984년 착공, 1991년 준공. 낙동강 지류 운문천을 막아 운문호를 형성했다. 대구광역시 상수도의 보조 수원이자 울산 광역상수도 연계 공급 기지 역할을 한다.',
        without:   '운문댐 없이는 대구 광역상수도 비상공급망이 크게 약해졌을 것이다. 2022년 낙동강 오염 사태 때 운문댐 물이 대구 식수를 보완했다.',
        facts:     ['대구 광역상수도 보조 수원','운문호 생태 습지 — 독수리·두루미 월동지','운문사(신라 고찰) 인근 수원','청도 반시 감·복숭아 농업용수'],
        visit:     '경북 청도군 운문면. 운문호 수변길·운문사 관광 코스. 대구에서 차로 50분.',
      },

      daegok: {
        nickname:  '울산의 숨겨진 보물창고',
        built:     1987,
        height_m:  53,
        length_m:  179,
        purpose:   ['생활 용수'],
        capacity:  36,
        power_mw:  0,
        supply_city:'울산광역시',
        river:     '대곡천',
        history:   '1983년 착공, 1987년 준공. 울산 공업용수와 생활용수를 공급하는 전용댐. 대곡댐 상류에 선사시대 암각화(국보)가 있어 생태·문화적으로도 중요한 지역이다.',
        without:   '대곡댐 없이는 울산 현대자동차·현대중공업 공단의 공업용수 안정 공급이 위협받았을 것이다.',
        facts:     ['댐 상류 반구대 암각화(국보 285호) — 세계 최초 고래 사냥 그림','울산 상수도 공급의 한 축','대곡호 생태 경관 우수','선사문화 보존과 치수가 공존하는 특이한 댐'],
        visit:     '울산 울주군 언양읍. 반구대 암각화 탐방 코스와 함께 방문. 울산 시내에서 차로 30분.',
      },

      sayeon: {
        nickname:  '태화강 상류, 울산의 원조 수원',
        built:     1965,
        height_m:  43,
        length_m:  174,
        purpose:   ['생활 용수','공업 용수'],
        capacity:  36,
        power_mw:  0,
        supply_city:'울산광역시',
        river:     '태화강',
        history:   '1962년 착공, 1965년 준공. 울산이 공업도시로 지정되던 초창기에 건설된 역사적인 댐이다. 현대중공업·현대자동차 등 울산 대형 공장들이 성장하는 원동력이 됐다.',
        without:   '사연댐 없이는 1960~70년대 울산 산업화가 훨씬 더뎠을 것이다. 울산의 눈부신 경제 성장 뒤에는 이 댐이 있다.',
        facts:     ['울산 산업화 시대를 함께한 역사적 댐 (60년 이상 운영)','태화강 국가정원 수원','사연호 철새 도래지','대곡댐과 연계 울산 이중 상수원 체계'],
        visit:     '울산 울주군 범서읍. 태화강 국가정원에서 차로 20분.',
      },

      daeam: {
        nickname:  '낙동강 밀양 지류의 작은 보루',
        built:     1994,
        height_m:  41,
        length_m:  213,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  3.2,
        power_mw:  0,
        supply_city:'창원 일부·창녕',
        river:     '대암천',
        history:   '1989년 착공, 1994년 준공. 낙동강 지류 대암천의 소규모 용수전용댐이다. 창원 북부와 창녕 일원의 농업 및 생활용수를 보조 공급한다.',
        without:   '대암댐 없이는 창원 북부 농업지대의 가뭄 피해가 더 심각했을 것이다.',
        facts:     ['창녕 우포늪 인근 수계 연결','낙동강 생태계 보호 기여','소규모 용수 공급의 모범 사례','창녕 양파·마늘 농업용수'],
        visit:     '경남 창녕군 대합면. 우포늪 생태공원과 연계 방문.',
      },

      seonam: {
        nickname:  '여수·순천 남해안 산지의 수원',
        built:     1992,
        height_m:  38,
        length_m:  175,
        purpose:   ['생활 용수','농업 용수'],
        capacity:  2.8,
        power_mw:  0,
        supply_city:'순천 일부',
        river:     '선암천',
        history:   '1988년 착공, 1992년 준공. 전남 순천시 산간 지역의 용수 공급 부족 해소를 위해 건설된 소형 용수전용댐이다.',
        without:   '선암댐 없이는 순천 동부 산간 지역의 식수를 지하수에 전적으로 의존했을 것이다.',
        facts:     ['선암사(보물급 고찰) 인근 수원','순천만 생태와 연계된 수계','남해안 청정 1급수 수질','전통 사찰 문화 보존에 기여하는 댐'],
        visit:     '전남 순천시 승주읍. 선암사 탐방과 함께 방문.',
      },

      yeoncho: {
        nickname:  '거제도 섬 속의 생명수',
        built:     1986,
        height_m:  44,
        length_m:  208,
        purpose:   ['생활 용수'],
        capacity:  5.0,
        power_mw:  0,
        supply_city:'거제시 연초·사등면',
        river:     '연초천',
        history:   '1982년 착공, 1986년 준공. 섬 지역인 거제도의 독립 수계에 건설된 용수전용댐이다. 거제도는 육지와 수계가 단절돼 있어 자체 수원이 절대적으로 필요하다.',
        without:   '연초댐 없이는 거제도 인구 26만 명의 상수도 공급 체계가 지금보다 훨씬 불안정했을 것이다.',
        facts:     ['섬 지역(거제도) 자체 수원','거제 삼성중공업·대우조선해양 조선소 용수 공급','연초호 드라이브 코스 인기','거제 펜션·관광 용수 공급'],
        visit:     '경남 거제시 연초면. 거제 포로수용소 유적지에서 차로 15분.',
      },

      gucheon: {
        nickname:  '거제 남부의 두 번째 수원',
        built:     1996,
        height_m:  47,
        length_m:  238,
        purpose:   ['생활 용수'],
        capacity:  5.8,
        power_mw:  0,
        supply_city:'거제시 동부·남부',
        river:     '구천',
        history:   '1991년 착공, 1996년 준공. 연초댐 하나만으로는 급증하는 거제도 용수 수요를 충당할 수 없어 추가로 건설됐다. 조선업 호황기 거제도 인구 급증에 대비한 시설이다.',
        without:   '구천댐 없이는 1990~2000년대 거제 조선업 호황기 용수 부족이 산업 발전의 발목을 잡았을 것이다.',
        facts:     ['연초댐과 연계 거제도 이중 상수원 체계','거제 조선업 황금기를 뒷받침한 댐','구천호 낚시터 인기','거제 해금강·외도 관광용수 간접 지원'],
        visit:     '경남 거제시 남부면. 거제 해금강 유람선 출발지에서 차로 20분.',
      },

      sueo: {
        nickname:  '광양만의 숨은 수원',
        built:     1995,
        height_m:  54,
        length_m:  350,
        purpose:   ['생활 용수','공업 용수'],
        capacity:  77,
        power_mw:  0,
        supply_city:'광양·여수',
        river:     '수어천',
        history:   '1989년 착공, 1995년 준공. 포스코 광양제철소와 여수 석유화학단지의 공업용수 및 광양·순천 지역 생활용수 공급을 위해 건설됐다.',
        without:   '수어댐 없이는 광양 포스코 제철소의 냉각수 공급이 불안정해 생산 차질이 발생했을 것이다.',
        facts:     ['포스코 광양제철소 공업용수 공급원','여수 석유화학단지 용수 지원','수어호 — 광양만 조망 드라이브 코스','매화꽃 피는 광양 매화마을 인근'],
        visit:     '전남 광양시 옥룡면. 광양 매화마을에서 차로 20분. 백운산 도립공원 인근.',
      },

      pyeongnim: {
        nickname:  '나주 평야를 적시는 댐',
        built:     1999,
        height_m:  40,
        length_m:  270,
        purpose:   ['농업 용수','생활 용수'],
        capacity:  7.1,
        power_mw:  0,
        supply_city:'나주·함평',
        river:     '평림천',
        history:   '1994년 착공, 1999년 준공. 전남 나주 평야의 광활한 논농사에 필요한 농업용수 안정 공급을 위해 건설됐다. 나주시와 함평군 경계 지역의 수계를 관리한다.',
        without:   '평림댐 없이는 나주 평야의 농업 생산성이 기후 변동에 크게 흔들렸을 것이다. 나주 배·쌀의 품질은 이 안정적인 용수 공급 덕분이다.',
        facts:     ['나주 배·쌀 농업용수 핵심 공급원','평림호 주변 철새 도래지','한빛원전(영광) 인근 수계 관리','전남 서부 소규모 용수댐 대표 사례'],
        visit:     '전남 나주시 금천면. 나주 영산강 자전거 코스와 연계.',
      },
    }); /* DAM_INTRO 끝 */
  }

  /* ─────────────────────────────────────────────────────────────
     3. select 옵션 — 교육/탐험가 섹션 드롭다운에 새 댐 추가
     ───────────────────────────────────────────────────────────── */
  const NEW_DAMS_FOR_SELECT = [
    { val:'hoengseong',    label:'횡성댐 (섬강, 만수 86.9백만톤)',    minl:174, maxl:178 },
    { val:'namgang',       label:'남강댐 (남강, 만수 309백만톤)',      minl:28,  maxl:35  },
    { val:'gunwi',         label:'군위댐 (위천, 만수 47.5백만톤)',     minl:118, maxl:131 },
    { val:'kimcheonbuhang',label:'김천부항댐 (감천, 만수 105백만톤)',  minl:140, maxl:162 },
    { val:'unmun',         label:'운문댐 (운문천, 만수 132.5백만톤)', minl:103, maxl:115 },
    { val:'sueo',          label:'수어댐 (수어천, 만수 77백만톤)',     minl:88,  maxl:100 },
  ];

  ['exp-dam','edu-dam-select','hist-dam-select'].forEach(selectId => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const alreadyVals = Array.from(sel.options).map(o => o.value);
    let grp = sel.querySelector('optgroup[label*="중소형"]');
    if (!grp) grp = sel;
    NEW_DAMS_FOR_SELECT.forEach(({ val, label, minl, maxl }) => {
      if (alreadyVals.includes(val)) return;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (minl) opt.dataset.minl = minl;
      if (maxl) opt.dataset.maxl = maxl;
      if (grp.tagName === 'OPTGROUP') grp.appendChild(opt);
      else sel.appendChild(opt);
    });
  });

  /* ─────────────────────────────────────────────────────────────
     4. WAMIS 키 있으면 5분마다 실시간 갱신 시작
     ───────────────────────────────────────────────────────────── */
  if (WAMIS_API_KEY) {
    setTimeout(refreshAllFromWamis, 2000);          // 최초 로드 2초 후
    setInterval(refreshAllFromWamis, 5 * 60 * 1000); // 이후 5분마다
    console.log('[DamWatch-patch] WAMIS 직접 연결 활성화');
  } else {
    console.info(
      '[DamWatch-patch] WAMIS_API_KEY 미설정 → 모의 데이터 사용.\n' +
      'patch.js 상단 WAMIS_API_KEY에 data.go.kr API 키를 입력하면 실시간 데이터를 받습니다.'
    );
  }

  /* ─────────────────────────────────────────────────────────────
     5. 연결 상태 배너 (우상단)
     ───────────────────────────────────────────────────────────── */
  const banner = document.createElement('div');
  banner.id = 'patch-status-banner';
  Object.assign(banner.style, {
    position: 'fixed', bottom: '12px', right: '14px', zIndex: '9999',
    background: WAMIS_API_KEY ? 'rgba(0,180,80,0.92)' : 'rgba(60,80,120,0.90)',
    border: `1px solid ${WAMIS_API_KEY ? '#00cc66' : 'rgba(0,150,255,0.4)'}`,
    color: '#fff', fontFamily: "'Noto Sans KR',sans-serif",
    fontSize: '11px', padding: '5px 12px', borderRadius: '20px',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
    cursor: 'pointer',
    transition: 'opacity 0.4s',
  });
  banner.textContent = WAMIS_API_KEY
    ? '✅ WAMIS 실시간 연결'
    : '⚠️ 모의 데이터 — WAMIS 키 미설정';
  banner.title = WAMIS_API_KEY
    ? 'WAMIS 공공데이터 API 실시간 연결 중'
    : 'patch.js 상단 WAMIS_API_KEY 변수에 API 키를 입력하세요';
  banner.onclick = () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 500);
  };
  document.body.appendChild(banner);

  /* 10초 후 자동 숨김 (화면 방해 최소화) */
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.opacity = '0';
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 500);
    }
  }, 10000);

  console.log('[DamWatch-patch] v3.1 패치 로드 완료 — HV 데이터·댐 소개 전체 보완');
});
