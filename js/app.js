'use strict';
/* 하루어휘 · Morning Words
 * 데이터(스키마 v2): data/index.json (날짜별 상태) + data/days/YYYY-MM-DD.json
 *   하루 = 언어별 학습 세트 3개(광둥어·영어·중국어), 각 세트 = 단어 목록 + 그 단어를 모두 쓴 통합 글 1편
 * 학습 기록: 이 기기의 localStorage (개인용, 서버 없음)
 */

const LANGS = [
  { key: 'yue', label: '광둥어', htmlLang: 'yue-Hans', speech: 'zh-HK', rdLabel: 'Jyutping' },
  { key: 'en',  label: '영어',   htmlLang: 'en',          speech: 'en-US', rdLabel: '' },
  { key: 'zh',  label: '중국어', htmlLang: 'zh-Hans',     speech: 'zh-CN', rdLabel: '병음' },
  { key: 'ja',  label: '일본어', htmlLang: 'ja',          speech: 'ja-JP', rdLabel: '후리가나' },
  { key: 'ko',  label: '한국어', htmlLang: 'ko',          speech: 'ko-KR', rdLabel: '' },
];
const LANG = Object.fromEntries(LANGS.map((l) => [l.key, l]));
const DEFAULT_CONFIG = {
  generateAt: '08:45',
  counts: { yue: 5, en: 10, zh: 10, ja: 5, ko: 10 },
  levels: {
    yue: { label: '완전 초급' },
    en: { label: '토익스피킹 대비' },
    zh: { label: 'HSK 4~6급', standard: 'HSK 2.0 (6급제) 기준 4~6급 어휘' },
    ja: { label: '완전 초급 (JLPT N5 이하)' },
    ko: { label: '사회통합프로그램 4단계 이상' },
  },
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const STATE_LABEL = {
  none: '자료 없음', generating: '생성 중', failed: '생성 실패',
  before: '학습 전', progress: '학습 중', complete: '학습 완료', future: '예정',
};
const STATE_SHORT = {
  none: '없음', generating: '생성중', failed: '실패',
  before: '학습 전', progress: '학습 중', complete: '완료', future: '예정',
};

/* ---------- 유틸 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmt(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmt(d); };
const dotted = (s) => s.replaceAll('-', '.');
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M5.6 7.6l2 2M3 14h2M19 14h2M18.4 7.6l-2 2M7 19a5 5 0 0 1 10 0M3 19h18"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
};

/* ---------- 저장소 (학습 기록) ---------- */
const KEY = 'haru-eohwi.v1';
const DEFAULT_SETTINGS = { theme: 'auto', topic: '실생활', hideMeaning: false };
function emptyStore() { return { done: {}, read: {}, review: {}, days: {}, settings: {}, lastSync: null }; }
function loadStore() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    return { ...emptyStore(), ...(o && typeof o === 'object' ? o : {}) };
  } catch { return emptyStore(); }
}
let S = loadStore();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('저장 공간을 사용할 수 없어요. 기록이 유지되지 않을 수 있어요.'); } }
const setting = (k) => S.settings[k] ?? DEFAULT_SETTINGS[k];

/* ---------- 앱 상태 ---------- */
const st = {
  view: 'daily',
  date: todayStr(),
  lang: 'yue',
  reviewLang: 'all',
  index: null,          // data/index.json (null = 불러오지 못함)
  indexOk: false,
  config: DEFAULT_CONFIG,
  days: {},             // date -> {state, data, message}
  revealed: new Set(),  // 뜻 가리기에서 개별로 연 단어
  ui: {},               // `${date}|${lang}` -> {ko, rd}  (글 번역/발음 보기)
  pop: null,            // 강조 단어 팝업 { date, lang, wordId }
  speaking: null,       // 글 전체 듣기 재생 중인 `${date}|${lang}`
};

/* ---------- 데이터 로딩 ---------- */
async function getJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return { json: await res.json() };
}

async function loadMeta() {
  try {
    const r = await getJSON('data/index.json');
    st.index = r.json && typeof r.json.days === 'object' ? r.json : { days: {} };
    st.indexOk = !r.missing;
    S.lastSync = Date.now(); save();
  } catch { st.index = null; st.indexOk = false; }
  try {
    const r = await getJSON('data/config.json');
    if (r.json) st.config = {
      ...DEFAULT_CONFIG, ...r.json,
      counts: { ...DEFAULT_CONFIG.counts, ...(r.json.counts || {}) },
      levels: { ...DEFAULT_CONFIG.levels, ...(r.json.levels || {}) },
    };
  } catch { /* 기본값 */ }
}

function indexEntry(date) { return st.index?.days?.[date] || null; }

async function loadDay(date, force = false) {
  if (date > todayStr()) { st.days[date] = { state: 'future' }; return; }
  if (!force && st.days[date] && st.days[date].state !== 'loading') return;
  st.days[date] = { state: 'loading' };
  render();

  const entry = indexEntry(date);
  if (st.index && st.indexOk && !entry) { st.days[date] = { state: 'none' }; return; }
  if (entry && entry.status === 'generating') { st.days[date] = { state: 'generating', message: entry.message }; return; }
  if (entry && entry.status === 'failed') { st.days[date] = { state: 'failed', message: entry.message }; return; }
  try {
    const r = await getJSON(`data/days/${date}.json`);
    if (r.missing) {
      st.days[date] = entry ? { state: 'failed', message: '목록에는 있지만 자료 파일을 찾을 수 없어요.' } : { state: 'none' };
      return;
    }
    const data = normalizeDay(r.json, date);
    if (data.status === 'generating') { st.days[date] = { state: 'generating', message: data.message }; return; }
    if (data.status === 'failed') { st.days[date] = { state: 'failed', message: data.message }; return; }
    if (!data.totalWords) { st.days[date] = { state: 'none' }; return; }
    st.days[date] = { state: 'ready', data };
    const totals = { total: data.totalWords, passages: data.passageCount, ...Object.fromEntries(LANGS.map((l) => [l.key, data.sets[l.key].words.length])) };
    S.days[date] = { ...(S.days[date] || {}), totals };
    updateCompletion(date); save();
  } catch (e) {
    const legacy = e && e.legacy;
    st.days[date] = { state: 'failed', message: legacy ? '이전 형식의 자료라 표시할 수 없어요.' : (navigator.onLine ? '자료를 불러오지 못했어요.' : '오프라인이라 아직 받지 않은 날짜는 볼 수 없어요.') };
  }
}

/** 후리가나 조각 [{t, r?}] 이 원문과 일치할 때만 사용 (아니면 null → 후리가나 없이 표시) */
function validRuby(ruby, base) {
  if (!Array.isArray(ruby) || !ruby.length) return null;
  if (!ruby.every((g) => g && typeof g.t === 'string' && g.t && (g.r === undefined || typeof g.r === 'string'))) return null;
  return ruby.map((g) => g.t).join('') === base ? ruby.map((g) => (g.r === undefined ? { t: g.t } : { t: g.t, r: g.r })) : null;
}

