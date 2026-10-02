// 하루어휘 자료 검증기 (스키마 v2: 언어별 "단어 목록 + 통합 글" 학습 세트)
// 사용: node tools/validate.mjs [파일 ...]      (생략하면 data/days/*.json 전체)
// 코드로 검증하는 것: 개수·필수 필드·ID·단어 연결 정보(uses)와 원문 일치·모든 목표 단어 사용·
//   발음/번역 누락·간체 표기(광둥어는 고유 글자만 번체 유지)·광둥어/중국어 혼입·지정 수준 표기·연결된 글 형태(휴리스틱)
// 코드로 검증할 수 없는 것(자연스러움·실제 수준·글의 일관성)은 docs/GENERATION.md 의 별도 품질 점검 단계가 담당합니다.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LANG_KEYS = ['yue', 'en', 'zh', 'ja'];
export const DEFAULT_CONFIG = {
  counts: { yue: 5, en: 10, zh: 10, ja: 5 },
  levels: {
    yue: { label: '완전 초급' },
    en: { label: '토익스피킹 대비' },
    zh: { label: 'HSK 4~6급' },
    ja: { label: '완전 초급 (JLPT N5 이하)' },
  },
};

const hasHangul = (s) => /[ㄱ-ㆎ가-힣]/.test(s);
const hasHan = (s) => /\p{Script=Han}/u.test(s);
const han = (s) => [...s].filter((c) => /\p{Script=Han}/u.test(c));
const PUNCT = /[\s.,!?;:'"’“”‘「」『』（）()、，。！？；：…—\-]/g;

// 번체에만 있는 글자 (표준 간체가 따로 있는 글자만 — 휴리스틱). 광둥어·중국어 모두 간체로 쓰므로 이 글자가 나오면 오류.
// 광둥어 고유 글자(嘅 啲 嘢 咗 冇 哋 佢 喺 畀 嚟 …)와, 간체로 바꾸면 다른 글자와 혼동되는 係 는 번체 그대로 쓰므로 목록에 없다.
const TRAD = [...'愛罷備筆畢邊變賓並補參倉層長車陳稱遲齒蟲醜處傳創從達帶單當黨導燈點電調東動鬥獨讀對頓爾發範飯婦復該幹趕個給鞏溝構購顧關觀館貫廣歸國過還漢號賀紅後護華畫話環換黃會繪貨獲機積際極幾濟記繼價堅間艱檢見薦獎講醬將節緊盡進經驚競舊覺開課壘類離禮歷麗連聯臉練涼兩療獵臨嶺領龍樓錄陸綠亂馬賣滿貿們夢廟滅鳴謀難腦鬧擬釀鳥牽錢強橋親輕傾請區趨權勸確讓熱認榮劇軟灑賽傘殺釋審聲勝師濕時識實適勢書屬樹雙誰說絲歲孫損縮臺態談湯糖體條鐵聽廳頭圖團圍衛為問無務習細鮮顯縣現線鄉響項學尋訊壓亞嚴驗陽樣業葉醫議億藝陰飲應營優郵遊語預園員遠願約雲運雜災贊責則賊張漲這鄭證職紙質終種眾週豬註專轉莊裝狀準資組']
// 광둥어 전용 글자·표현 (표준중국어 자료에 나오면 안 됨; 광둥어 자료에서는 번체 그대로 허용)
const YUE_ONLY = ['嘅', '唔', '係', '咗', '冇', '佢', '啲', '嘢', '哋', '咁', '嚟', '睇', '喺', '畀', '乜', '噉', '嗰', '冧', '攞', '嘥', '啱', '靚'];
// 표준중국어식 표현 (광둥어 글에 나오면 의심)
const MAND_IN_YUE = ['是', '不', '没有', '什么', '甚么', '他们', '我们', '你们', '这', '那里', '吗', '了', '很', '的'];
const PINYIN_CHARS = /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s'’.,!?;:\-“”"「」，。！？、；：]+$/i;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const JYUTPING = /^[a-z]+[1-6]$/;

// --- 일본어 ---
const JA_CHARS = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・々、。！？「」『』（）…〜\s]+$/u;
const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const KANA_OR_PUNCT = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・、。！？「」『』（）…〜\s]+$/u;
// JLPT N5 한자(약 100자). 이 밖의 한자가 나오면 '완전 초급'에 어려울 수 있어 경고 (공식 목록이 아니라 휴리스틱)
const N5_KANJI = new Set([...'日一国人年大十二本中長出三同時政事自行社見月分議後前民生連五発間対上部東者党地合市業内相方四定今回新場金員九入学高円子外八六下来気小七山話女北午百書先名川千水半男西電校語土木聞食車何南万毎白天母火右読友左休父雨']);

