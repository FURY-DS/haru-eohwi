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
    d.date = '2026-09-01'; delete d.sets.yue.passage.grammar; delete d.sets.ja.passage.grammar;   // 문법 설명과 무관한 테스트
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

/* ---------- 문법 설명 (광둥어·일본어, 참고용) ---------- */
const gr = (d, k) => d.sets[k].passage.grammar;

test('문법: 예시 통과 + 적용일 이후에는 필수, 이전 날짜는 요구하지 않음', () => {
  assert.deepEqual(validateDay(base(), cfg).errors, []);
  for (const k of ['yue', 'ja']) {
    const r = run((d) => delete d.sets[k].passage.grammar);
    assert.ok(r.errors.includes(`[${k}] 문법 설명(passage.grammar)이 없음`), r.errors.join(' | '));
  }
  const old = run((d) => { d.date = '2026-09-01'; delete d.sets.yue.passage.grammar; delete d.sets.ja.passage.grammar; });
  assert.deepEqual(old.errors, []);
  // 영어·중국어는 문법 설명을 요구하지 않음 (써도 무시되고 경고)
  assert.deepEqual(run((d) => { delete d.sets.en.passage.grammar; }).errors, []);
});

test('문법: 표현(pattern)은 해당 문장에 실제로 있어야 하고 문장 번호는 유효해야 함', () => {
  has(run((d) => (gr(d, 'yue').sentences[0].items[0].pattern = '없는표현')), /원문에 그대로 없음/);
  has(run((d) => (gr(d, 'ja').sentences[0].sentence = 99)), /문장 번호/);
  has(run((d) => (gr(d, 'ja').sentences[1].sentence = gr(d, 'ja').sentences[0].sentence)), /중복/);
  has(run((d) => { gr(d, 'yue').sentences = gr(d, 'yue').sentences.slice(0, 2); }), /3개 문장 이상/);
  has(run((d) => { const b = gr(d, 'yue').sentences[0]; b.items = Array(5).fill(b.items[0]); }), /1~4개/);
});

test('문법: 필수 필드·한국어·정리 3줄', () => {
  has(run((d) => delete gr(d, 'yue').sentences[0].items[0].explain), /explain 누락/);
  has(run((d) => (gr(d, 'yue').sentences[0].items[0].explain = 'English only')), /explain 는 한국어/);
  has(run((d) => gr(d, 'ja').summary.pop()), /정확히 3줄/);
  has(run((d) => gr(d, 'ja').summary.push('넷째 줄')), /정확히 3줄/);
});

test('문법: 일본어 설명에는 한자를 쓰지 않고, 강조는 한자 덩어리를 자르지 않음', () => {
  has(run((d) => (gr(d, 'ja').sentences[0].items[0].explain = '「いく」(行く)는 가다예요.')), /한자를 쓰지 않음/);
  has(run((d) => (gr(d, 'ja').summary[0] = '조사: 今日(きょう)')), /한자를 쓰지 않음/);
  // 今日 의 '今' 만 가리키면 후리가나 덩어리 중간 → 오류
  has(run((d) => { gr(d, 'ja').sentences[0].items[0].pattern = '今'; }), /중간을 자름/);
});

test('문법: 광둥어 간체 규칙과 표준 중국어 비교표', () => {
  has(run((d) => (gr(d, 'yue').sentences[0].items[0].explain = '這個字是繁體입니다')), /광둥어도 간체로/);
  has(run((d) => delete gr(d, 'yue').compare), /비교표.*3~8줄/);
  has(run((d) => (gr(d, 'yue').compare = gr(d, 'yue').compare.slice(0, 2))), /3~8줄/);
  has(run((d) => (gr(d, 'yue').compare[0].this = '글에없는말')), /글에 나오지 않음/);
  has(run((d) => (gr(d, 'yue').compare[0].other = '給')), /간체여야/);
  has(run((d) => (gr(d, 'yue').compare[0].other = '佢哋')), /광둥어 글자가 있음/);
  // 일본어에는 비교표를 쓰지 않음 (있으면 경고)
  assert.ok(run((d) => { gr(d, 'ja').compare = [{ this: 'a', other: 'b' }]; }).warns.some((w) => /비교표는 광둥어에서만/.test(w)));
});

/* ---------- 한국어 (사회통합프로그램 4단계 이상 · 중국인 학습자) ---------- */
const kmut = (f) => run((d) => f(d.sets.ko));

test('한국어: 예시 통과, 단어 개수(10), 새 언어는 적용일 전 날짜에는 요구하지 않음', () => {
  assert.deepEqual(validateDay(base(), cfg).errors, []);
  has(run((d) => d.sets.ko.words.pop()), /\[ko\] 단어는 10개여야/);
  // 적용일(2026-10-04) 전: 세트가 없어도 통과 / 적용일부터: 필수
  assert.deepEqual(run((d) => { d.date = '2026-10-03'; delete d.sets.ko; }).errors, []);
  has(run((d) => { d.date = '2026-10-04'; delete d.sets.ko; }), /sets\.ko 학습 세트가 없음/);
  // 있으면 날짜와 상관없이 검사
  has(run((d) => { d.date = '2026-10-03'; d.sets.ko.level = '초급'; }), /level 은 "사회통합프로그램 4단계 이상"/);
});