/** 문법 설명(참고용). 문장 번호·표현이 있는 것만 남기고, 없으면 null */
function normalizeGrammar(g, n) {
  if (!g || typeof g !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v : '');
  const blocks = (Array.isArray(g.sentences) ? g.sentences : []).map((b) => ({
    sentence: Number.isInteger(b?.sentence) ? b.sentence : 0,
    items: (Array.isArray(b?.items) ? b.items : []).filter((it) => it && str(it.pattern) && str(it.explain))
      .map((it) => ({ pattern: str(it.pattern), title: str(it.title), explain: str(it.explain) })),
  })).filter((b) => b.sentence >= 1 && b.sentence <= n && b.items.length);
  const summary = (Array.isArray(g.summary) ? g.summary : []).filter((x) => typeof x === 'string' && x.trim());
  const compare = (Array.isArray(g.compare) ? g.compare : []).filter((r) => r && str(r.this) && str(r.other)).map((r) => ({ this: r.this, other: r.other }));
  return blocks.length || summary.length || compare.length ? { blocks, summary, compare } : null;
}

/** 자료 JSON → 화면용 구조. 단어 연결 정보(uses)는 원문과 일치하는 것만 사용한다. */
function normalizeDay(j, date) {
  const status = j?.status || 'ready';
  const base = { date: j?.date || date, status, message: j?.message || '', generatedAt: j?.generatedAt || null };
  if (status !== 'ready') return { ...base, sets: {}, totalWords: 0, passageCount: 0 };
  if (j?.schemaVersion !== 2 || !j.sets) { const e = new Error('legacy'); e.legacy = true; throw e; }
  const sets = {};
  let totalWords = 0, passageCount = 0;
  for (const l of LANGS) {
    const s = j.sets[l.key] || {};
    const words = (Array.isArray(s.words) ? s.words : []).filter((w) => w && w.id && w.word).map((w) => ({
      id: String(w.id), word: String(w.word), reading: w.reading || '', meaning: w.meaning || '', meaningZh: w.meaningZh || '', pos: w.pos || '',
      ruby: validRuby(w.ruby, String(w.word)),
    }));
    let passage = null;
    const p = s.passage;
    if (p && Array.isArray(p.sentences) && p.sentences.length) {
      passage = {
        title: p.title || '', titleKo: p.titleKo || '', titleZh: p.titleZh || '', situation: p.situation || '',
        sentences: p.sentences.filter((x) => x && x.text).map((x) => ({
          text: String(x.text), ko: x.ko || '', zh: x.zh || '', reading: x.reading || '', ruby: validRuby(x.ruby, String(x.text)),
          uses: (Array.isArray(x.uses) ? x.uses : [])
            .filter((u) => u && Number.isInteger(u.start) && Number.isInteger(u.end) && String(x.text).slice(u.start, u.end) === u.text && words.some((w) => w.id === u.wordId))
            .sort((a, b) => a.start - b.start)
            .filter((u, i, arr) => i === 0 || u.start >= arr[i - 1].end),
        })),
      };
    }
    if (passage) passage.grammar = normalizeGrammar(p.grammar, passage.sentences.length);
    sets[l.key] = { level: s.level || '', hskStandard: s.hskStandard || '', words, passage };
    totalWords += words.length;
    if (passage) passageCount++;
  }
  return { ...base, sets, totalWords, passageCount };
}

/* ---------- 진행 집계 ---------- */
const doneKey = (date, id) => `${date}|${id}`;
const readKey = (date, lang) => `${date}|${lang}`;
const isDone = (date, id) => !!S.done[doneKey(date, id)];
const isRead = (date, lang) => !!S.read[readKey(date, lang)];

/** 날짜별 집계: 단어 완료(언어별/전체) + 글 읽기 완료(언어별/전체) */
function counts(date) {
  const t = S.days[date]?.totals;
  const done = Object.fromEntries(LANGS.map((l) => [l.key, 0]));
  const prefix = date + '|';
  for (const k in S.done) {
    if (!k.startsWith(prefix)) continue;
    const l = k.slice(prefix.length).split('-')[0];
    if (l in done) done[l]++;
  }
  const read = Object.fromEntries(LANGS.map((l) => [l.key, false]));
  for (const l of LANGS) read[l.key] = isRead(date, l.key);
  if (t) for (const l of LANGS) done[l.key] = Math.min(done[l.key], t[l.key] ?? done[l.key]);
  const sum = Object.values(done).reduce((n, v) => n + v, 0);
  const reads = LANGS.filter((l) => read[l.key]).length;
  const total = t ? t.total : 0;
  const passages = t ? (t.passages ?? 3) : 0;
  return { done, read, sum, reads, total, passages, byLangTotal: t || Object.fromEntries(LANGS.map((l) => [l.key, 0])) };
}

function dayState(date) {
  if (date > todayStr()) return 'future';
  const e = indexEntry(date);
  const cached = st.days[date];
  if (cached && ['none', 'generating', 'failed'].includes(cached.state)) return cached.state;
  if (st.index && st.indexOk && !e) return 'none';
  if (e?.status === 'generating') return 'generating';
  if (e?.status === 'failed') return 'failed';
  if (!st.index && !S.days[date]?.totals) return cached?.state === 'ready' ? learnState(date) : 'none';
  return learnState(date);
}
/** 하루 완료 = 단어 전부 + 세 언어의 글 읽기 전부 */
function learnState(date) {
  const c = counts(date);
  if (c.total && c.sum >= c.total && c.reads >= c.passages) return 'complete';
  if (c.sum > 0 || c.reads > 0) return 'progress';
  return 'before';
}

function updateCompletion(date) {
  const d = (S.days[date] = S.days[date] || {});
  if (learnState(date) === 'complete') { if (!d.completedAt) d.completedAt = Date.now(); } else delete d.completedAt;
}

/* ---------- 액션 ---------- */
function toggleDone(date, id) {
  const k = doneKey(date, id);
  if (S.done[k]) delete S.done[k]; else S.done[k] = Date.now();
  updateCompletion(date); save(); render();
}

function toggleRead(date, lang) {
  const k = readKey(date, lang);
  if (S.read[k]) delete S.read[k]; else S.read[k] = Date.now();
  updateCompletion(date); save(); render();
}

function toggleReview(date, lang, w) {
  const k = doneKey(date, w.id);
  if (S.review[k]) { delete S.review[k]; toast('다시 복습에서 뺐어요'); }
  else { S.review[k] = { date, lang, addedAt: Date.now(), card: w }; toast('다시 복습에 담았어요'); }
  save(); render();
}

/* --- 음성: 단어 듣기 / 통합 글 전체 듣기(정지 가능) --- */
const canSpeak = () => 'speechSynthesis' in window;
let speechToken = 0;   // 새 재생·정지가 있을 때마다 올려서, 이전 재생의 종료 이벤트를 무시한다

const voiceLang = (v) => v.lang.replace('_', '-').toLowerCase();

/* 언어별로 앱이 음성을 직접 골라 지정한다 (기기 기본 선택에 맡기면 iOS 등에서 엉뚱한 음성이 쓰임).
 * 점수: 언어·지역 일치, 기기 기본 음성, 선호 이름 가산 / 효과음·특이 음성 감점 */
const VOICE_PREF = {
  en: /\b(samantha|ava|allison|susan|nicky|karen)\b|google us english|microsoft (aria|jenny|guy)|english \(united states\)/i,
  zh: /tingting|ting-ting|婷婷|google 普通话|xiaoxiao|yunxi|huihui|mandarin/i,
  ja: /kyoko|o-ren|otoya|ayumi|haruka|sayaka|nanami|google 日本語|japanese/i,
  ko: /yuna|sora|heami|sunhi|sun-hi|injoon|google 한국의|korean/i,
};
const VOICE_AVOID = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|princess|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