/** 후리가나 구조 검사: ruby = [{t, r?}] — 한자가 든 조각에만 r(가나)이 있고, t 를 이은 값 = base, (r ?? t) 를 이은 값 = reading */
function checkRuby(ruby, base, reading, at, E) {
  if (!Array.isArray(ruby) || !ruby.length) { E(`${at}: 한자가 있으므로 후리가나 구조(ruby 배열)가 필요함`); return false; }
  let ok = true, t = '', r = '';
  ruby.forEach((seg, i) => {
    if (!seg || typeof seg.t !== 'string' || !seg.t) { E(`${at}: ruby[${i}].t 누락`); ok = false; return; }
    const hasKanji = hasHan(seg.t);
    if (hasKanji && !(typeof seg.r === 'string' && KANA_ONLY.test(seg.r))) { E(`${at}: 한자 "${seg.t}" 에 가나로 된 후리가나(r)가 필요함`); ok = false; }
    if (!hasKanji && seg.r !== undefined) { E(`${at}: 한자가 없는 조각 "${seg.t}" 에는 후리가나(r)를 쓰지 않음`); ok = false; }
    t += seg.t; r += hasKanji && typeof seg.r === 'string' ? seg.r : seg.t;
  });
  if (t !== base) { E(`${at}: ruby 조각을 이은 글 "${t}" 가 원문 "${base}" 와 다름`); ok = false; }
  if (ok && r !== reading) { E(`${at}: 후리가나를 반영한 읽기 "${r}" 가 reading "${reading}" 와 다름`); ok = false; }
  return ok;
}
/** 단어 강조(uses)는 후리가나가 붙은 한자 덩어리 한가운데를 자를 수 없음 → 허용되는 경계 위치 집합 */
function rubyBoundaries(ruby) {
  const b = new Set([0]); let pos = 0;
  for (const seg of ruby) {
    if (seg.r === undefined) { for (const _ of seg.t) { pos += 1; b.add(pos); } }   // 한자 없는 조각: 글자마다 경계
    else { pos += seg.t.length; b.add(pos); }
  }
  return b;
}

/** 문장 안에서 uses 의 위치(start/end)를 계산해 채워 넣는다 (이미 있으면 유지). 실패 시 오류 메시지 배열 반환 */
export function resolveUses(sentence) {
  const errs = [];
  let cursor = 0;
  for (const u of sentence.uses || []) {
    if (Number.isInteger(u.start) && Number.isInteger(u.end)) { cursor = u.end; continue; }
    const idx = (sentence.text || '').indexOf(u.text, cursor);
    if (!u.text || idx < 0) { errs.push(`"${u.text}" 를 원문에서(앞 표현 이후) 찾을 수 없음 — uses 는 글에 나오는 순서대로 적어야 함`); continue; }
    u.start = idx; u.end = idx + u.text.length; cursor = u.end;
  }
  return errs;
}

const enStem = (w) => w.toLowerCase().replace(/[^a-z]/g, '').slice(0, Math.max(3, w.length - 3));

