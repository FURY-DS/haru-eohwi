// 하루어휘 자료 검증기
// 사용: node tools/validate.mjs [파일 ...]      (생략하면 data/days/*.json 전체)
// 광둥어(yue)와 표준중국어(zh)는 서로 다른 규칙으로 따로 검사합니다.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasHangul = (s) => /[ㄱ-ㆎ가-힣]/.test(s);
const han = (s) => [...s].filter((c) => /\p{Script=Han}/u.test(c));

// 간체에만 있는 글자 / 번체에만 있는 글자 (대표적인 것들만 — 휴리스틱)
const SIMP = [...'这个们来说时间为样东门问见话对谁听觉岁饭车马鱼鸟电视学习还没会点发开关飞书买卖热经过边带层从国图块儿园终组织场远么难楼爱鸡鸭'];
const TRAD = [...'這個們來說時間為樣東門問見話對誰聽覺歲飯車馬魚鳥電視學習還沒會點發開關飛書買賣熱經過邊帶層從國圖塊兒園終組織場遠麼難樓愛雞鴨'];
// 광둥어 전용 글자·표현 (표준중국어 자료에 나오면 안 됨)
const YUE_ONLY = ['嘅', '唔', '係', '咗', '冇', '佢', '啲', '嘢', '哋', '咁', '嚟', '睇', '喺', '畀', '乜', '噉', '嗰', '冧', '攞', '嘥', '啱', '靚'];
// 표준중국어식 표현 (광둥어 예문에 나오면 의심)
const MAND_IN_YUE = ['是', '不', '沒有', '什麼', '甚麼', '他們', '我們', '你們', '這', '那裡', '嗎', '了', '很', '的'];
const PINYIN_CHARS = /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s'’.,!?\-]+$/i;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
const JYUTPING = /^[a-z]+[1-6]$/;

export function validateDay(d, config = {}) {
  const errors = [], warns = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m);
  if (!d || typeof d !== 'object') return { errors: ['JSON 객체가 아님'], warns };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) E('date 형식은 YYYY-MM-DD');
  if (!['ready', 'generating', 'failed'].includes(d.status)) E('status 는 ready | generating | failed');
  if (d.status !== 'ready') return { errors, warns };
  const counts = config.counts || { yue: 5, en: 10, zh: 10 };
  const langs = d.languages || {};

  for (const key of ['yue', 'en', 'zh']) {
    const arr = langs[key];
    if (!Array.isArray(arr)) { E(`languages.${key} 배열이 없음`); continue; }
    if (arr.length !== counts[key]) E(`${key}: ${counts[key]}개여야 하는데 ${arr.length}개`);
    const ids = new Set(), words = new Set();
    arr.forEach((w, i) => {
      const at = `${key}[${i + 1}]${w?.word ? ` "${w.word}"` : ''}`;
      for (const f of ['id', 'word', 'reading', 'meaning', 'example', 'exampleKo'])
        if (!w?.[f] || typeof w[f] !== 'string') E(`${at}: ${f} 누락`);
      if (!w) return;
      if (w.id && !w.id.startsWith(key + '-')) E(`${at}: id 는 "${key}-숫자" 형식`);
      if (ids.has(w.id)) E(`${at}: id 중복`); ids.add(w.id);
      if (words.has(w.word)) E(`${at}: 같은 날 단어 중복`); words.add(w.word);
      if (w.exampleKo && !hasHangul(w.exampleKo)) E(`${at}: exampleKo 가 한국어가 아님`);
      if (w.meaning && !hasHangul(w.meaning)) W(`${at}: meaning 에 한글이 없음`);
      const text = `${w.word || ''}${w.example || ''}`;

      if (key === 'yue') {
        const s = [...text].filter((c) => SIMP.includes(c));
        if (s.length) E(`${at}: 광둥어는 번체여야 함 (간체 의심: ${[...new Set(s)].join('')})`);
        const syl = String(w.reading || '').trim().split(/\s+/);
        if (!syl.every((x) => JYUTPING.test(x))) E(`${at}: reading 은 Jyutping + 성조 숫자 (예: zou2 san4) — "${w.reading}"`);
        else if (syl.length !== han(w.word || '').length) W(`${at}: 한자 ${han(w.word || '').length}자 vs Jyutping ${syl.length}음절`);
        if (w.exampleReading) {
          const es = String(w.exampleReading).toLowerCase().replace(/[.,!?，。！？]/g, ' ').trim().split(/\s+/);
          if (!es.every((x) => JYUTPING.test(x))) E(`${at}: exampleReading 은 Jyutping 이어야 함`);
        }
        const m = MAND_IN_YUE.filter((x) => (w.example || '').includes(x));
        if (m.length) W(`${at}: 예문에 표준중국어식 표현 의심 (${m.join(' ')}) — 광둥어 구어체인지 확인`);
        if (w.example && !w.example.includes(w.word)) W(`${at}: 예문에 단어가 그대로 들어있지 않음`);
      }
      if (key === 'zh') {
        const t = [...text].filter((c) => TRAD.includes(c));
        if (t.length) E(`${at}: 중국어는 간체여야 함 (번체 의심: ${[...new Set(t)].join('')})`);
        const y = YUE_ONLY.filter((x) => text.includes(x));
        if (y.length) E(`${at}: 광둥어 표현이 섞임 (${y.join(' ')})`);
        const r = String(w.reading || '');
        if (/\d/.test(r)) E(`${at}: 병음은 성조 숫자가 아니라 성조 부호로 (예: zǎocān) — "${r}"`);
        else if (!PINYIN_CHARS.test(r)) E(`${at}: 병음 형식 오류 — "${r}"`);
        else if (!TONE_MARK.test(r)) W(`${at}: 성조 부호가 하나도 없음 — "${r}"`);
        if (w.example && !w.example.includes(w.word) && !(w.word.length === 2 && w.example.includes(w.word[0]) && w.example.includes(w.word[1])))
          W(`${at}: 예문에 단어가 들어있지 않음`);
      }
      if (key === 'en') {
        if (!/^[A-Za-z][A-Za-z\s'’-]*$/.test(w.word || '')) E(`${at}: 영어 단어는 알파벳이어야 함`);
        if (!/^\/.+\/$/.test(w.reading || '')) E(`${at}: 발음기호는 /…/ 형식 — "${w.reading}"`);
        if (w.example && !new RegExp(String(w.word).slice(0, Math.max(3, String(w.word).length - 3)), 'i').test(w.example))
          W(`${at}: 예문에 단어(또는 변화형)가 없음`);
      }
    });
  }
  return { errors, warns };
}

function loadConfig() {
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