function scoreVoice(v, lang) {
  const l = voiceLang(v);
  let sc = 0;
  if (lang === 'en') {
    if (!l.startsWith('en')) return -1;
    if (l === 'en-us') sc += 3; else if (l === 'en-gb') sc += 1;
  } else if (lang === 'ja') {
    if (!l.startsWith('ja')) return -1;
    if (l === 'ja-jp') sc += 3; else sc += 1;
  } else if (lang === 'ko') {
    if (!l.startsWith('ko')) return -1;
    if (l === 'ko-kr') sc += 3; else sc += 1;
  } else if (lang === 'zh') {
    // 표준중국어: 홍콩·대만·광둥어 음성은 제외
    if (!(l.startsWith('zh') || l.startsWith('cmn')) || /^zh-(hk|tw)|^zh-hant|^yue/.test(l) || /cantonese|粵|粤|廣東|广东|台灣|台湾/i.test(v.name)) return -1;
    if (l === 'zh-cn' || l === 'cmn-cn' || l === 'zh-hans-cn' || l === 'zh') sc += 3; else sc += 1;
  }
  if (/enhanced|premium|siri|향상|增强|優化|优化/i.test(v.name)) sc += 3;   // iOS 고품질 음성
  if (v.default) sc += 2;
  if (VOICE_PREF[lang] && VOICE_PREF[lang].test(v.name)) sc += 4;
  if (VOICE_AVOID.test(v.name)) sc -= 5;
  if (v.localService) sc += 1;
  return sc;
}

/** 광둥어 음성 찾기: yue-* 우선, 그다음 zh-HK(홍콩 중국어). 없으면 null */
function findYueVoice() {
  if (!canSpeak()) return null;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => /^yue(-|$)/.test(voiceLang(v)))
    || vs.find((v) => voiceLang(v) === 'zh-hk')
    || vs.find((v) => /cantonese|粵|粤|廣東|广东/i.test(v.name))
    || null;
}

/** 언어별 사용할 음성 (없으면 null → 기기가 언어 코드로 고르게 둠) */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function pickVoice(lang) {
  if (!canSpeak()) return null;
  if (lang === 'yue') return findYueVoice();
  // iOS 만 앱이 직접 고른다. PC·안드로이드는 기존처럼 언어 코드가 일치하는 첫 음성 (이미 잘 동작)
  if (!IS_IOS) return speechSynthesis.getVoices().find((v) => voiceLang(v) === LANG[lang].speech.toLowerCase()) || null;
  let best = null, bestScore = -1;
  for (const v of speechSynthesis.getVoices()) {
    const sc = scoreVoice(v, lang);
    if (sc > bestScore) { best = v; bestScore = sc; }
  }
  return best;
}

function makeUtterance(text, lang) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG[lang].speech; u.rate = .9;
  const v = pickVoice(lang);
  if (v) { u.voice = v; u.lang = v.lang; }
  else if (lang === 'yue' && speechSynthesis.getVoices().length) toast('이 기기에 광둥어 음성이 없어 표준 중국어로 읽힐 수 있어요 (설정 → 음성 점검)');
  return u;
}

/** 설정 화면의 '음성 점검': 언어별로 앱이 고른 음성과 테스트 듣기 */
const VOICE_TEST = { yue: '早晨', en: 'Good morning. How are you today?', zh: '早上好，今天过得怎么样？', ja: 'おはようございます。', ko: '안녕하세요. 오늘도 좋은 하루 보내세요.' };
function voiceStatusHTML() {
  if (!canSpeak()) return '<div class="vs bad">이 브라우저는 음성 읽기를 지원하지 않아요.</div>';
  if (!speechSynthesis.getVoices().length) return '<div class="vs">음성 목록을 불러오는 중이에요… 설정을 닫았다가 다시 열어보세요.</div>';
  return LANGS.map((l) => {
    const v = pickVoice(l.key);
    let info;
    if (v) info = `<span class="vs ok">✓ ${esc(v.name)}</span> <small>(${esc(v.lang)})</small>`;
    else if (l.key === 'yue') info = '<span class="vs bad">⚠ 광둥어 음성이 없어요 — 표준 중국어로 읽혀요</span>';
    else info = '<span class="vs">기기 기본 음성을 써요</span>';
    return `<div class="vrow"><div class="vlang">${l.label}</div><div class="vinfo">${info}</div>
      <button class="btn" data-act="voice-test" data-vlang="${l.key}" aria-label="${l.label} 테스트 듣기">${ICON.speaker}<span>듣기</span></button></div>`;
  }).join('');
}
if (canSpeak()) speechSynthesis.addEventListener?.('voiceschanged', () => { const el = document.getElementById('s-voice'); if (el) el.innerHTML = voiceStatusHTML(); });

/** 재생 중인 음성을 모두 멈춘다. 글 재생 표시도 해제 */
function stopSpeech() {
  speechToken++;
  if (canSpeak()) speechSynthesis.cancel();
  if (st.speaking) { st.speaking = null; render(); }
}

/** 새 재생을 시작한다. 재생 중이던 음성이 있으면 cancel 하고 잠시 뒤에 시작 (iOS: cancel 직후 speak 하면 이전 음성이 그대로 쓰이는 문제 방지).
 *  아무것도 재생 중이 아니면 즉시 시작 (iOS 는 사용자 터치 직후에 시작해야 소리가 남) */
function startSpeech(token, utterances) {
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy) speechSynthesis.cancel();
  const go = () => { if (token === speechToken) utterances.forEach((u) => speechSynthesis.speak(u)); };
  if (busy && IS_IOS) setTimeout(go, 200); else go();
}

function speak(text, lang) {
  if (!canSpeak()) { toast('이 기기에서는 발음 듣기를 지원하지 않아요'); return; }
  const was = st.speaking;
  const token = ++speechToken; st.speaking = null;
  startSpeech(token, [makeUtterance(text, lang)]);
  if (was) render();
}

