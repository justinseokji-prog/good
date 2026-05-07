// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ▼▼▼ 여기에 API 키를 입력하세요 ▼▼▼
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const KMA_API_KEY = "a50769958abbb8124ed0f48bdd5cb0841bbf509a1a2a5d741f8e35e56dc5f7c1";
const AIR_API_KEY = "9f84be7b8da01571f296c24da19af99137e883b3a55546affe686c7b992ae819";
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10분
const HISTORY_MAX = 6;
const history = { wind: [], rain: [], labels: [] };
let countdown = REFRESH_INTERVAL / 1000;
let countdownTimer = null;
let refreshTimer = null;
let historyChart = null;

const state = {
  portrait: true,
  captureOnly: false
};

const laws = {
  rain: { title: '강수량 관련 기준', body: '<p>건설현장에서 강수량이 많아질 경우 철골 작업, 고소작업, 양중 작업을 제한해야 합니다.</p><ul><li>철골작업은 강우·강설 조건에서 중지 판단을 우선 검토합니다.</li><li>현장별 자체 기준, 장비 매뉴얼, 감독자 지시를 함께 반영해야 합니다.</li></ul>' },
  wind: { title: '풍속 관련 기준', body: '<p>타워크레인 설치·해체·점검은 풍속 10m/s 초과 시 중지 판단을 검토하고, 운전은 15m/s 초과 시 중지합니다.</p><ul><li>타워크레인 폭풍 이탈방지 조치도 함께 확인합니다.</li><li>강풍 시 양중, 외부 고소작업도 보수적으로 판단합니다.</li></ul>' },
  dust: { title: '미세먼지 관련 기준', body: '<p>미세먼지가 높을 경우 호흡보호구 착용, 노출 작업 조정, 야외작업 시간 축소를 권장합니다.</p><ul><li>작업자 건강보호 수칙을 별도 적용합니다.</li><li>장시간 외부작업은 보건관리자 판단 하에 조정합니다.</li></ul>' },
  yellowdust: { title: '황사 관련 기준', body: '<p>황사 경보 또는 고농도 황사 상황에서는 분진 비산 작업, 외부 절단·연마 작업, 장시간 노출 작업을 제한합니다.</p><ul><li>보안경, 방진마스크, 밀폐형 보호장비를 준비합니다.</li><li>재난문자 및 기상특보를 함께 확인합니다.</li></ul>' },
  dry: { title: '건조주의보 기준', body: '<p>건조주의보 시 화재위험 작업은 더욱 보수적으로 관리해야 합니다.</p><ul><li>용접, 절단, 가열작업은 화재감시자 배치가 필요합니다.</li><li>소화기, 방화포, 주변 가연물 정리가 필수입니다.</li></ul>' },
  temp: { title: '기온 관련 기준', body: '<p>기온이 낮거나 높을 때는 콘크리트 타설, 장시간 야외작업, 보온·열스트레스 관리가 중요합니다.</p><ul><li>저온 시 동결 방지와 양생 관리가 필요합니다.</li><li>고온 시 수분 보충과 휴식 시간을 늘려야 합니다.</li></ul>' }
};

function $(id) { return document.getElementById(id); }

// ── 지역 드롭다운 ──
function populateRegion1() {
  const sel = $('region1'); sel.innerHTML = '';
  Object.keys(REGIONS).forEach(k => { const o = document.createElement('option'); o.textContent = k; sel.appendChild(o); });
  populateRegion2();
}
function populateRegion2() {
  const sel = $('region2'); sel.innerHTML = '';
  const data = REGIONS[$('region1').value] || {};
  Object.keys(data).forEach(k => { const o = document.createElement('option'); o.textContent = k; sel.appendChild(o); });
  populateRegion3();
}
function populateRegion3() {
  const sel = $('region3'); sel.innerHTML = '';
  const r1 = REGIONS[$('region1').value] || {};
  const info = r1[$('region2').value];
  if (info && info.d) { info.d.forEach(k => { const o = document.createElement('option'); o.textContent = k; sel.appendChild(o); }); }
}
function getGrid() {
  const r1 = REGIONS[$('region1').value] || {};
  const info = r1[$('region2').value];
  return info ? { nx: info.nx, ny: info.ny, st: info.st } : { nx: 60, ny: 127, st: "종로구" };
}

// ── 날짜/시간 유틸 ──
function getBaseDateTime() {
  const now = new Date(Date.now() - 40 * 60000);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  return { base_date: `${y}${m}${d}`, base_time: `${h}00` };
}

