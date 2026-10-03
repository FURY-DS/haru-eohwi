// 동기화 서버 스모크 테스트: 로그인·쿠키·동기화(LWW, 삭제, 페이지)·입력 검증·로그인 시도 제한
// 사용: wrangler dev 를 띄우고(.dev.vars 에 APP_PASSWORD, APP_SESSION_SECRET) →  SYNC_BASE=http://127.0.0.1:8790 node tools/sync-smoke.mjs
// 주의: 마지막에 로그인 시도 제한(429)을 일부러 발동시키므로 한 번 돌린 뒤에는 15분간 같은 로컬 DB 로 로그인이 막힙니다(wrangler dev 재시작·--persist-to 새 경로로 초기화).
import { readFileSync } from 'node:fs';
const BASE = process.env.SYNC_BASE || 'http://127.0.0.1:8790';
const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('✗', m); } };
const call = async (path, body, cookie, method) => {
  const r = await fetch(BASE + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, setCookie: r.headers.get('set-cookie') };
};
const now = Date.now();

// 상태
let r = await call('/api/status');
ok(r.status === 200 && r.j.configured === true && r.j.authed === false, 'status 미로그인');
// 로그인 전에는 sync 불가
r = await call('/api/sync', { since: 0, records: [] });
ok(r.status === 401, 'sync 는 로그인 필요: ' + r.status);
// 틀린 비밀번호
r = await call('/api/login', { password: 'wrong-pw' });
ok(r.status === 401 && !r.setCookie, '틀린 비밀번호 거부');
// 잘못된 요청 형식
const bad = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
ok(bad.status === 415, 'JSON 아니면 415: ' + bad.status);
// 정상 로그인
r = await call('/api/login', { password: vars.APP_PASSWORD });
ok(r.status === 200 && r.setCookie && /HttpOnly/.test(r.setCookie) && /SameSite=Strict/.test(r.setCookie), '로그인 성공 + HttpOnly/SameSite 쿠키');
const cookie = r.setCookie.split(';')[0];
r = await call('/api/status', undefined, cookie);
ok(r.j.authed === true, 'status 로그인됨');
// 위조 쿠키
r = await call('/api/status', undefined, 'haru_session=' + (now + 1e9) + '.deadbeef');
ok(r.j.authed === false, '위조 쿠키 거부');
r = await call('/api/status', undefined, 'haru_session=1.' + 'a'.repeat(64));
ok(r.j.authed === false, '만료 쿠키 거부');

// 올리기: 완료(d), 글 읽기(r), 복습(v)
const T = now - 60000;
const card = { id: 'ko-1', word: '전입신고' };
const rv = JSON.stringify({ date: '2026-10-03', lang: 'ko', addedAt: T, card });
r = await call('/api/sync', { since: 0, records: [
  { key: 'd|2026-10-03|ko-1', ts: T, deleted: false, value: null },
  { key: 'r|2026-10-03|ko', ts: T, deleted: false, value: null },
  { key: 'v|2026-10-03|ko-1', ts: T, deleted: false, value: rv },
] }, cookie);
ok(r.status === 200 && r.j.accepted === 3 && r.j.rejected === 0, '3건 올리기: ' + JSON.stringify(r.j && { a: r.j.accepted, rj: r.j.rejected }));
ok(r.j.records.length === 3, '올린 기록이 내려옴(자기 기록 포함)');
const cur1 = r.j.cursor;

// 다른 기기가 처음부터 받기
r = await call('/api/sync', { since: 0, records: [] }, cookie);
ok(r.j.records.length === 3 && r.j.records.find((x) => x.key.startsWith('v|')).value === rv, '두 번째 기기가 전부 받음');