/** 문장 단위로 이어 읽는다 (긴 글을 한 번에 읽다 중간에 끊기는 브라우저 문제 완화). 끝나면 버튼이 자동으로 돌아온다 */
function speakPassage(sentences, lang, key) {
  if (!canSpeak()) { toast('이 기기에서는 발음 듣기를 지원하지 않아요'); return; }
  const token = ++speechToken;
  st.speaking = key;
  const finish = () => { if (token === speechToken && st.speaking === key) { st.speaking = null; render(); } };
  const utts = sentences.map((text, i) => {
    const u = makeUtterance(text, lang);
    if (i === sentences.length - 1) u.onend = finish;
    u.onerror = finish;
    return u;
  });
  startSpeech(token, utts);
  render();
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 렌더링 ---------- */
function render() {
  renderNav();
  const main = $('#main');
  main.className = 'main' + (setting('hideMeaning') ? ' mask-on' : '');
  main.innerHTML = st.view === 'daily' ? viewDaily() : st.view === 'review' ? viewReview() : viewSchedule();
  applyTheme();
}

function renderNav() {
  const items = [['daily', '매일 학습', ICON.today], ['review', '다시 복습', ICON.review], ['schedule', '스케줄', ICON.clock]];
  const c = st.config.counts;
  $('#nav').innerHTML = items.map(([k, l, i]) =>
    `<button class="nav-btn" data-view="${k}" ${st.view === k ? 'aria-current="page"' : ''}>${i}<span>${l}</span></button>`).join('') +
    `<div class="routine"><h4>Daily Routine</h4>${LANGS.map((l) => `${l.label} ${c[l.key] || 0}개`).join('<br>')}<br>+ 언어별 통합 글 ${LANGS.length}편<p>하루 ${LANGS.reduce((n, l) => n + (c[l.key] || 0), 0)}개, 조금씩 꾸준히.</p></div>`;
}

function applyTheme() {
  const t = setting('theme');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#btn-theme').innerHTML = dark ? ICON.moon : ICON.sun;
  $('#btn-settings').innerHTML = ICON.gear;
}

/* --- 매일 학습 --- */
function weekStart(date) { const d = parseDate(date); const off = (d.getDay() + 6) % 7; return addDays(date, -off); }

function viewDaily() {
  const date = st.date, today = todayStr();
  const ds = st.days[date];
  const state = dayState(date);
  const isToday = date === today;
  const d = parseDate(date);
  const title = isToday ? '좋은 아침, 오늘도 한 걸음.' : `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})의 학습`;
  const sub = isToday ? '여러 언어로 시작하는 나만의 아침 루틴' : (date > today ? '아직 오지 않은 날이에요' : '지난 기록을 다시 살펴보고 있어요');

  const ws = weekStart(date);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const strip = week.map((w) => {
    const s = dayState(w), future = w > today, sel = w === date;
    const wd = parseDate(w);
    const lab = sel ? '선택' : STATE_SHORT[s];
    return `<button class="day${sel ? ' sel' : ''}${future ? ' future' : ''}" data-date="${w}" data-state="${s}" ${future ? 'disabled' : ''} ${w === today ? 'aria-current="date"' : ''} aria-label="${wd.getMonth() + 1}월 ${wd.getDate()}일 ${STATE_LABEL[s]}">
      <span class="dow">${DOW[wd.getDay()]}</span><span class="num">${wd.getDate()}</span><span class="lab">${lab}</span></button>`;
  }).join('');

  let body = '';
  if (ds?.state === 'ready') body = dailyReady(date, ds.data);
  else if (!ds || ds.state === 'loading') body = `<div class="empty"><div class="big">⏳</div><h3>불러오는 중…</h3></div>`;
  else body = emptyState(date, ds);

  return `<div class="wrap">
    <div class="eyebrow">${dotted(date)} · DAILY WORDS</div>
    <div class="hero"><div><h1>${esc(title)}</h1><p class="sub">${sub}</p></div>${ICON.sun}</div>
    <div class="week-head"><span class="ttl">${week[0].slice(5).replace('-', '.')} – ${week[6].slice(5).replace('-', '.')}</span>
      <span class="ctl"><button class="chip-btn" data-act="week" data-n="-7" aria-label="이전 주">‹</button>
      <button class="chip-btn" data-act="today">오늘</button>
      <button class="chip-btn" data-act="week" data-n="7" aria-label="다음 주" ${addDays(ws, 7) > today ? 'disabled' : ''}>›</button>
      <button class="chip-btn" data-act="calendar">달력</button></span></div>
    <div class="week">${strip}</div>
    ${progressCard(date, state)}
    ${body}
  </div>`;
}

function progressCard(date, state) {
  const c = counts(date);
  const known = state !== 'none' && state !== 'future';
  const total = c.total || (known ? LANGS.reduce((n, l) => n + (st.config.counts[l.key] || 0), 0) : 0);
  const passages = c.total ? c.passages : (known ? LANGS.length : 0);
  const units = total + passages, doneUnits = c.sum + c.reads;
  const pct = units ? Math.round((doneUnits / units) * 100) : 0;
  const cls = state === 'complete' ? 'complete' : state === 'progress' ? 'progress' : state === 'failed' ? 'failed' : state === 'generating' ? 'generating' : '';
  const heading = date === todayStr() ? '오늘의 작은 성취' : `${dotted(date)}의 성취`;
  return `<div class="progress-card"><div class="row"><span>${heading} <span class="badge ${cls}">${STATE_LABEL[state]}</span></span>
    <b>단어 ${c.sum}/${total} · 글 ${c.reads}/${passages}</b></div>
    <div class="bar" role="progressbar" aria-label="오늘의 학습 진행률" aria-valuemin="0" aria-valuemax="${units}" aria-valuenow="${doneUnits}"><i style="width:${pct}%"></i></div></div>`;
}

function emptyState(date, ds) {
  const today = todayStr();
  if (ds.state === 'future') return `<div class="empty"><div class="big">🌱</div><h3>아직 오지 않은 날이에요</h3><p>미래 날짜에는 자료를 미리 보여주지 않아요.</p><button class="btn" data-act="today">오늘로 돌아가기</button></div>`;
  if (ds.state === 'generating') return `<div class="empty"><div class="big">✍️</div><h3>자료를 만드는 중이에요</h3><p>${esc(ds.message || '잠시 후 새로고침 해보세요.')}</p><button class="btn" data-act="refresh">새로고침</button></div>`;
  if (ds.state === 'failed') return `<div class="empty"><div class="big">⚠️</div><h3>자료 생성에 실패했어요</h3><p>${esc(ds.message || '다시 시도하면 해결될 수 있어요.')}</p><button class="btn" data-act="refresh">다시 불러오기</button></div>`;
  const hint = date === today ? `오늘 자료는 보통 매일 ${esc(st.config.generateAt)} 이후에 올라와요.` : '이 날짜에는 만들어진 자료가 없어요.';
  const offline = st.index ? '' : '<br>(자료 목록을 불러오지 못했어요. 연결 상태를 확인해 주세요.)';
  return `<div class="empty"><div class="big">📭</div><h3>자료가 없어요</h3><p>${hint}${offline}</p><button class="btn" data-act="refresh">새로고침</button></div>`;
}

function dailyReady(date, data) {
  const c = counts(date);
  if (!data.sets[st.lang]?.words.length) st.lang = LANGS.find((l) => data.sets[l.key]?.words.length)?.key || st.lang;
  const tabs = LANGS.filter((l) => data.sets[l.key]?.words.length).map((l) => {
    const n = data.sets[l.key].words.length;
    return `<button class="tab" role="tab" data-lang="${l.key}" aria-selected="${st.lang === l.key}">${l.label}<span class="n">${c.done[l.key]}/${n}${c.read[l.key] ? ' · 글 ✓' : ''}</span></button>`;
  }).join('');
  const set = data.sets[st.lang];
  const L = LANG[st.lang];
  const cards = set.words.length ? set.words.map((w, i) => card(date, st.lang, w, i + 1, false)).join('') :
    `<div class="empty"><h3>${L.label} 단어가 없어요</h3><p>이 날짜 파일에 ${L.label} 단어가 들어 있지 않아요.</p></div>`;
  const levelLine = [set.level, st.lang === 'zh' ? set.hskStandard : ''].filter(Boolean).join(' · ');
  return `<div class="tools"><div class="tabs" role="tablist">${tabs}</div>
    <button class="tool-btn" data-act="mask" aria-pressed="${!!setting('hideMeaning')}">뜻 가리기</button></div>
    <section class="sec" aria-labelledby="sec-words">
      <div class="sec-head"><h2 id="sec-words"><span class="no">①</span> 오늘의 단어</h2>${levelLine ? `<span class="lvl">${esc(levelLine)}</span>` : ''}</div>
      <div class="cards">${cards}</div>
    </section>
    ${passageSection(date, st.lang, set)}`;
}

/** 뜻 표시: 한국어 단어는 중국어 번역(굵게) + 쉬운 한국어 풀이, 그 밖의 언어는 한국어 뜻 */
function meaningHTML(lang, w) {
  if (lang === 'ko' && w.meaningZh) return `<span lang="zh-Hans">${esc(w.meaningZh)}</span><small class="def">${esc(w.meaning)}</small>`;
  return esc(w.meaning);
}

function card(date, lang, w, no, showOrigin) {
  const L = LANG[lang], done = isDone(date, w.id), rev = !!S.review[doneKey(date, w.id)];
  const key = esc(doneKey(date, w.id));
  const r = st.revealed.has(doneKey(date, w.id) + 'm') ? ' revealed' : '';
  return `<article class="card${done ? ' done' : ''}" data-date="${date}" data-id="${esc(w.id)}" data-lang="${lang}">
    ${no ? `<span class="no">${pad(no)}</span>` : ''}
    <div class="head"><span class="word" lang="${L.htmlLang}">${wordHTML(lang, w)}</span>
      <span class="meaning mask${r}${lang === 'ko' ? ' ko-mean' : ''}" data-reveal="${key}m">${meaningHTML(lang, w)}</span></div>
    <div class="reading">${lang === 'ja' ? '' : esc(w.reading)}${w.pos ? `<span class="pos">${esc(w.pos)}</span>` : ''}</div>
    ${showOrigin ? `<div class="origin">${dotted(date)}에 받은 단어 · <button data-act="goto" data-date="${date}" data-lang="${lang}">그날 보기</button></div>` : ''}
    <div class="actions">
      <button class="btn speak" data-act="speak" aria-label="단어 발음 듣기">${ICON.speaker}<span>듣기</span></button>
      <button class="btn${rev ? ' on' : ''}" data-act="review" aria-pressed="${rev}">${rev ? '★ 복습 제거' : '☆ 다시 복습'}</button>
      <button class="btn primary${done ? ' on' : ''}" data-act="done" aria-pressed="${done}">${done ? '✓ 완료 취소' : '학습 완료하기'}</button>
    </div></article>`;
}

/* --- 후리가나(ruby) --- */
const rubyTag = (g, show) => (g.r !== undefined && show ? `<ruby>${esc(g.t)}<rt>${esc(g.r)}</rt></ruby>` : esc(g.t));
/** 일본어 단어 표시: 한자 위에 후리가나 (단어 카드는 항상 표시) */
function wordHTML(lang, w) {
  return lang === 'ja' && w.ruby ? w.ruby.map((g) => rubyTag(g, true)).join('') : esc(w.word);
}

/* --- 통합 글 --- */
/** 문장 → HTML. 목표 단어(uses)는 눌러서 뜻을 볼 수 있는 강조 버튼. 후리가나(ruby)가 있으면 한자 위에 표시 */
function sentenceHTML(sent, showFurigana = true) {
  const hl = (u, inner) => `<button class="hl" data-act="hl" data-word="${esc(u.wordId)}" aria-label="목표 단어 ${esc(u.text)}">${inner}</button>`;
  if (!sent.ruby) {
    let out = '', cur = 0;
    for (const u of sent.uses) {
      out += esc(sent.text.slice(cur, u.start));
      out += hl(u, esc(u.text));
      cur = u.end;
    }
    return out + esc(sent.text.slice(cur));
  }
  // 후리가나 조각을 '원자'로 나눈다: 한자 덩어리는 하나, 그 밖의 글자는 한 글자씩. 강조는 원자 경계에서만 시작/끝난다.
  const atoms = []; let pos = 0;
  for (const g of sent.ruby) {
    if (g.r === undefined) for (const ch of g.t) { atoms.push({ g: { t: ch }, start: pos, end: pos + ch.length }); pos += ch.length; }
    else { atoms.push({ g, start: pos, end: pos + g.t.length }); pos += g.t.length; }
  }
  let out = '', i = 0;
  while (i < atoms.length) {
    const u = sent.uses.find((x) => x.start === atoms[i].start);
    if (u) {
      let inner = '';
      while (i < atoms.length && atoms[i].end <= u.end) { inner += rubyTag(atoms[i].g, showFurigana); i++; }
      out += hl(u, inner || esc(u.text));
    } else { out += rubyTag(atoms[i].g, showFurigana); i++; }
  }
  return out;
}

/* --- 문법 설명(참고용) --- */
/** 후리가나 조각 → 원자(한자 덩어리는 하나, 그 밖은 한 글자씩) */
function rubyAtoms(ruby) {
  const atoms = []; let pos = 0;
  for (const g of ruby) {
    if (g.r === undefined) for (const ch of g.t) { atoms.push({ g: { t: ch }, start: pos, end: pos + ch.length }); pos += ch.length; }
    else { atoms.push({ g, start: pos, end: pos + g.t.length }); pos += g.t.length; }
  }
  return atoms;
}
/** text 의 [from,to) 구간을 (후리가나가 있으면 한자 위에 표시하며) 그린다. 구간이 한자 덩어리 중간을 자르면 후리가나 없이 */
function textRangeHTML(sent, from, to, showFg) {
  if (sent.ruby) {
    const part = rubyAtoms(sent.ruby).filter((a) => a.start >= from && a.end <= to);
    if (part.length && part[0].start === from && part[part.length - 1].end === to) return part.map((a) => rubyTag(a.g, showFg)).join('');
  }
  return esc(sent.text.slice(from, to));
}
function grammarHTML(lang, p, showFg) {
  const g = p.grammar, L = LANG[lang];
  const zx = lang === 'ko' ? ' lang="zh-Hans"' : '';   // 한국어 문법은 중국어로 설명
  const blocks = g.blocks.map((b) => {
    const sent = p.sentences[b.sentence - 1];
    const items = b.items.map((it) => {
      const pos = sent.text.indexOf(it.pattern);
      const pat = pos >= 0 ? textRangeHTML(sent, pos, pos + it.pattern.length, showFg) : esc(it.pattern);
      return `<div class="gram-it"><span class="gram-pat" lang="${L.htmlLang}">${pat}</span><span class="gram-t"${zx}>${esc(it.title)}</span><p${zx}>${esc(it.explain)}</p></div>`;
    }).join('');
    return `<div class="gram-blk"><div class="gram-s" lang="${L.htmlLang}"><b>문장 ${b.sentence}</b>${textRangeHTML(sent, 0, sent.text.length, showFg)}</div>${items}</div>`;
  }).join('');
  const sum = g.summary.length ? `<div class="gram-sum"><div class="gram-h">오늘의 문법 포인트${lang === 'ko' ? ' <small>(今日语法要点)</small>' : ''}</div><ol${zx}>${g.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : '';
  const cmp = g.compare.length ? `<div class="gram-cmp"><div class="gram-h">표준 중국어와 비교 <small>(헷갈리지 않게)</small></div>
    <table><thead><tr><th>광둥어</th><th>표준 중국어</th></tr></thead><tbody>${g.compare.map((r) => `<tr><td lang="yue-Hans">${esc(r.this)}</td><td lang="zh-Hans">${esc(r.other)}</td></tr>`).join('')}</tbody></table></div>` : '';
  return `<div class="gram"><div class="gram-ttl">문법 설명 <small>(참고용 — 완료 조건에는 들어가지 않아요)</small></div>${blocks}${sum}${cmp}</div>`;
}

function passageSection(date, lang, set) {
  const p = set.passage;
  if (!p) return `<section class="sec"><div class="sec-head"><h2><span class="no">②</span> 오늘의 통합 글</h2></div>
    <div class="empty"><p>이 날짜에는 ${LANG[lang].label} 통합 글이 없어요.</p></div></section>`;
  const L = LANG[lang], key = readKey(date, lang);
  const ui = st.ui[key] || { ko: false, rd: false, fg: true };
  const isJa = lang === 'ja';
  const showFg = ui.fg !== false;
  const hasRd = !isJa && lang !== 'en' && p.sentences.some((s) => s.reading);
  const hasFg = isJa && p.sentences.some((s) => s.ruby);
  const hasGr = !!p.grammar;
  const read = isRead(date, lang);
  const sentences = ui.rd && hasRd
    ? p.sentences.map((s) => `<div class="sent"><div class="src" lang="${L.htmlLang}">${sentenceHTML(s, showFg)}</div><div class="rd">${esc(s.reading)}</div></div>`).join('')
    : `<p class="flow" lang="${L.htmlLang}">${p.sentences.map((x) => sentenceHTML(x, showFg)).join(lang === 'en' ? ' ' : '')}</p>`;
  const isKo = lang === 'ko';   // 한국어 학습자는 중국인 → 번역은 중국어(간체)
  const ko = ui.ko ? (isKo
    ? `<div class="ko-block"><div class="ko-ttl">中文翻译</div><p lang="zh-Hans">${p.sentences.map((s) => esc(s.zh)).join('')}</p></div>`
    : `<div class="ko-block"><div class="ko-ttl">한국어 번역</div><p>${p.sentences.map((s) => esc(s.ko)).join(' ')}</p></div>`) : '';
  const grammarPanel = ui.gr && p.grammar ? grammarHTML(lang, p, showFg) : '';
  let pop = '';
  if (st.pop && st.pop.date === date && st.pop.lang === lang) {
    const w = set.words.find((x) => x.id === st.pop.wordId);
    if (w) pop = `<div class="pop" role="status"><div><span class="word sm" lang="${L.htmlLang}">${wordHTML(lang, w)}</span>
      <span class="pop-rd">${lang === 'ja' ? '' : esc(w.reading)}</span></div><div class="pop-ko">${meaningHTML(lang, w)}${w.pos ? ` <span class="pos">${esc(w.pos)}</span>` : ''}</div>
      <div class="pop-act"><button class="btn" data-act="speak-word" data-word="${esc(w.id)}">${ICON.speaker}<span>듣기</span></button><button class="btn" data-act="close-pop">닫기</button></div></div>`;
  }
  return `<section class="sec passage" data-date="${date}" data-lang="${lang}" aria-labelledby="sec-passage">
    <div class="sec-head"><h2 id="sec-passage"><span class="no">②</span> 오늘의 통합 글</h2></div>
    <article class="story${read ? ' done' : ''}">
      <h3 class="story-title" lang="${L.htmlLang}">${esc(p.title)}</h3>
      ${(isKo ? p.titleZh : p.titleKo) || p.situation ? `<div class="story-sub">${esc([isKo ? p.titleZh : p.titleKo, p.situation].filter(Boolean).join(' · '))}</div>` : ''}
      <div class="story-body">${sentences}</div>
      ${pop}
      ${ko}
      ${grammarPanel}
      <div class="story-tools">
        <button class="chip-btn" data-act="toggle-ko" aria-pressed="${ui.ko}">${isKo ? '중국어 번역' : '한국어 번역'} ${ui.ko ? '숨기기' : '보기'}</button>
        ${hasRd ? `<button class="chip-btn" data-act="toggle-rd" aria-pressed="${ui.rd}">${L.rdLabel} ${ui.rd ? '숨기기' : '보기'}</button>` : ''}
        ${hasFg ? `<button class="chip-btn" data-act="toggle-fg" aria-pressed="${showFg}">후리가나 ${showFg ? '숨기기' : '보기'}</button>` : ''}
        ${hasGr ? `<button class="chip-btn" data-act="toggle-gr" aria-pressed="${!!ui.gr}">문법 ${ui.gr ? '숨기기' : '보기'}</button>` : ''}
        ${st.speaking === key
          ? `<button class="chip-btn playing" data-act="speak-passage" aria-pressed="true" aria-label="전체 듣기 정지">${ICON.stop}<span>정지</span></button>`
          : `<button class="chip-btn" data-act="speak-passage">${ICON.speaker}<span>전체 듣기</span></button>`}
      </div>
      <div class="hint">밑줄 친 목표 단어를 누르면 뜻과 발음을 볼 수 있어요.</div>
      <div class="actions"><button class="btn primary${read ? ' on' : ''}" data-act="read" aria-pressed="${read}">${read ? '✓ 읽기 완료 취소' : '글 읽기 완료'}</button></div>
    </article></section>`;
}

/* --- 다시 복습 --- */
function viewReview() {
  const all = Object.values(S.review).sort((a, b) => (b.date.localeCompare(a.date)) || (b.addedAt - a.addedAt));
  const n = (k) => all.filter((r) => k === 'all' || r.lang === k).length;
  const tabs = [{ key: 'all', label: '전체' }, ...LANGS].map((l) =>
    `<button class="tab" role="tab" data-rlang="${l.key}" aria-selected="${st.reviewLang === l.key}">${l.label}<span class="n">${n(l.key)}</span></button>`).join('');
  const list = all.filter((r) => st.reviewLang === 'all' || r.lang === st.reviewLang);
  const body = list.length ? `<div class="cards">${list.map((r) => card(r.date, r.lang, r.card, 0, true)).join('')}</div>` :
    `<div class="empty"><div class="big">🔖</div><h3>복습할 단어가 없어요</h3><p>매일 학습에서 ‘다시 복습’을 눌러 단어를 담아보세요.<br>날짜와 상관없이 여기에 모여요.</p></div>`;
  return `<div class="wrap"><div class="eyebrow">REVIEW</div>
    <div class="hero"><div><h1>다시 복습</h1><p class="sub">담아둔 단어 ${all.length}개</p></div></div>
    <div class="tools"><div class="tabs" role="tablist">${tabs}</div>
    <button class="tool-btn" data-act="mask" aria-pressed="${!!setting('hideMeaning')}">뜻 가리기</button></div>${body}</div>`;
}

/* --- 스케줄 --- */
function viewSchedule() {
  const cfg = st.config, c = cfg.counts, total = LANGS.reduce((n, l) => n + (c[l.key] || 0), 0);
  const now = new Date(), [hh, mm] = cfg.generateAt.split(':').map(Number);
  const next = new Date(now); next.setHours(hh, mm, 0, 0); if (next <= now) next.setDate(next.getDate() + 1);
  const today = todayStr();
  const recent = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const rows = recent.map((d) => {
    const s = dayState(d), e = indexEntry(d), cn = counts(d), wd = DOW[parseDate(d).getDay()];
    const note = e?.message ? `<div class="msg">${esc(e.message)}</div>` : '';
    const prog = cn.total ? ` · 단어 ${cn.sum}/${cn.total}, 글 ${cn.reads}/${cn.passages}` : '';
    return `<li><div><button class="lnk" data-act="goto" data-date="${d}">${dotted(d)} (${wd})</button>${note}</div><span class="badge ${s === 'complete' ? 'complete' : s === 'progress' ? 'progress' : s}">${STATE_LABEL[s]}${prog}</span></li>`;
  }).join('');
  const sync = S.lastSync ? new Date(S.lastSync).toLocaleString('ko-KR') : '아직 없음';
  const lv = cfg.levels;
  return `<div class="wrap"><div class="eyebrow">SCHEDULE</div>
    <div class="hero"><div><h1>스케줄</h1><p class="sub">자료는 자동으로 만들어져 이 앱에 올라와요</p></div></div>
    <div class="panel"><h3>매일 자료 생성</h3><dl class="kv">
      <dt>생성 시각</dt><dd>매일 ${esc(cfg.generateAt)}</dd>
      <dt>다음 생성</dt><dd>${next.getMonth() + 1}월 ${next.getDate()}일 ${esc(cfg.generateAt)}</dd>
      <dt>구성</dt><dd>단어 ${total}개 (${LANGS.map((l) => `${l.label} ${c[l.key] || 0}`).join(' · ')}) + 언어별 통합 글 ${LANGS.length}편</dd>
      ${LANGS.map((l) => `<dt>${l.label} 수준</dt><dd>${esc(lv[l.key]?.label || '')}${lv[l.key]?.standard ? ` <span class="msg">(${esc(lv[l.key].standard)})</span>` : ''}</dd>`).join('')}
      <dt>마지막 확인</dt><dd>${esc(sync)}</dd></dl>
      <div class="row-btns" style="margin-top:14px"><button class="btn" data-act="refresh">자료 새로고침</button>
      <button class="btn" data-act="install" id="btn-install" hidden>홈 화면에 설치</button></div></div>
    <div class="panel"><h3>최근 14일</h3><ul class="log">${rows}</ul></div></div>`;
}

/* ---------- 달력 / 설정 모달 ---------- */
let calMonth = null;
function openCalendar() {
  calMonth = st.date.slice(0, 7);
  drawCalendar(); $('#dlg-cal').showModal();
}
function drawCalendar() {
  const [y, m] = calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate(), lead = (first.getDay() + 6) % 7;
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`, s = dayState(ds), future = ds > today;
    const dot = s === 'none' || s === 'future' ? '' : s;
    cells.push(`<button class="cal-cell${ds === st.date ? ' sel' : ''}${ds === today ? ' today' : ''}" data-cdate="${ds}" ${future ? 'disabled' : ''} aria-label="${m}월 ${d}일 ${STATE_LABEL[s]}">${d}<i class="dot ${dot}"></i></button>`);
  }
  const nextDisabled = `${y}-${pad(m)}` >= today.slice(0, 7);
  $('#dlg-cal').innerHTML = `<div class="dlg"><div class="dlg-head">
    <button class="icon-btn" data-cal="-1" aria-label="이전 달">‹</button><h2>${y}년 ${m}월</h2>
    <button class="icon-btn" data-cal="1" aria-label="다음 달" ${nextDisabled ? 'disabled' : ''}>›</button></div>
    <div class="cal-grid">${['월', '화', '수', '목', '금', '토', '일'].map((d) => `<span class="dow">${d}</span>`).join('')}${cells.join('')}</div>
    <div class="legend"><span><i class="dot complete"></i>학습 완료</span><span><i class="dot progress"></i>학습 중</span><span><i class="dot before"></i>학습 전</span><span><i class="dot failed"></i>생성 실패</span></div>
    <div class="row-btns" style="margin-top:14px;justify-content:space-between"><button class="btn" data-act="today-close">오늘</button><button class="btn" data-act="close">닫기</button></div></div>`;
}