export function validateDay(d, config = {}) {
  const errors = [], warns = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m);
  const counts = { ...DEFAULT_CONFIG.counts, ...(config.counts || {}) };
  const levels = { ...DEFAULT_CONFIG.levels, ...(config.levels || {}) };

  if (!d || typeof d !== 'object') return { errors: ['JSON 객체가 아님'], warns };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) E('date 형식은 YYYY-MM-DD');
  if (!['ready', 'generating', 'failed'].includes(d.status)) E('status 는 ready | generating | failed');
  if (d.status !== 'ready') return { errors, warns };
  if (d.schemaVersion !== 2) { E('schemaVersion 은 2 여야 함 (구 형식 languages 는 지원하지 않음)'); return { errors, warns }; }
  const sets = d.sets || {};

  for (const key of LANG_KEYS.filter((k) => counts[k] !== undefined)) {
    const s = sets[key];
    const L = `[${key}]`;
    if (!s || typeof s !== 'object') { E(`${L} sets.${key} 학습 세트가 없음`); continue; }

    // --- 수준 표기
    if (s.level !== levels[key].label) E(`${L} level 은 "${levels[key].label}" 이어야 함 (현재 "${s.level}")`);
    if (key === 'zh' && !(typeof s.hskStandard === 'string' && s.hskStandard.trim())) E(`${L} 적용한 HSK 기준을 hskStandard 에 명시해야 함 (예: "HSK 2.0 6급제 4~6급")`);

    // --- 단어 목록
    const words = Array.isArray(s.words) ? s.words : [];
    if (words.length !== counts[key]) E(`${L} 단어는 ${counts[key]}개여야 하는데 ${words.length}개`);
    const byId = new Map(), seen = new Set();
    words.forEach((w, i) => {
      const at = `${L} 단어 ${i + 1}${w?.word ? ` "${w.word}"` : ''}`;
      for (const f of ['id', 'word', 'reading', 'meaning'])
        if (!w?.[f] || typeof w[f] !== 'string') E(`${at}: ${f} 누락`);
      if (!w) return;
      if (w.id && !new RegExp(`^${key}-\\d+$`).test(w.id)) E(`${at}: id 는 "${key}-숫자" 형식`);
      if (byId.has(w.id)) E(`${at}: id 중복`); byId.set(w.id, w);
      if (seen.has(w.word)) E(`${at}: 같은 날 단어 중복`); seen.add(w.word);
      if (w.meaning && !hasHangul(w.meaning)) E(`${at}: meaning 은 한국어여야 함`);
      if ('example' in w || 'exampleKo' in w) W(`${at}: 단어별 예문(example)은 더 이상 사용하지 않음 — 통합 글 사용`);
      const r = String(w.reading || '');
      if (key === 'yue') {
        if (han(w.word || '').length !== (w.word || '').length) E(`${at}: 광둥어 단어는 한자만 써야 함`);
        const bad = [...(w.word || '')].filter((c) => TRAD.includes(c));
        if (bad.length) E(`${at}: 광둥어도 간체로 써야 함 — 광둥어 고유 글자만 그대로 둠 (번체 의심: ${bad.join('')})`);
        const syl = r.trim().split(/\s+/);
        if (!syl.every((x) => JYUTPING.test(x))) E(`${at}: reading 은 Jyutping + 성조 숫자 — "${r}"`);
        else if (syl.length !== han(w.word).length) W(`${at}: 한자 ${han(w.word).length}자 vs Jyutping ${syl.length}음절`);
      } else if (key === 'zh') {
        const bad = [...(w.word || '')].filter((c) => TRAD.includes(c));
        if (bad.length) E(`${at}: 중국어는 간체여야 함 (번체 의심: ${bad.join('')})`);
        const yb = YUE_ONLY.filter((x) => (w.word || '').includes(x));
        if (yb.length) E(`${at}: 광둥어 글자가 섞임 (${yb.join(' ')})`);
        if (/\d/.test(r)) E(`${at}: 병음은 성조 숫자가 아니라 성조 부호로 — "${r}"`);
        else if (!PINYIN_CHARS.test(r)) E(`${at}: 병음 형식 오류 — "${r}"`);
        else if (!TONE_MARK.test(r)) W(`${at}: 성조 부호가 하나도 없음 — "${r}"`);
      } else if (key === 'en') {
        if (!/^[A-Za-z][A-Za-z\s'’-]*$/.test(w.word || '')) E(`${at}: 영어 단어는 알파벳이어야 함`);
        if (!/^\/.+\/$/.test(r)) E(`${at}: 발음기호는 /…/ 형식 — "${r}"`);
      } else if (key === 'ja') {
        const word = w.word || '';
        if (!JA_CHARS.test(word)) E(`${at}: 일본어 단어는 한자·히라가나·가타카나만 써야 함`);
        if (!KANA_ONLY.test(r)) E(`${at}: reading 은 가나(히라가나/가타카나)만 써야 함 (로마자·한자 금지) — "${r}"`);
        if (hasHan(word)) {
          checkRuby(w.ruby, word, r, at, E);
          const odd = [...new Set(han(word).filter((c) => !N5_KANJI.has(c)))];
          if (odd.length) W(`${at}: N5 한자 목록에 없는 한자 (${odd.join('')}) — '완전 초급'에 어려울 수 있음`);
        } else if (r !== word) E(`${at}: 한자가 없는 단어는 reading 이 단어와 같아야 함 ("${word}" ≠ "${r}")`);
      }
    });

    // --- 통합 글
    const p = s.passage;
    if (!p || typeof p !== 'object') { E(`${L} passage(통합 글)가 없음`); continue; }
    if (!p.title || typeof p.title !== 'string') E(`${L} 글 제목(title) 누락`);
    const sents = Array.isArray(p.sentences) ? p.sentences : [];
    if (sents.length < 4 || sents.length > 8) E(`${L} 글은 4~8문장(기본 5~6)이어야 하는데 ${sents.length}문장`);
    const used = new Map(); // wordId -> 횟수
    const textSeen = new Set();
    const fullText = sents.map((x) => x?.text || '').join(' ');

    sents.forEach((st, i) => {
      const at = `${L} 문장 ${i + 1}`;
      if (!st || typeof st !== 'object') { E(`${at}: 객체가 아님`); return; }
      if (!st.text || typeof st.text !== 'string') E(`${at}: 원문(text) 누락`);
      if (!st.ko || typeof st.ko !== 'string') E(`${at}: 한국어 번역(ko) 누락`);
      else if (!hasHangul(st.ko)) E(`${at}: ko 가 한국어가 아님`);
      if (textSeen.has(st.text)) E(`${at}: 같은 문장이 반복됨`); textSeen.add(st.text);
      const text = st.text || '';

      // 언어별 원문·발음
      if (key === 'yue') {
        const bad = [...text].filter((c) => TRAD.includes(c));
        if (bad.length) E(`${at}: 광둥어도 간체로 써야 함 — 광둥어 고유 글자만 그대로 둠 (번체 의심: ${[...new Set(bad)].join('')})`);
        const m = MAND_IN_YUE.filter((x) => text.includes(x));
        if (m.length) W(`${at}: 표준중국어식 표현 의심 (${m.join(' ')}) — 광둥어 구어인지 확인`);
        if (/[A-Za-z]/.test(text)) W(`${at}: 광둥어 글에 알파벳이 섞임`);
        if (han(text).length > 14) W(`${at}: 문장이 길어 '완전 초급'에 어려울 수 있음 (한자 ${han(text).length}자)`);
        const toks = String(st.reading || '').toLowerCase().replace(PUNCT, ' ').trim().split(/\s+/).filter(Boolean);
        if (!st.reading) E(`${at}: Jyutping(reading) 누락`);
        else if (!toks.every((x) => JYUTPING.test(x))) E(`${at}: reading 은 Jyutping + 성조 숫자여야 함 — "${st.reading}"`);
        else if (toks.length !== han(text).length) W(`${at}: 한자 ${han(text).length}자 vs Jyutping ${toks.length}음절`);
      } else if (key === 'zh') {
        const bad = [...text].filter((c) => TRAD.includes(c));
        if (bad.length) E(`${at}: 중국어는 간체여야 함 (번체 의심: ${[...new Set(bad)].join('')})`);
        const y = YUE_ONLY.filter((x) => text.includes(x));
        if (y.length) E(`${at}: 광둥어 표현이 섞임 (${y.join(' ')})`);
        if (/[A-Za-z]/.test(text)) W(`${at}: 중국어 글에 알파벳이 섞임`);
        if (han(text).length > 45) W(`${at}: 문장이 너무 긺 (한자 ${han(text).length}자)`);
        const r = String(st.reading || '');
        if (!r) E(`${at}: 병음(reading) 누락`);
        else if (/\d/.test(r)) E(`${at}: 병음은 성조 숫자가 아니라 성조 부호로`);
        else if (!PINYIN_CHARS.test(r)) E(`${at}: 병음 형식 오류 — "${r}"`);
        else if (!TONE_MARK.test(r)) W(`${at}: 성조 부호가 하나도 없음`);
      } else if (key === 'en') {
        if (hasHan(text) || hasHangul(text)) E(`${at}: 영어 글에 한자/한글이 섞임`);
        if (text.trim().split(/\s+/).length > 28) W(`${at}: 문장이 길어 말하기 답변으로 쓰기 어려움 (${text.trim().split(/\s+/).length}단어)`);
      } else if (key === 'ja') {
        if (hasHangul(text) || /[A-Za-z]/.test(text)) E(`${at}: 일본어 글에 한글/알파벳이 섞임`);
        else if (!JA_CHARS.test(text)) E(`${at}: 일본어 글에 허용되지 않는 문자가 있음`);
        if ([...text].length > 24) W(`${at}: 문장이 길어 '완전 초급'에 어려울 수 있음 (${[...text].length}자)`);
        if (han(text).length > 4) W(`${at}: 한자가 많음 (${han(text).length}자) — 가능하면 히라가나로`);
        const odd = [...new Set(han(text).filter((c) => !N5_KANJI.has(c)))];
        if (odd.length) W(`${at}: N5 한자 목록에 없는 한자 (${odd.join('')})`);
        const r = String(st.reading || '');
        if (!r) E(`${at}: 가나 읽기(reading) 누락`);
        else if (!KANA_OR_PUNCT.test(r)) E(`${at}: reading 은 가나와 문장부호만 써야 함 — "${r}"`);
        if (hasHan(text)) checkRuby(st.ruby, text, r, at, E);
        else if (r && r !== text) E(`${at}: 한자가 없는 문장은 reading 이 원문과 같아야 함`);
      }

      // 단어 연결 정보(uses)
      const uses = Array.isArray(st.uses) ? st.uses : [];
      if (!Array.isArray(st.uses)) E(`${at}: uses 배열 누락 (목표 단어가 없으면 빈 배열)`);
      let last = 0;
      uses.forEach((u, j) => {
        const ua = `${at} uses[${j}]`;
        const w = byId.get(u?.wordId);
        if (!w) { E(`${ua}: 존재하지 않는 wordId "${u?.wordId}"`); return; }
        if (!u.text || !Number.isInteger(u.start) || !Number.isInteger(u.end)) { E(`${ua}: text/start/end 필요 — node tools/finalize.mjs 로 start/end 를 채우세요`); return; }
        if (text.slice(u.start, u.end) !== u.text) { E(`${ua}: 원문과 불일치 — 원문[${u.start},${u.end})="${text.slice(u.start, u.end)}" ≠ "${u.text}"`); return; }
        if (u.start < last) E(`${ua}: 앞 표현과 겹치거나 순서가 뒤바뀜`);
        last = u.end;
        if (key === 'ja' && Array.isArray(st.ruby) && st.ruby.every((g) => g && typeof g.t === 'string')) {
          const bd = rubyBoundaries(st.ruby);
          if (!bd.has(u.start) || !bd.has(u.end)) E(`${ua}: "${u.text}" 가 후리가나가 붙은 한자 덩어리 중간을 자름 — 한자 덩어리는 통째로 연결해야 함`);
        }
        if (key === 'ja') {
          const stem = w.word.slice(0, Math.max(1, w.word.length - 1));   // 활용(食べる→食べます)을 허용하는 어간
          if (!u.text.includes(stem)) E(`${ua}: "${u.text}" 가 목표 단어 "${w.word}" 를 담고 있지 않음`);
          else if (!u.text.includes(w.word)) W(`${ua}: "${u.text}" 는 "${w.word}" 의 활용형 — 맞는지 확인`);
        } else if (key === 'en') {
          if (!u.text.toLowerCase().includes(enStem(w.word))) W(`${ua}: "${u.text}" 가 목표 단어 "${w.word}" 의 활용형인지 확인`);
        } else {
          const chars = han(w.word);
          if (!chars.every((c) => u.text.includes(c))) E(`${ua}: "${u.text}" 가 목표 단어 "${w.word}" 를 담고 있지 않음`);
        }
        used.set(w.id, (used.get(w.id) || 0) + 1);
      });
      // 링크되지 않은 목표 단어 출현 → 강조 누락 경고
      for (const w of words) {
        if (!w?.word || key === 'en') continue;
        let from = 0, idx;
        while ((idx = text.indexOf(w.word, from)) >= 0) {
          const covered = uses.some((u) => u.wordId === w.id && u.start <= idx && u.end >= idx + w.word.length);
          if (!covered) W(`${at}: "${w.word}" 가 원문에 있으나 uses 에 연결되지 않음 (강조 누락)`);
          from = idx + w.word.length;
        }
      }
    });

    // 모든 목표 단어 사용 (연결 정보 + 원문 이중 확인)
    for (const w of words) {
      if (!w?.id) continue;
      if (!used.get(w.id)) E(`${L} 목표 단어 "${w.word}"(${w.id}) 가 글에 연결되어 사용되지 않음`);
      const inText = key === 'en'
        ? new RegExp(`\\b${enStem(w.word)}`, 'i').test(fullText)
        : key === 'ja'
          ? fullText.includes(w.word.slice(0, Math.max(1, w.word.length - 1)))
          : han(w.word).every((c) => fullText.includes(c));
      if (!inText) E(`${L} 목표 단어 "${w.word}" 가 글 원문에 나타나지 않음`);
    }

    // 연결된 글인지(독립 예문 나열 아닌지) — 휴리스틱
    if (sents.length && words.length) {
      const per = sents.map((st) => new Set((st?.uses || []).map((u) => u.wordId)).size);
      const zero = per.filter((n) => n === 0).length;
      if (sents.length >= words.length && per.every((n) => n === 1)) W(`${L} 문장마다 단어가 정확히 1개씩 — 독립 예문 나열처럼 보임. 하나의 상황으로 이어지는 글인지 확인`);
      if (zero > sents.length / 2) W(`${L} 목표 단어가 없는 문장이 절반을 넘음`);
    }
    if (p.title && sents.length && textSeen.size === 0) E(`${L} 글 문장이 비어 있음`);
  }
  return { errors, warns };
}

export function loadConfig() {
  try { return JSON.parse(readFileSync(join(ROOT, 'data/config.json'), 'utf8')); } catch { return {}; }
}

// CLI
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.length ? args : readdirSync(join(ROOT, 'data/days')).filter((f) => f.endsWith('.json')).map((f) => join(ROOT, 'data/days', f));
  const cfg = loadConfig();
  let bad = 0;
  for (const f of files) {
    let r;
    try { r = validateDay(JSON.parse(readFileSync(f, 'utf8')), cfg); } catch (e) { r = { errors: ['JSON 파싱 실패: ' + e.message], warns: [] }; }
    const tag = r.errors.length ? '✗' : r.warns.length ? '△' : '✓';
    console.log(`${tag} ${f}`);
    r.errors.forEach((m) => console.log('   오류: ' + m));
    r.warns.forEach((m) => console.log('   경고: ' + m));
    if (r.errors.length) bad++;
  }
  if (!files.length) console.log('검사할 파일이 없습니다.');
  process.exit(bad ? 1 : 0);
}