test('한국어: 단어는 한글, 뜻은 쉬운 한국어 풀이 + 중국어(간체) 번역', () => {
  has(kmut((k) => (k.words[0].word = '搬家')), /한글.*만 써야/);
  has(kmut((k) => (k.words[0].word = 'visa')), /한글.*만 써야/);
  has(kmut((k) => delete k.words[0].meaningZh), /meaningZh 누락/);
  has(kmut((k) => (k.words[0].meaningZh = '이사')), /meaningZh 는 중국어/);
  has(kmut((k) => (k.words[0].meaningZh = '身份證件')), /meaningZh 는 간체/);
  has(kmut((k) => (k.words[0].meaning = 'moving report')), /meaning 은 한국어여야/);
  // 한국어는 발음 표시를 쓰지 않음 → reading 은 필수가 아니고, 있어도 경고만
  assert.ok(!run((d) => delete d.sets.ko.words[0].reading).errors.length);
  assert.ok(kmut((k) => (k.words[0].reading = 'jeonipsingo')) && run((d) => (d.sets.ko.words[0].reading = 'x')).warns.some((w) => /발음 표시/.test(w)));
});

test('한국어: 글은 한글(한자·알파벳 금지) + 문장별 중국어(간체) 번역', () => {
  has(kmut((k) => (k.passage.sentences[0].text = '지난주에 이사를 했어요. 搬家')), /한자가 섞임/);
  has(kmut((k) => (k.passage.sentences[0].text = 'Moving 전입신고를 했어요.')), /알파벳이 섞임/);
  has(kmut((k) => delete k.passage.sentences[1].zh), /중국어 번역\(zh\) 누락/);
  has(kmut((k) => (k.passage.sentences[1].zh = '신분증을 챙겼어요')), /zh 가 중국어가 아님/);
  has(kmut((k) => (k.passage.sentences[1].zh = '我忘了带身份证 신분증')), /한글이 섞임/);
  has(kmut((k) => (k.passage.sentences[1].zh = '因為沒有帶身份證')), /간체여야/);
  // 한국어 글에는 한국어 번역(ko) 대신 zh 를 쓰므로 ko 는 필수가 아님 (예시에도 없음)
  assert.ok(base().sets.ko.passage.sentences.every((x) => x.ko === undefined));
  assert.ok(run(() => {}).warns.length === 0);
  // 제목 번역 누락은 경고
  assert.ok(run((d) => delete d.sets.ko.passage.titleZh).warns.some((w) => /titleZh/.test(w)));
});

test('한국어: 목표 단어 사용 — 활용형 허용, 불규칙은 경고, 엉뚱한 연결은 오류', () => {
  // 확인하다 → 확인한/확인해 (하다 동사), 처리되다 → 처리되어서: 예시가 이미 오류·경고 없이 통과
  has(kmut((k) => { const s = k.passage.sentences[2]; s.uses[1] = { wordId: 'ko-6', text: '다른' }; delete s.uses[1].start; s.uses[1].start = s.text.indexOf('다른'); s.uses[1].end = s.uses[1].start + 2; }), /담고 있지 않음/);
  // 단어가 글에 전혀 없으면 오류
  has(kmut((k) => { const s = k.passage.sentences[4]; s.text = '절차가 쉬워서 놀랐어요.'; s.zh = '手续很简单，我很吃惊。'; s.uses = []; }), /복잡하다.*(사용되지 않|나타나지 않)/);
  // 불규칙 활용(덥다 → 더워요)은 허용하되 확인 경고
  const r = run((d) => {
    const k = d.sets.ko;
    k.words[6] = { id: 'ko-7', word: '덥다', meaning: '날씨가 뜨겁다', meaningZh: '热', pos: '형용사' };
    const s = k.passage.sentences[4]; s.text = '날씨가 더워요.'; s.zh = '天气很热。'; s.uses = [{ wordId: 'ko-7', text: '더워요' }]; resolveUses(s);
  });
  assert.deepEqual(r.errors.filter((e) => /\[ko\] 문장 5|ko-7|덥다/.test(e)), [], r.errors.join(' | '));
  assert.ok(r.warns.some((w) => /불규칙 활용형/.test(w)), r.warns.join(' | '));
});

test('한국어: 문법 설명은 중국어(간체)로, 비교표는 쓰지 않음', () => {
  const g = (d) => d.sets.ko.passage.grammar;
  has(run((d) => delete d.sets.ko.passage.grammar.summary), /정확히 3줄/);
  has(run((d) => (g(d).sentences[0].items[0].explain = '이유를 나타내요')), /설명\(explain\)은 중국어/);
  has(run((d) => (g(d).sentences[0].items[0].explain = '表示原因，也表示關係')), /설명은 간체/);
  has(run((d) => (g(d).summary[0] = '원인을 나타내요')), /중국어\(간체\)로 써야/);
  has(run((d) => (g(d).sentences[0].items[0].pattern = '없는표현')), /원문에 그대로 없음/);
  // title 은 문형 표기만(-아/어 두다)도 허용
  assert.deepEqual(run((d) => (g(d).sentences[0].items[0].title = '-아/어서')).errors, []);
  // 적용일 이후에는 문법 설명 필수
  const none = run((d) => delete d.sets.ko.passage.grammar);
  assert.ok(none.errors.includes('[ko] 문법 설명(passage.grammar)이 없음'), none.errors.join(' | '));
  assert.ok(run((d) => { g(d).compare = [{ this: 'a', other: 'b' }]; }).warns.some((w) => /비교표는 광둥어에서만/.test(w)));
});