function configJson() {
  return JSON.stringify({ ...st.config, topic: setting('topic') }, null, 2);
}
function openSettings() {
  const lv = st.config.levels;
  $('#dlg-settings').innerHTML = `<div class="dlg"><div class="dlg-head"><h2>설정</h2><button class="icon-btn" data-act="close" aria-label="닫기">✕</button></div>
    <div class="field"><label for="s-theme">화면 모드</label><select id="s-theme"><option value="auto">시스템 설정 따르기</option><option value="light">라이트</option><option value="dark">다크</option></select></div>
    <div class="field"><label>학습 수준 (언어별)</label>
      <dl class="kv lv-list">${LANGS.map((l) => `<dt>${l.label}</dt><dd>${esc(lv[l.key]?.label || '')}${lv[l.key]?.standard ? `<br><small>${esc(lv[l.key].standard)}</small>` : ''}</dd>`).join('')}</dl>
      <small>수준은 자료 생성 지침과 함께 관리돼요. 바꾸려면 <b>data/config.json</b>의 levels 를 수정하세요.</small></div>
    <div class="field"><label>음성 점검 (언어별로 앱이 고른 음성)</label>
      <div id="s-voice" class="voice-box">${voiceStatusHTML()}</div>
      <small>광둥어 음성이 없으면 폰의 음성 설정에서 중국어(홍콩)/광둥어 음성을 설치하세요.</small>
      ${IS_IOS ? '<small class="warn-note">아이폰: iOS 가 중국어 방언을 시스템 설정 하나로 고정해 읽는 경우가 있어요. 광둥어와 표준 중국어가 같은 방언으로 들리면 설정 → 손쉬운 사용 → 말하기 콘텐츠 → 음성 → 중국어 → 「口說語言」에서 학습하는 쪽(粵語 / 國語)으로 바꿔 보세요. 웹 앱에서는 이 설정을 바꿀 수 없어요.</small>' : ''}</div>
    <div class="field"><label for="s-topic">선호 주제·장면</label><input id="s-topic" list="topics" value="${esc(setting('topic'))}" placeholder="예: 실생활, 여행, 음식, 직장">
      <datalist id="topics">${['실생활', '여행', '음식', '직장', '쇼핑', '감정 표현', '교통'].map((o) => `<option value="${o}">`).join('')}</datalist>
      <small>생성에 적용하려면 <b>data/config.json</b>에 반영해야 해요. 아래 버튼으로 내용을 복사하세요.</small></div>
    <div class="row-btns"><button class="btn" data-act="copy-config">config.json 내용 복사</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <div class="field"><label>학습 기록 백업 (이 기기에만 저장돼요)</label>
      <div class="row-btns"><button class="btn" data-act="export">내보내기</button><button class="btn" data-act="import">가져오기</button></div>
      <input type="file" id="s-file" accept="application/json" hidden></div>
    <pre hidden id="cfg-json">${esc(configJson())}</pre></div>`;
  $('#s-theme').value = setting('theme');
  $('#dlg-settings').showModal();
}

