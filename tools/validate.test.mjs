// 실행: node --test tools/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { validateDay, resolveUses } from './validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(ROOT, 'data/config.json'), 'utf8'));
const base = () => JSON.parse(readFileSync(join(ROOT, 'examples/day.example.json'), 'utf8'));
const run = (mut) => { const d = base(); mut(d); return validateDay(d, cfg); };
const has = (r, re) => assert.ok(r.errors.some((e) => re.test(e)), `기대한 오류 없음: ${re}\n실제: ${r.errors.join(' | ')}`);

test('예시 자료는 오류·경고 없이 통과', () => {
  const r = validateDay(base(), cfg);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warns, []);
});

test('단어 개수 (광둥어 5 / 영어 10 / 중국어 10)', () => {
  has(run((d) => d.sets.yue.words.pop()), /단어는 5개여야/);
  has(run((d) => d.sets.en.words.pop()), /단어는 10개여야/);
  has(run((d) => d.sets.zh.words.push({ ...d.sets.zh.words[0], id: 'zh-11', word: '测试' })), /단어는 10개여야/);
});

test('세트/글 누락', () => {
  has(run((d) => delete d.sets.zh), /학습 세트가 없음/);
  has(run((d) => delete d.sets.en.passage), /passage/);
  has(run((d) => (d.sets.yue.passage.sentences = d.sets.yue.passage.sentences.slice(0, 2))), /4~8문장/);
});

test('목표 단어가 글에서 사용되지 않으면 실패', () => {
  has(run((d) => {
    // 광둥어 唔該 문장을 단어 없는 문장으로 교체 (uses 도 비움)
    const s = d.sets.yue.passage.sentences[4]; s.text = '我返屋企。'; s.reading = 'ngo5 faan1 uk1 kei2.'; s.ko = '저는 집에 가요.'; s.uses = [];
  }), /唔该.*사용되지 않|唔该.*나타나지 않/);
});

test('uses 와 원문 불일치', () => {
  has(run((d) => { d.sets.en.passage.sentences[0].uses[0].start += 1; d.sets.en.passage.sentences[0].uses[0].end += 1; }), /원문과 불일치/);
  has(run((d) => (d.sets.zh.passage.sentences[0].uses[0].wordId = 'zh-99')), /존재하지 않는 wordId/);
  has(run((d) => (d.sets.zh.passage.sentences[0].uses[0].text = '环境')), /담고 있지 않음|원문과 불일치/);
});

test('발음·번역 누락', () => {
  has(run((d) => delete d.sets.yue.passage.sentences[1].reading), /Jyutping\(reading\) 누락/);
  has(run((d) => delete d.sets.zh.passage.sentences[1].reading), /병음\(reading\) 누락/);
  has(run((d) => delete d.sets.en.passage.sentences[1].ko), /번역\(ko\) 누락/);
  has(run((d) => delete d.sets.en.words[0].reading), /reading 누락/);
  has(run((d) => (d.sets.zh.words[0].meaning = 'adapt')), /한국어여야/);
});

test('광둥어/중국어 혼용·표기', () => {
  has(run((d) => { const s = d.sets.zh.passage.sentences[5]; s.text = '我哋一定會成功。'; }), /광둥어 표현이 섞임/);
  has(run((d) => (d.sets.zh.words[0].reading = 'shi4ying4')), /성조 숫자/);
  has(run((d) => (d.sets.yue.words[0].reading = 'ni hao')), /Jyutping/);
});

test('광둥어도 간체로: 번체는 오류, 광둥어 고유 글자는 허용', () => {
  // 번체 단어/문장 → 오류
  has(run((d) => (d.sets.yue.words[3].word = '幾多錢')), /광둥어도 간체로/);
  has(run((d) => (d.sets.yue.passage.sentences[1].text = '我要一杯奶茶，講。')), /광둥어도 간체로/);
  // 광둥어 고유 글자(嘅 係 唔 畀 喺 啲 …)가 번체 그대로 있어도 간체 오류가 나면 안 됨
  const r = run((d) => { const s = d.sets.yue.passage.sentences[3]; s.text = '老板話：「我係喺嘅啲畀唔冇。」'.replace('話', '话'); s.uses = []; });
  assert.ok(!r.errors.some((e) => /광둥어도 간체로/.test(e)), `광둥어 고유 글자가 잘못 걸림: ${r.errors.join(' | ')}`);
});

test('중국어는 간체 (번체 오류)', () => {
  has(run((d) => (d.sets.zh.words[0].word = '適應')), /간체여야/);
  has(run((d) => (d.sets.zh.passage.sentences[0].text = '畢業以後，我進了一家公司實習。')), /간체여야/);
});

test('수준 표기', () => {
  has(run((d) => (d.sets.yue.level = '중급')), /level 은 "완전 초급"/);
  has(run((d) => delete d.sets.zh.hskStandard), /hskStandard/);
});

test('구 형식(languages)은 거부', () => {
  const r = validateDay({ date: '2026-10-02', status: 'ready', languages: {} }, cfg);
  has(r, /schemaVersion/);
});

test('독립 예문 나열처럼 보이면 경고', () => {
  const r = run((d) => {
    const s = d.sets.yue.passage; // 5문장, 단어 5개, 문장마다 정확히 1개씩
    s.sentences = d.sets.yue.words.map((w, i) => ({ text: `${w.word}。`, reading: w.reading, ko: '테스트', uses: [{ wordId: w.id, text: w.word }] }));
    s.sentences.forEach(resolveUses);
  });
  assert.ok(r.warns.some((w) => /독립 예문 나열/.test(w)));
});

