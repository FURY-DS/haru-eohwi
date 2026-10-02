// data/index.json 을 data/days/*.json 으로부터 다시 만듭니다.
//   node tools/build-index.mjs                          검증 후 index.json 재생성
//   node tools/build-index.mjs --generating 2026-10-03 "생성 중"   상태만 표시
//   node tools/build-index.mjs --failed 2026-10-03 "원인 메시지"    실패 표시
// 검증(오류)에 실패한 날은 index 에 failed 로 기록되고, 앱에는 "생성 실패"로 보입니다.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { validateDay } from './validate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDX = join(ROOT, 'data/index.json');
const DAYS = join(ROOT, 'data/days');
const cfg = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'data/config.json'), 'utf8')); } catch { return {}; } })();
const old = existsSync(IDX) ? JSON.parse(readFileSync(IDX, 'utf8')) : { days: {} };
const days = {};

// 수동으로 표시된 상태(파일이 아직 없는 날)는 유지
for (const [d, v] of Object.entries(old.days || {})) {
  if (!existsSync(join(DAYS, `${d}.json`)) && ['generating', 'failed'].includes(v.status)) days[d] = v;
}

const [flag, date, msg] = process.argv.slice(2);
if (flag === '--generating' || flag === '--failed') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { console.error('날짜(YYYY-MM-DD)가 필요합니다'); process.exit(2); }
  days[date] = { status: flag.slice(2), message: msg || '' };
}

let fail = 0;
for (const f of readdirSync(DAYS).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
  const d = f.slice(0, 10);
  let r;
  try { r = validateDay(JSON.parse(readFileSync(join(DAYS, f), 'utf8')), cfg); }
  catch (e) { r = { errors: ['JSON 파싱 실패: ' + e.message], warns: [] }; }
  if (r.errors.length) { days[d] = { status: 'failed', message: `검증 실패: ${r.errors[0]}${r.errors.length > 1 ? ` 외 ${r.errors.length - 1}건` : ''}` }; fail++; console.error(`✗ ${f}\n   ${r.errors.join('\n   ')}`); }
  else days[d] = { status: 'ready', ...(r.warns.length ? { warnings: r.warns.length } : {}) };
}

const sorted = Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(IDX, JSON.stringify({ updatedAt: new Date().toISOString(), days: sorted }, null, 2) + '\n');
console.log(`index.json 갱신: ${Object.keys(sorted).length}일 (검증 실패 ${fail})`);
