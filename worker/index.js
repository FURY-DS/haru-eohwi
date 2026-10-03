// 하루어휘 동기화 서버 (Cloudflare Worker + D1)
// - /api/* 만 이 Worker 가 처리하고, 그 밖의 요청(앱 파일·학습 자료)은 정적 에셋이 그대로 응답합니다.
// - 학습 기록(완료·글 읽기·다시 복습)을 기록 한 건씩(records) 저장하고, 가장 최근에 바꾼 쪽이 이깁니다(last-write-wins, 삭제는 tombstone).
// - 로그인: 비밀번호(APP_PASSWORD) 일치 → 서명된 쿠키(APP_SESSION_SECRET 으로 HMAC). 비밀번호는 코드·저장소에 없고 Cloudflare 의 Secret 으로만 둡니다.
// 필요한 설정: D1 바인딩 DB, Secret APP_PASSWORD, Secret APP_SESSION_SECRET (README '기기 동기화' 참고)

const COOKIE = 'haru_session';
const SESSION_DAYS = 90;
const MAX_BODY = 1_000_000;       // 요청 본문 최대 바이트
const MAX_PUSH = 500;             // 한 번에 올릴 수 있는 기록 수
const PAGE = 1000;                // 한 번에 내려주는 기록 수
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;

const KEY_RE = /^[drv]\|\d{4}-\d{2}-\d{2}\|[a-z]{2,3}(-\d{1,3})?$/;   // d|날짜|단어id  r|날짜|언어  v|날짜|단어id

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function configured(env) {
  return !!(env.DB && typeof env.APP_PASSWORD === 'string' && env.APP_PASSWORD && typeof env.APP_SESSION_SECRET === 'string' && env.APP_SESSION_SECRET.length >= 16);
}

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS records (key TEXT PRIMARY KEY, ts INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, value TEXT, srv INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS records_srv ON records (srv)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS attempts (ip TEXT PRIMARY KEY, n INTEGER NOT NULL, first_ts INTEGER NOT NULL)'),
    ]).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

/* ---------- 세션 쿠키 ---------- */
function readCookie(request, name) {
  const h = request.headers.get('Cookie') || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}
async function makeSession(env) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  return `${exp}.${await hmacHex(env.APP_SESSION_SECRET, `v1.${exp}`)}`;
}
async function isAuthed(request, env) {
  const v = readCookie(request, COOKIE);
  const dot = v.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(v.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const want = await hmacHex(env.APP_SESSION_SECRET, `v1.${exp}`);
  return timingSafeEqual(enc.encode(v.slice(dot + 1)), enc.encode(want));
}
function cookieHeader(value, request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return { error: json({ error: 'JSON 요청이어야 해요' }, 415) };
  const text = await request.text();
  if (text.length > MAX_BODY) return { error: json({ error: '요청이 너무 커요' }, 413) };
  try { return { body: JSON.parse(text) }; } catch { return { error: json({ error: 'JSON 형식이 아니에요' }, 400) }; }
}

/* ---------- 로그인 ---------- */
async function login(request, env) {
  const r = await readJson(request);
  if (r.error) return r.error;
  const pw = typeof r.body?.password === 'string' ? r.body.password : '';
  if (!pw || pw.length > 200) return json({ error: '비밀번호를 입력해 주세요' }, 400);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const row = await env.DB.prepare('SELECT n, first_ts FROM attempts WHERE ip = ?').bind(ip).first();
  if (row && now - row.first_ts < LOGIN_WINDOW_MS && row.n >= LOGIN_MAX_FAILS) {
    const wait = Math.ceil((LOGIN_WINDOW_MS - (now - row.first_ts)) / 60000);
    return json({ error: `시도가 너무 많아요. ${wait}분 뒤에 다시 해 주세요` }, 429);
  }

  const ok = timingSafeEqual(await sha256(pw.trim()), await sha256(env.APP_PASSWORD.trim()));   // 대시보드에 붙여넣을 때 생기는 앞뒤 공백·줄바꿈은 무시
  if (!ok) {
    if (row && now - row.first_ts < LOGIN_WINDOW_MS) await env.DB.prepare('UPDATE attempts SET n = n + 1 WHERE ip = ?').bind(ip).run();
    else await env.DB.prepare('INSERT INTO attempts (ip, n, first_ts) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET n = 1, first_ts = excluded.first_ts').bind(ip, now).run();
    return json({ error: '비밀번호가 맞지 않아요' }, 401);
  }
  if (row) await env.DB.prepare('DELETE FROM attempts WHERE ip = ?').bind(ip).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(await makeSession(env), request, SESSION_DAYS * 86400) });
}