// ── 기상청 초단기실황 API ──
async function fetchKMA(nx, ny) {
  if (!KMA_API_KEY || KMA_API_KEY.includes('여기에')) return null;
  try {
    const { base_date, base_time } = getBaseDateTime();
    const key = encodeURIComponent(KMA_API_KEY);
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${key}&pageNo=1&numOfRows=10&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
    const res = await fetch(url);
    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    if (!items) return null;
    const map = {};
    items.forEach(i => { map[i.category] = parseFloat(i.obsrValue); });
    return { temp: map.T1H || 0, rain: map.RN1 || 0, wind: map.WSD || 0, humidity: map.REH || 50 };
  } catch (e) { console.warn('기상청 API 오류:', e); return null; }
}

// ── 에어코리아 대기질 API ──
async function fetchAir(stationName) {
  if (!AIR_API_KEY || AIR_API_KEY.includes('여기에')) return null;
  try {
    const url = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIR_API_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName=${encodeURIComponent(stationName)}&dataTerm=DAILY&ver=1.0`;
    const res = await fetch(url);
    const json = await res.json();
    const item = json?.response?.body?.items?.[0];
    if (!item) return null;
    return { pm25: parseInt(item.pm25Value) || 0, pm10: parseInt(item.pm10Value) || 0 };
  } catch (e) { console.warn('에어코리아 API 오류:', e); return null; }
}

// ── 시뮬레이션 폴백 ──
function randomData() {
  return {
    wind: +(6 + Math.random() * 14).toFixed(1),
    rain: +(Math.random() * 3).toFixed(1),
    pm25: Math.floor(15 + Math.random() * 120),
    pm10: Math.floor(20 + Math.random() * 220),
    humidity: Math.floor(25 + Math.random() * 60),
    temp: +(18 + Math.random() * 16).toFixed(1),
    sky: ['맑음', '구름조금', '흐림', '비'][Math.floor(Math.random() * 4)],
    special: ['없음', '강풍주의보', '건조주의보', '황사주의보'][Math.floor(Math.random() * 4)],
    time: new Date().toLocaleString('ko-KR', { hour12: false }),
    source: '시뮬레이션'
  };
}

// ── 실제 데이터 가져오기 (실패 시 폴백) ──
async function fetchData() {
  const grid = getGrid();
  const kma = await fetchKMA(grid.nx, grid.ny);
  const air = await fetchAir(grid.st);
  if (kma && air) {
    return {
      wind: kma.wind, rain: kma.rain, humidity: kma.humidity, temp: kma.temp,
      pm25: air.pm25, pm10: air.pm10,
      sky: kma.rain > 0 ? '비' : kma.humidity > 80 ? '흐림' : '맑음',
      special: '없음',
      time: new Date().toLocaleString('ko-KR', { hour12: false }),
      source: '실시간 API'
    };
  }
  if (kma) {
    const fb = randomData();
    return {
      ...fb, wind: kma.wind, rain: kma.rain, humidity: kma.humidity, temp: kma.temp,
      sky: kma.rain > 0 ? '비' : kma.humidity > 80 ? '흐림' : '맑음', source: '기상청 API + 시뮬레이션'
    };
  }
  if (air) {
    const fb = randomData();
    return { ...fb, pm25: air.pm25, pm10: air.pm10, source: '에어코리아 API + 시뮬레이션' };
  }
  return randomData();
}

// ── 이력 차트 ──
function updateHistory(d) {
  const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  history.labels.push(t);
  history.wind.push(d.wind);
  history.rain.push(d.rain);
  if (history.labels.length > HISTORY_MAX) {
    history.labels.shift(); history.wind.shift(); history.rain.shift();
  }
  renderChart();
}
function renderChart() {
  const ctx = $('historyChart');
  if (!ctx) return;
  if (historyChart) { historyChart.destroy(); }
  historyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.labels,
      datasets: [
        { label: '풍속 (m/s)', data: history.wind, borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)', tension: 0.3, fill: true, pointRadius: 4, pointBackgroundColor: '#58a6ff' },
        { label: '강수량 (mm)', data: history.rain, borderColor: '#f85149', backgroundColor: 'rgba(248,81,73,0.1)', tension: 0.3, fill: true, pointRadius: 4, pointBackgroundColor: '#f85149' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9aa4b2', font: { size: 11, family: 'Noto Sans KR' } } } },
      scales: {
        x: { ticks: { color: '#66707e', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#66707e', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ── 카운트다운 ──
function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdown = REFRESH_INTERVAL / 1000;
  const el = $('countdownText');
  countdownTimer = setInterval(() => {
    countdown--;
    if (countdown < 0) countdown = REFRESH_INTERVAL / 1000;
    const m = Math.floor(countdown / 60);
    const s = countdown % 60;
    if (el) el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);
}

// ── UI 업데이트 ──
function formatState(el, level, text) { el.className = 'pill ' + level; el.textContent = text; }

function updateUI(d) {
  $('rainValue').textContent = d.rain.toFixed(1);
  $('windValue').textContent = d.wind.toFixed(1);
  $('pm25Value').textContent = d.pm25;
  $('pm10Value').textContent = d.pm10;
  $('humidityValue').textContent = d.humidity;
  $('tempValue').textContent = d.temp.toFixed(1);
  $('obsTime').textContent = d.time;
  $('skyText').textContent = d.sky;
  $('specialText').textContent = d.special;
  $('pm25Text').textContent = d.pm25 >= 75 ? '나쁨' : d.pm25 >= 35 ? '보통' : '좋음';
  $('pm10Text').textContent = d.pm10 >= 200 ? '매우 나쁨' : d.pm10 >= 80 ? '나쁨' : '보통';
  $('stationTag').textContent = $('region1').value + ' ' + $('region2').value + ' ' + $('region3').value;
  const src = $('sourceTag');
  if (src) src.textContent = d.source || '시뮬레이션';

  const rainLevel = d.rain >= 1 ? 'danger' : d.rain >= 0.5 ? 'warn' : 'safe';
  const windLevel = d.wind >= 15 ? 'danger' : d.wind >= 10 ? 'warn' : 'safe';
  const pm25Level = d.pm25 >= 75 ? 'danger' : d.pm25 >= 35 ? 'warn' : 'safe';
  const pm10Level = d.pm10 >= 150 ? 'danger' : d.pm10 >= 80 ? 'warn' : 'safe';
  const humidityLevel = d.humidity <= 35 ? 'warn' : 'safe';
  const tempLevel = d.temp >= 33 ? 'warn' : d.temp <= 0 ? 'danger' : 'safe';

  $('rainBar').style.width = Math.min(d.rain * 40, 100) + '%';
  $('windBar').style.width = Math.min(d.wind * 6, 100) + '%';
  $('pm25Bar').style.width = Math.min(d.pm25, 100) + '%';
  $('pm10Bar').style.width = Math.min(d.pm10 / 2, 100) + '%';
  $('humidityBar').style.width = Math.min(d.humidity, 100) + '%';
  $('tempBar').style.width = Math.min(Math.max(d.temp, 0) / 40 * 100, 100) + '%';

  const colors = { danger: 'var(--danger)', warn: 'var(--warn)', safe: 'var(--safe)' };
  $('rainBar').style.background = colors[rainLevel];
  $('windBar').style.background = windLevel === 'safe' ? 'var(--primary-2)' : colors[windLevel];
  $('pm25Bar').style.background = colors[pm25Level];
  $('pm10Bar').style.background = pm10Level === 'danger' ? 'var(--info)' : colors[pm10Level];
  $('humidityBar').style.background = humidityLevel === 'warn' ? 'var(--warn)' : 'var(--safe)';
  $('tempBar').style.background = colors[tempLevel];

  formatState($('rainState'), rainLevel, rainLevel === 'danger' ? '중지' : rainLevel === 'warn' ? '주의' : '정상');
  formatState($('windState'), windLevel, windLevel === 'danger' ? '중지' : windLevel === 'warn' ? '주의' : '정상');
  formatState($('pm25State'), pm25Level, pm25Level === 'danger' ? '주의' : pm25Level === 'warn' ? '관찰' : '정상');
  formatState($('pm10State'), pm10Level, pm10Level === 'danger' ? '주의' : pm10Level === 'warn' ? '관찰' : '정상');
  formatState($('humidityState'), humidityLevel, humidityLevel === 'warn' ? '건조' : '정상');
  formatState($('tempState'), tempLevel, tempLevel === 'danger' ? '중지' : tempLevel === 'warn' ? '주의' : '정상');

  const rules = {
    towerInstall: d.wind > 10, towerOp: d.wind > 15,
    steel: d.wind >= 10 || d.rain >= 1,
    weld: d.humidity <= 35 || d.rain >= 1 || d.wind >= 10,
    height: d.wind >= 10 || d.rain >= 1,
    dry: d.humidity <= 35
  };
  $('ruleTowerInstall').className = 'rule-status ' + (rules.towerInstall ? 'danger' : 'safe');
  $('ruleTowerInstall').textContent = rules.towerInstall ? '중지' : '가능';
  $('ruleTowerOp').className = 'rule-status ' + (rules.towerOp ? 'danger' : 'safe');
  $('ruleTowerOp').textContent = rules.towerOp ? '중지' : '가능';
  $('ruleSteel').className = 'rule-status ' + (rules.steel ? 'danger' : 'safe');
  $('ruleSteel').textContent = rules.steel ? '중지' : '가능';
  $('ruleWeld').className = 'rule-status ' + (rules.weld ? 'warn' : 'safe');
  $('ruleWeld').textContent = rules.weld ? '주의' : '가능';
  $('ruleHeight').className = 'rule-status ' + (rules.height ? 'danger' : 'safe');
  $('ruleHeight').textContent = rules.height ? '중지' : '가능';
  $('ruleDry').className = 'rule-status ' + (rules.dry ? 'warn' : 'safe');
  $('ruleDry').textContent = rules.dry ? '주의' : '가능';

  const danger = rules.towerOp || rules.steel || rules.height;
  const warn = !danger && (rules.towerInstall || pm25Level !== 'safe' || pm10Level !== 'safe' || rules.dry);
  $('mainDot').style.background = danger ? 'var(--danger)' : warn ? 'var(--warn)' : 'var(--safe)';
  $('mainDot').style.boxShadow = danger ? '0 0 0 6px rgba(248,81,73,.12)' : warn ? '0 0 0 6px rgba(210,153,34,.12)' : '0 0 0 6px rgba(63,185,80,.12)';
  $('statusTitle').textContent = danger ? '즉시 작업 중지 필요' : warn ? '주의 필요' : '작업 가능';
  $('statusDesc').textContent = danger ? '현재 조건이 공종별 작업중지 기준을 초과했습니다. 현장 판단을 우선하세요.' : warn ? '일부 항목이 주의 수준입니다. 미세먼지·건조·풍속을 함께 확인하세요.' : '현재 기상 조건이 기준 이내입니다. 일반 안전수칙을 유지하세요.';

  updateHistory(d);
}

// ── 메인 갱신 ──
async function refresh() {
  const d = await fetchData();
  updateUI(d);
  startCountdown();
}

// ── 모드 전환 ──
function setMode(portrait) {
  state.portrait = portrait;
  $('deviceFrame').classList.toggle('landscape', !portrait);
  $('viewMode').value = portrait ? 'portrait' : 'landscape';
  $('portraitBtn').classList.toggle('primary', portrait);
  $('landscapeBtn').classList.toggle('primary', !portrait);
}
function setCaptureMode(on) {
  state.captureOnly = on;
  document.body.classList.toggle('capture-only', on);
  $('captureBtn').textContent = on ? '캡처 종료' : '캡처';
  $('captureBtn2').textContent = on ? '캡처 종료' : '캡처 모드';
}

// ── 캡처/공유 ──
async function captureScreen() {
  const target = $('screenShotArea');
  const canvas = await html2canvas(target, { backgroundColor: '#0f1117', scale: 2 });
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a'); a.href = url; a.download = 'construction-weather-monitor.png'; a.click();
}
async function shareApp() {
  const title = '건설 기상 안전 모니터';
  const text = '건설현장 기상·특보·미세먼지·법령 판단 앱';
  const url = location.href;
  if (navigator.share) { try { await navigator.share({ title, text, url }); } catch (e) { } }
  else { await navigator.clipboard.writeText(url); alert('링크를 복사했습니다.'); }
}
function openLaw(key) { $('lawTitle').textContent = laws[key].title; $('lawBody').innerHTML = laws[key].body; $('lawModal').classList.add('show'); }
function closeLaw() { $('lawModal').classList.remove('show'); }

// ── 초기화 ──
document.addEventListener('DOMContentLoaded', () => {
  populateRegion1();
  $('region1').addEventListener('change', () => { populateRegion2(); refresh(); });
  $('region2').addEventListener('change', () => { populateRegion3(); refresh(); });
  $('region3').addEventListener('change', () => { refresh(); });
  $('portraitBtn').addEventListener('click', () => setMode(true));
  $('landscapeBtn').addEventListener('click', () => setMode(false));
  $('viewMode').addEventListener('change', e => setMode(e.target.value === 'portrait'));
  $('fullscreenBtn').addEventListener('click', () => setCaptureMode(!state.captureOnly));
  $('captureBtn').addEventListener('click', () => setCaptureMode(!state.captureOnly));
  $('captureBtn2').addEventListener('click', () => setCaptureMode(!state.captureOnly));
  $('shareBtn').addEventListener('click', shareApp);
  $('shareBtn2').addEventListener('click', shareApp);
  $('refreshBtn').addEventListener('click', () => refresh());
  $('closeModal').addEventListener('click', closeLaw);
  $('lawModal').addEventListener('click', e => { if (e.target.id === 'lawModal') closeLaw(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLaw(); });
  document.querySelectorAll('[data-law]').forEach(btn => { btn.addEventListener('click', () => openLaw(btn.dataset.law)); });
  setMode(true);
  refresh();
  refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
});
