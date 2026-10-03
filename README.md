# 하루어휘 · Morning Words

매일 아침 광둥어 5 · 영어 10 · 중국어 10 · 일본어 5 · 한국어 10(중국인 학습자용) 단어와, 언어별로 그 단어를 모두 쓴 **통합 글** 1편씩을 공부하는 개인용 PWA.
빌드 도구·API·서버가 없는 순수 정적 사이트입니다.

## 구조

```
index.html, css/, js/app.js   앱 (바닐라 JS)
sw.js, manifest.webmanifest   PWA (오프라인·설치)
data/config.json              개수·생성 시각·수준·주제
data/index.json               날짜별 상태 (ready / generating / failed)
data/days/YYYY-MM-DD.json     그날의 자료 (스키마 v2: 언어별 단어 + 통합 글)
tools/                        validate · finalize · build-index · make-icons · 테스트 (Node)
worker/index.js                기기 동기화 서버 (Cloudflare Worker + D1) — /api/* 만 처리
docs/GENERATION.md            자료 생성/검증 지침
examples/day.example.json     자료 형식 예시 (앱은 읽지 않음)
```

- **자료**: GitHub 저장소의 JSON 파일 (자동 작업이 매일 push)
- **호스팅**: Cloudflare Pages (저장소 연결 → push 마다 자동 배포, 무료)
- **학습 기록**: 이 기기 브라우저(localStorage)에 저장 — 완료 상태, 다시 복습, 날짜별 집계.
  기기를 바꿀 때는 설정 → *학습 기록 백업* 의 내보내기/가져오기를 쓰세요.

## 배포

1. GitHub에 새 저장소를 만들고 이 폴더를 push
2. Cloudflare 대시보드 → Workers & Pages → Create → Pages → Connect to Git
   - Framework: None / Build command: 비움 / Output directory: `/`
3. 배포된 주소를 폰에서 열고 "홈 화면에 추가"(설치)

## 로컬 실행

```bash
python -m http.server 5173
```
http://localhost:5173 (서비스 워커는 localhost 또는 https에서만 동작)

## 자료 넣어보기 · 테스트

```bash
cp examples/day.example.json data/days/2026-10-02.json
node tools/finalize.mjs data/days/2026-10-02.json
node tools/validate.mjs
node tools/build-index.mjs
node --test tools/validate.test.mjs
```
자료가 없는 날과 미래 날짜에는 가짜 데이터를 보여주지 않고 "자료 없음/예정"으로 표시됩니다.

## 상태 표시

자료 없음 · 생성 중 · 생성 실패 (index.json 기준) / 학습 전 · 학습 중 · 학습 완료.
**학습 완료 = 그날 자료의 모든 단어 + 모든 언어의 글 읽기를 완료**(한국어가 생긴 뒤로는 단어 40개 + 글 5편; 그 전 날짜는 단어 30개 + 글 4편 그대로). 하나라도 취소하면 즉시 '학습 중'으로 되돌아갑니다. 단어 진행률(`단어 n/40`)과 글 읽기(`글 m/5`)는 따로 저장·표시됩니다.

**한국어**는 중국인 학습자용(사회통합프로그램 4단계 이상)이라, 단어는 중국어 번역 + 쉬운 한국어 풀이, 글 번역과 문법 설명은 중국어(간체)로 보여줘요.

**문법 설명(참고용)**: 광둥어·일본어·한국어 글에는 "문법 보기/숨기기"가 있어 문장별 설명, 3줄 정리(광둥어는 표준 중국어 비교표 포함)를 볼 수 있어요. 완료 조건에는 들어가지 않아요.

자세한 생성 규칙은 [docs/GENERATION.md](docs/GENERATION.md).

## 기기 동기화 (PC ↔ 휴대폰)

학습 기록(단어 완료·글 읽기·다시 복습)은 기본적으로 각 기기에만 저장됩니다. 설정 → **기기 동기화**에서 비밀번호로 로그인하면 기기끼리 같은 기록을 씁니다.

- **구조**: 앱 파일은 그대로 정적 호스팅, `/api/*` 만 `worker/index.js` 가 처리합니다. 기록은 Cloudflare **D1** 에 기록 한 건씩(완료·읽기·복습) 저장하고, 같은 기록은 **가장 최근에 바꾼 쪽이 이깁니다**(취소도 기록으로 남겨 다른 기기에 전달). 오프라인에서 바꾼 것은 연결되면 자동으로 올라갑니다.
- **보안**: 비밀번호·세션 비밀값은 코드·저장소에 없고 Cloudflare 의 **Secret** 으로만 둡니다. 로그인하면 서명된 HttpOnly 쿠키(90일)가 생기고, 같은 IP 에서 비밀번호를 8번 틀리면 15분간 막습니다. 학습 자료(단어·글)는 예전처럼 공개이고, 동기화되는 것은 진행 기록뿐입니다.
- **설정(한 번만)**
  1. Cloudflare → *Storage & databases → D1 SQL database → Create* → 이름 `haru-eohwi` → **Database ID** 복사 → `wrangler.jsonc` 의 `d1_databases[0].database_id` 에 넣고 push
  2. Workers & Pages → `haru-eohwi` → *Settings → Variables and Secrets* 에서 **Secret** 으로 추가:
     - `APP_PASSWORD` — 동기화에 쓸 비밀번호
     - `APP_SESSION_SECRET` — 16자 이상 무작위 문자열 (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 로 만들어 붙여넣기. 다른 곳에 공유하지 않기)
  3. 설정을 저장하면 재배포되고, 앱 설정 화면에 로그인 칸이 나타납니다. 표(테이블)는 첫 요청 때 자동으로 만들어집니다.
- **로컬 시험**: `.dev.vars` 에 `APP_PASSWORD=…`, `APP_SESSION_SECRET=…` 를 적고(저장소에 올리지 않음) `npx wrangler dev` → `SYNC_BASE=http://127.0.0.1:8787 node tools/sync-smoke.mjs`
  (Windows 에서 경로에 한글이 있으면 `--persist-to` 를 영문 경로로 주세요.)

## 음성 (기기 음성 사용) — 알려진 한계

- 단어·글 듣기는 브라우저의 음성 합성(기기 내장/Google 음성)을 씁니다. 설정 → 음성 점검에서 언어별로 어떤 음성이 잡혔는지 볼 수 있어요.
- 광둥어는 `yue-HK` / `zh-HK` 음성을 찾아 씁니다. 없으면 표준 중국어로 읽혀요 (폰 음성 설정에서 설치).
- **iPhone(iOS)**: 일부 기기(특히 홍콩 구입·번체 설정)에서는 iOS 가 중국어 방언을 시스템 설정(설정 → 손쉬운 사용 → 말하기 콘텐츠 → 음성 → 중국어 → 口說語言) 하나로 고정해 읽어서, 앱이 음성·언어 코드를 지정해도 광둥어/표준 중국어가 구분되지 않을 수 있어요. 웹 앱에서는 이 설정을 바꿀 수 없습니다. PC(Chrome)·안드로이드는 정상.