/* ---------- 동기화: 올리기 + 내려받기 ---------- */
function cleanRecord(rec, now) {
  if (!rec || typeof rec !== 'object') return null;
  const { key, ts, deleted, value } = rec;
  if (typeof key !== 'string' || !KEY_RE.test(key)) return null;
  if (!Number.isInteger(ts) || ts < 1_000_000_000_000 || ts > now + 86400_000) return null;
  const del = deleted ? 1 : 0;
  if (del) return { key, ts, del, value: null };
  if (key[0] === 'v') {
    if (typeof value !== 'string' || value.length > 4000) return null;
    try {
      const v = JSON.parse(value);
      if (!v || typeof v !== 'object' || typeof v.date !== 'string' || typeof v.lang !== 'string' || !v.card || typeof v.card.id !== 'string') return null;
    } catch { return null; }
    return { key, ts, del, value };
  }
  return { key, ts, del, value: null };
}

async function sync(request, env) {
  const r = await readJson(request);
  if (r.error) return r.error;
  const now = Date.now();
  const since = Number.isFinite(r.body?.since) && r.body.since > 0 ? Math.floor(r.body.since) : 0;
  const incoming = Array.isArray(r.body?.records) ? r.body.records : [];
  if (incoming.length > MAX_PUSH) return json({ error: `한 번에 ${MAX_PUSH}개까지 올릴 수 있어요` }, 413);

  const recs = incoming.map((x) => cleanRecord(x, now)).filter(Boolean);
  if (recs.length) {
    const up = env.DB.prepare(
      'INSERT INTO records (key, ts, deleted, value, srv) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET ts = excluded.ts, deleted = excluded.deleted, value = excluded.value, srv = excluded.srv WHERE excluded.ts > records.ts');
    await env.DB.batch(recs.map((x, i) => up.bind(x.key, x.ts, x.del, x.value, now * 1000 + i)));
  }

  const { results } = await env.DB.prepare('SELECT key, ts, deleted, value, srv FROM records WHERE srv > ? ORDER BY srv LIMIT ?').bind(since, PAGE + 1).all();
  const more = results.length > PAGE;
  const rows = more ? results.slice(0, PAGE) : results;
  return json({
    ok: true,
    now,
    accepted: recs.length,
    rejected: incoming.length - recs.length,
    more,
    cursor: rows.length ? rows[rows.length - 1].srv : since,
    records: rows.map((x) => ({ key: x.key, ts: x.ts, deleted: !!x.deleted, value: x.value })),
  });
}

/* ---------- 라우팅 ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });

    try {
      if (url.pathname === '/api/status' && request.method === 'GET') {
        if (!configured(env)) return json({ configured: false, authed: false });
        return json({ configured: true, authed: await isAuthed(request, env) });
      }
      if (!configured(env)) return json({ error: '동기화 서버가 아직 설정되지 않았어요', configured: false }, 503);

      if (url.pathname === '/api/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', request, 0) });
      }
      await ensureSchema(env);
      if (url.pathname === '/api/login' && request.method === 'POST') return await login(request, env);
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        if (!(await isAuthed(request, env))) return json({ error: '로그인이 필요해요', authed: false }, 401);
        return await sync(request, env);
      }
      return json({ error: '없는 주소예요' }, 404);
    } catch (e) {
      console.error('api error:', e && e.message ? e.message : e, e && e.cause && e.cause.message ? '| ' + e.cause.message : '', e && e.stack ? e.stack.split(String.fromCharCode(10))[1] : '');   // 상세 원인은 Cloudflare 로그에만 남기고, 화면에는 알리지 않는다
      return json({ error: '서버 오류가 났어요' }, 500);
    }
  },
};