test('status 가 generating/failed 이면 내용 검사를 건너뜀', () => {
  assert.deepEqual(validateDay({ date: '2026-10-02', status: 'generating' }, cfg).errors, []);
});

test('resolveUses: 같은 표현이 반복돼도 순서대로 서로 다른 위치에 연결', () => {
  const st = { text: 'flexible plans and flexible hours', uses: [{ wordId: 'a', text: 'flexible' }, { wordId: 'a', text: 'flexible' }] };
  assert.deepEqual(resolveUses(st), []);
  assert.deepEqual(st.uses.map((u) => u.start), [0, 19]);
  const bad = { text: 'abc', uses: [{ wordId: 'a', text: 'zzz' }] };
  assert.equal(resolveUses(bad).length, 1);
});

/* ---------- 일본어 (완전 초급 + 후리가나) ---------- */
test('일본어: 예시 자료 통과, 단어 개수', () => {
  const r = validateDay(base(), cfg);
  assert.deepEqual(r.errors, []);
  has(run((d) => d.sets.ja.words.pop()), /\[ja\] 단어는 5개여야/);
  has(run((d) => delete d.sets.ja), /sets\.ja 학습 세트가 없음/);
});

test('일본어: 한자에는 후리가나 구조가 필요하고 읽기와 일치해야 함', () => {
  const mutW = (f) => run((d) => f(d.sets.ja.words[2]));          // 水 (みず)
  has(mutW((w) => delete w.ruby), /후리가나 구조\(ruby 배열\)가 필요/);
  has(mutW((w) => (w.ruby = [{ t: '水', r: 'みづ' }])), /reading .* 와 다름/);
  has(mutW((w) => (w.ruby = [{ t: '水' }])), /후리가나\(r\)가 필요/);
  has(mutW((w) => (w.ruby = [{ t: '火', r: 'みず' }])), /원문 .* 와 다름/);
  has(mutW((w) => (w.reading = 'mizu')), /가나.*만 써야/);
  const mutS = (f) => run((d) => f(d.sets.ja.passage.sentences[3]));   // 水もください。
  has(mutS((s) => delete s.ruby), /후리가나 구조\(ruby 배열\)가 필요/);
  has(mutS((s) => (s.ruby = [{ t: '水', r: 'うみ' }, { t: 'もください。' }])), /reading .* 와 다름/);
  has(mutS((s) => (s.ruby = [{ t: '水', r: 'みず' }, { t: 'もください。', r: 'x' }])), /후리가나\(r\)를 쓰지 않음/);
});

test('일본어: 한자 없는 단어·문장은 reading 이 원문과 같아야 함', () => {
  has(run((d) => (d.sets.ja.words[1].reading = 'こーひー')), /reading 이 단어와 같아야/);
  has(run((d) => (d.sets.ja.passage.sentences[2].reading = 'こーひーをください。')), /reading 이 원문과 같아야/);
});

test('일본어: 문자 종류·목표 단어 사용·강조 경계', () => {
  has(run((d) => (d.sets.ja.passage.sentences[2].text = 'Coffee をください。')), /한글\/알파벳이 섞임/);
  has(run((d) => { const s = d.sets.ja.passage.sentences[4]; s.text = 'おいくらですか。'; s.reading = 'おいくらですか。'; s.uses = []; }), /いくら.*사용되지 않/);
  has(run((d) => { d.sets.ja.passage.sentences[0].uses = [{ wordId: 'ja-3', text: '今', start: 0, end: 1 }]; }), /담고 있지 않음|중간을 자름/);
  // 한자 덩어리(今日) 한가운데를 자르는 강조 → 오류
  has(run((d) => {
    d.sets.ja.words[0] = { id: 'ja-1', word: '今', reading: 'こん', meaning: '지금', ruby: [{ t: '今', r: 'こん' }] };
    d.sets.ja.passage.sentences[0].uses = [{ wordId: 'ja-1', text: '今', start: 0, end: 1 }];
  }), /중간을 자름/);
});

test('일본어: 활용형은 허용(경고), 수준 휴리스틱 경고', () => {
  // 食べる → 食べます : 어간(食べ)이 포함되면 오류가 아니라 경고
  const r = run((d) => {
    d.sets.ja.words[3] = { id: 'ja-4', word: '食べる', reading: 'たべる', meaning: '먹다', ruby: [{ t: '食', r: 'た' }, { t: 'べる' }] };
    const s = d.sets.ja.passage.sentences[4];
    s.text = '食べます。'; s.reading = 'たべます。'; s.ruby = [{ t: '食', r: 'た' }, { t: 'べます。' }]; s.uses = [{ wordId: 'ja-4', text: '食べ' }]; resolveUses(s);
  });
  assert.deepEqual(r.errors, [], r.errors.join(' | '));
  assert.ok(r.warns.some((w) => /활용형/.test(w)));
  // N5 밖의 한자 → 경고
  const r2 = run((d) => {
    const w = d.sets.ja.words[2]; w.word = '朝'; w.reading = 'あさ'; w.ruby = [{ t: '朝', r: 'あさ' }];
  });
  assert.ok(r2.warns.some((x) => /N5 한자 목록에 없는 한자 \(朝\)/.test(x)), r2.warns.join(' | '));
});

test('일본어: 수준(label) 표기', () => {
  has(run((d) => (d.sets.ja.level = '중급')), /level 은 "완전 초급 \(JLPT N5 이하\)"/);
});