/* ---------- 이벤트 ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, .mask');
  if (!t) return;

  if (t.dataset.view) { stopSpeech(); st.view = t.dataset.view; if (st.view === 'daily') await loadDay(st.date); render(); scrollTo(0, 0); return; }
  if (t.id === 'btn-theme') {
    const dark = document.documentElement.dataset.theme === 'dark' || (setting('theme') === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    S.settings.theme = dark ? 'light' : 'dark'; save(); applyTheme(); return;
  }
  if (t.id === 'btn-settings') { openSettings(); return; }
  if (t.dataset.cal) { calMonth = (() => { const [y, m] = calMonth.split('-').map(Number); const d = new Date(y, m - 1 + Number(t.dataset.cal), 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })(); drawCalendar(); return; }
  if (t.dataset.cdate) { $('#dlg-cal').close(); await selectDate(t.dataset.cdate); return; }
  if (t.dataset.lang && !t.dataset.act) { stopSpeech(); st.lang = t.dataset.lang; st.pop = null; render(); return; }
  if (t.dataset.rlang) { st.reviewLang = t.dataset.rlang; render(); return; }
  if (t.dataset.date && !t.dataset.act) { await selectDate(t.dataset.date); return; }
  if (t.dataset.reveal) { if (!setting('hideMeaning')) return; const k = t.dataset.reveal; st.revealed.has(k) ? st.revealed.delete(k) : st.revealed.add(k); t.classList.toggle('revealed'); return; }

  const cardEl = t.closest('.card');
  const pas = t.closest('.passage');
  switch (t.dataset.act) {
    case 'week': await selectDate(addDays(st.date, Number(t.dataset.n))); break;
    case 'today': await selectDate(todayStr()); break;
    case 'today-close': $('#dlg-cal').close(); await selectDate(todayStr()); break;
    case 'calendar': openCalendar(); break;
    case 'close': t.closest('dialog').close(); break;
    case 'mask': S.settings.hideMeaning = !setting('hideMeaning'); st.revealed.clear(); save(); render(); break;
    case 'refresh': await refreshAll(); break;
    case 'goto': st.view = 'daily'; st.lang = t.dataset.lang || st.lang; await selectDate(t.dataset.date); break;
    case 'speak': { const w = findWord(cardEl); if (w) speak(w.word, cardEl.dataset.lang); break; }
    case 'done': { const { date, id } = cardEl.dataset; toggleDone(date, id); break; }
    case 'review': { const w = findWord(cardEl); if (w) toggleReview(cardEl.dataset.date, cardEl.dataset.lang, w); break; }
    // 통합 글
    case 'hl': { if (!pas) break; const cur = st.pop; const next = { date: pas.dataset.date, lang: pas.dataset.lang, wordId: t.dataset.word };
      st.pop = cur && cur.date === next.date && cur.lang === next.lang && cur.wordId === next.wordId ? null : next; render(); break; }
    case 'close-pop': st.pop = null; render(); break;
    case 'speak-word': { if (!pas) break; const w = passageWord(pas.dataset.date, pas.dataset.lang, t.dataset.word); if (w) speak(w.word, pas.dataset.lang); break; }
    case 'toggle-gr': {
      if (!pas) break; const k = readKey(pas.dataset.date, pas.dataset.lang);
      const ui = (st.ui[k] = st.ui[k] || { ko: false, rd: false, fg: true });
      ui.gr = !ui.gr; render(); break;
    }
    case 'toggle-fg': {
      if (!pas) break; const k = readKey(pas.dataset.date, pas.dataset.lang);
      const ui = (st.ui[k] = st.ui[k] || { ko: false, rd: false, fg: true });
      ui.fg = ui.fg === false; render(); break;
    }
    case 'toggle-ko': case 'toggle-rd': {
      if (!pas) break; const k = readKey(pas.dataset.date, pas.dataset.lang);
      const ui = (st.ui[k] = st.ui[k] || { ko: false, rd: false });
      ui[t.dataset.act === 'toggle-ko' ? 'ko' : 'rd'] = !ui[t.dataset.act === 'toggle-ko' ? 'ko' : 'rd']; render(); break;
    }
    case 'speak-passage': {
      if (!pas) break;
      const key = readKey(pas.dataset.date, pas.dataset.lang);
      if (st.speaking === key) { stopSpeech(); break; }
      const p = st.days[pas.dataset.date]?.data?.sets[pas.dataset.lang]?.passage;
      if (p) speakPassage(p.sentences.map((x) => x.text), pas.dataset.lang, key);
      break;
    }
    case 'read': { if (!pas) break; toggleRead(pas.dataset.date, pas.dataset.lang); break; }
    case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; t.hidden = true; } break;
    case 'voice-test': { const vl = t.dataset.vlang || 'yue'; const pv = pickVoice(vl); toast(pv ? `▶ ${pv.name} (${pv.lang})` : '▶ 기기 기본 음성'); speak(VOICE_TEST[vl], vl); break; }
    case 'copy-config': {
      try { await navigator.clipboard.writeText($('#cfg-json').textContent); toast('복사했어요'); } catch { toast('복사에 실패했어요'); }
      break;
    }
    case 'export': exportData(); break;
    case 'import': $('#s-file').click(); break;
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 's-theme') { S.settings.theme = t.value; save(); applyTheme(); }
  if (t.id === 's-topic') { S.settings.topic = t.value.trim() || DEFAULT_SETTINGS.topic; save(); refreshCfgJson(); }
  if (t.id === 's-file' && t.files[0]) importData(t.files[0]);
});
function refreshCfgJson() { const el = $('#cfg-json'); if (el) el.textContent = configJson(); }
$('#dlg-settings').addEventListener('input', (ev) => { if (ev.target.id === 's-topic') { S.settings.topic = ev.target.value.trim() || DEFAULT_SETTINGS.topic; save(); refreshCfgJson(); } });
for (const id of ['#dlg-cal', '#dlg-settings']) $(id).addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

function passageWord(date, lang, id) { return st.days[date]?.data?.sets[lang]?.words.find((w) => w.id === id) || null; }
function findWord(cardEl) {
  if (!cardEl) return null;
  const { date, id, lang } = cardEl.dataset;
  return passageWord(date, lang, id) || S.review[doneKey(date, id)]?.card || null;
}

async function selectDate(date) {
  if (!isDate(date)) return;
  stopSpeech();
  const today = todayStr();
  if (date > today) date = today;
  st.view = 'daily'; st.date = date; st.pop = null;
  await loadDay(date); render();
}

async function refreshAll() {
  toast('새로 불러오는 중…');
  await loadMeta(); st.days = {};
  await loadDay(st.date, true); render();
  toast(st.index ? '최신 상태예요' : '자료 목록을 불러오지 못했어요');
}

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'haru-eohwi', version: 2, exportedAt: new Date().toISOString(), data: S }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `haru-eohwi-backup-${todayStr()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  try {
    const j = JSON.parse(await file.text());
    const d = j?.data;
    if (j?.app !== 'haru-eohwi' || !d || typeof d.done !== 'object') throw new Error('형식이 달라요');
    if (!confirm('현재 기록에 백업 내용을 합칠까요? (같은 항목은 백업 값으로 덮어써요)')) return;
    S = { ...S, done: { ...S.done, ...d.done }, read: { ...S.read, ...(d.read || {}) }, review: { ...S.review, ...(d.review || {}) }, days: { ...S.days, ...(d.days || {}) } };
    save(); render(); toast('가져왔어요');
  } catch (e) { toast('가져오지 못했어요: ' + e.message); }
}

/* ---------- 시작 ---------- */
let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; const b = $('#btn-install'); if (b) b.hidden = false; });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
addEventListener('pagehide', () => { if (canSpeak()) speechSynthesis.cancel(); });

// 자정을 넘겨 앱을 계속 켜두었거나 백그라운드에서 돌아왔을 때 갱신
let lastDay = todayStr();
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') { stopSpeech(); return; }
  const now = todayStr();
  if (now !== lastDay) { if (st.date === lastDay) st.date = now; lastDay = now; }
  await loadMeta();
  const cur = st.days[st.date];
  if (!cur || ['none', 'generating', 'failed', 'error'].includes(cur.state)) await loadDay(st.date, true);
  render();
});

(async function init() {
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  await loadMeta();
  const q = new URLSearchParams(location.search).get('date');
  if (q && isDate(q) && q <= todayStr()) st.date = q;
  await loadDay(st.date);
  render();
})();