// 더 오래된 변경은 무시 (LWW)
r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: [{ key: 'd|2026-10-03|ko-1', ts: T - 5000, deleted: true, value: null }] }, cookie);
r = await call('/api/sync', { since: 0, records: [] }, cookie);
ok(r.j.records.find((x) => x.key === 'd|2026-10-03|ko-1').deleted === false, '오래된 삭제는 무시');
// 더 새로운 삭제는 반영 (tombstone)
r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: [{ key: 'd|2026-10-03|ko-1', ts: T + 5000, deleted: true, value: null }] }, cookie);
r = await call('/api/sync', { since: cur1 - 1, records: [] }, cookie);
const del = r.j.records.find((x) => x.key === 'd|2026-10-03|ko-1');
ok(del && del.deleted === true && del.ts === T + 5000, '새 삭제는 tombstone 으로 전달');
// 같은 시각이면 기존 유지
r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: [{ key: 'd|2026-10-03|ko-1', ts: T + 5000, deleted: false, value: null }] }, cookie);
r = await call('/api/sync', { since: 0, records: [] }, cookie);
ok(r.j.records.find((x) => x.key === 'd|2026-10-03|ko-1').deleted === true, '같은 시각 충돌은 기존 유지');
// 삭제 후 다시 완료 (더 새로움)
r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: [{ key: 'd|2026-10-03|ko-1', ts: T + 9000, deleted: false, value: null }] }, cookie);
r = await call('/api/sync', { since: 0, records: [] }, cookie);
ok(r.j.records.find((x) => x.key === 'd|2026-10-03|ko-1').deleted === false, '삭제 뒤 다시 완료하면 되살아남');

// 입력 검증: 잘못된 key / ts / value
r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: [
  { key: 'x|2026-10-03|ko-1', ts: T, deleted: false },
  { key: 'd|2026-10-03|<script>', ts: T, deleted: false },
  { key: 'd|2026-10-03|ko-2', ts: 5, deleted: false },
  { key: 'd|2026-10-03|ko-3', ts: now + 9e9, deleted: false },
  { key: 'v|2026-10-03|ko-4', ts: T, deleted: false, value: 'not json' },
  { key: 'v|2026-10-03|ko-5', ts: T, deleted: false, value: JSON.stringify({ date: 'x' }) },
  { key: 'd|2026-10-03|ko-6', ts: T, deleted: false },
] }, cookie);
ok(r.j.accepted === 1 && r.j.rejected === 6, '잘못된 기록 6건 거부, 1건 수락: ' + JSON.stringify({ a: r.j.accepted, rj: r.j.rejected }));
// 너무 많은 기록
r = await call('/api/sync', { since: 0, records: Array.from({ length: 501 }, (_, i) => ({ key: `d|2026-10-03|ko-${i}`, ts: T, deleted: false })) }, cookie);
ok(r.status === 413, '501건은 413: ' + r.status);

// 페이지 나누기: 1200건 올리고 1000건씩 받기
for (let b = 0; b < 3; b++) {
  const recs = Array.from({ length: 400 }, (_, i) => ({ key: `d|2026-09-${String(10 + b).padStart(2, '0')}|ko-${i}`, ts: T, deleted: false }));
  r = await call('/api/sync', { since: Number.MAX_SAFE_INTEGER, records: recs }, cookie);
  ok(r.j.accepted === 400, `배치 ${b} 수락`);
}
let since = 0, got = 0, pages = 0, more = true;
while (more && pages < 10) { r = await call('/api/sync', { since, records: [] }, cookie); got += r.j.records.length; more = r.j.more; since = r.j.cursor; pages++; }
ok(got >= 1200 && pages >= 2, `페이지 나눠 받기: ${got}건 ${pages}쪽`);

// 로그아웃
r = await call('/api/logout', {}, cookie);
ok(r.status === 200 && /Max-Age=0/.test(r.setCookie || ''), '로그아웃 쿠키 삭제');
// 없는 주소
r = await call('/api/nothing', {}, cookie);
ok(r.status === 404, '없는 주소 404: ' + r.status);
// 정적 파일은 Worker 를 거치지 않고 그대로
const idx = await fetch(BASE + '/index.html');
ok(idx.status === 200 || idx.status === 307, '정적 index 응답: ' + idx.status);
const js = await fetch(BASE + '/js/app.js');
ok(js.status === 200 && (await js.text()).includes('syncNow'), '정적 app.js 응답');
const wk = await fetch(BASE + '/worker/index.js');
const wkText = wk.status === 200 ? await wk.text() : '';
ok(wk.status === 404 || !wkText.includes('APP_SESSION_SECRET'), '서버 코드는 공개 파일로 노출되지 않음: ' + wk.status);

// 로그인 시도 제한: 9번 틀리면 잠김 (맨 마지막에 실행)
let lastStatus = 0;
for (let i = 0; i < 10; i++) lastStatus = (await call('/api/login', { password: 'wrong' + i })).status;
ok(lastStatus === 429, '시도 제한 429: ' + lastStatus);
r = await call('/api/login', { password: vars.APP_PASSWORD });
ok(r.status === 429, '잠긴 동안은 올바른 비밀번호도 거부: ' + r.status);

console.log(`통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
