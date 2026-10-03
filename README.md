# 하루어휘 · Morning Words

매일 아침 광둥어 5 · 영어 10 · 중국어 10 · 일본어 5 단어와, 언어별로 그 단어를 모두 쓴 **통합 글** 1편씩을 공부하는 개인용 PWA.
빌드 도구·API·서버가 없는 순수 정적 사이트입니다.

## 구조

```
index.html, css/, js/app.js   앱 (바닐라 JS)
sw.js, manifest.webmanifest   PWA (오프라인·설치)
data/config.json              개수·생성 시각·수준·주제
data/index.json               날짜별 상태 (ready / generating / failed)
data/days/YYYY-MM-DD.json     그날의 자료 (스키마 v2: 언어별 단어 + 통합 글)
tools/                        validate · finalize · build-index · make-icons · 테스트 (Node)
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
**학습 완료 = 단어 30개 + 네 언어의 글 읽기(4편)를 모두 완료.** 하나라도 취소하면 즉시 '학습 중'으로 되돌아갑니다. 단어 진행률(`단어 n/30`)과 글 읽기(`글 m/4`)는 따로 저장·표시됩니다.

**문법 설명(참고용)**: 광둥어·일본어 글에는 "문법 보기/숨기기"가 있어 문장별 설명, 3줄 정리(광둥어는 표준 중국어 비교표 포함)를 볼 수 있어요. 완료 조건에는 들어가지 않아요.

자세한 생성 규칙은 [docs/GENERATION.md](docs/GENERATION.md).

## 음성 (기기 음성 사용) — 알려진 한계

- 단어·글 듣기는 브라우저의 음성 합성(기기 내장/Google 음성)을 씁니다. 설정 → 음성 점검에서 언어별로 어떤 음성이 잡혔는지 볼 수 있어요.
- 광둥어는 `yue-HK` / `zh-HK` 음성을 찾아 씁니다. 없으면 표준 중국어로 읽혀요 (폰 음성 설정에서 설치).
- **iPhone(iOS)**: 일부 기기(특히 홍콩 구입·번체 설정)에서는 iOS 가 중국어 방언을 시스템 설정(설정 → 손쉬운 사용 → 말하기 콘텐츠 → 음성 → 중국어 → 口說語言) 하나로 고정해 읽어서, 앱이 음성·언어 코드를 지정해도 광둥어/표준 중국어가 구분되지 않을 수 있어요. 웹 앱에서는 이 설정을 바꿀 수 없습니다. PC(Chrome)·안드로이드는 정상.
