// 생성 직후 한 번 실행: 각 문장의 uses[].text 위치(start/end)를 원문에서 계산해 채웁니다.
//   node tools/finalize.mjs data/days/2026-10-03.json
// 생성기는 uses 에 { "wordId": "yue-1", "text": "食飯" } 만 글에 나오는 순서대로 적으면 됩니다.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveUses } from './validate.mjs';

let bad = 0;
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  for (const [key, s] of Object.entries(d.sets || {})) {
    (s?.passage?.sentences || []).forEach((st, i) => {
      for (const m of resolveUses(st)) { console.error(`✗ ${f} [${key}] 문장 ${i + 1}: ${m}`); bad++; }
    });
  }
  writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
  console.log(`finalize: ${f}`);
}
process.exit(bad ? 1 : 0);
