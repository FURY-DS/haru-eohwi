# 하루어휘 · Morning Words

매일 아침 광둥어 5 · 영어 10 · 중국어 10 단어와, 언어별로 그 단어를 모두 쓴 **통합 글** 1편씩을 공부하는 개인용 PWA.
빌드 도구·API·서버가 없는 순수 정적 사이트입니다.

## 구조

```
index.html, css/, js/app.js   앱 (바닐라 JS)
sw.js, manifest.webmanifest   PWA (오프라인·설치)
data/config.json              개수·생성 시각·수준·주제
data/index.json               날짜별 상태 (ready / generating / failed)
data/days/YYYY-MM-DD.json     그날의 자료 (스키마 v2: 언어별 단어 + 통합 글)
tools/                        validate · finalize · build-index · make-icons · 테스트 (Node), make_audio.py (광둥어 음성)
audio/YYYY-MM-DD/             광둥어 음성 mp3 + yue.json (GitHub Actions 가 자동 생성)
.github/workflows/yue-audio.yml  자료 push → 광둥어 음성 생성
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
**학습 완료 = 단어 25개 + 세 언어의 글 읽기(3편)를 모두 완료.** 하나라도 취소하면 즉시 '학습 중'으로 되돌아갑니다. 단어 진행률(`단어 n/25`)과 글 읽기(`글 m/3`)는 따로 저장·표시됩니다.

자세한 생성 규칙은 [docs/GENERATION.md](docs/GENERATION.md).

## 광둥어 음성 (canto-tts)

기기에 광둥어 음성이 없어도 들을 수 있도록, 광둥어 단어·통합 글은 오픈소스 [canto-tts](https://github.com/typangaa/canto-tts)(Apache-2.0, CPU)로 **미리 만든 mp3**를 재생합니다.

- 자료(`data/days/*.json`)가 push 되면 GitHub Actions(`yue-audio.yml`)가 자료에 이미 들어 있는 **검증된 Jyutping**을 입력으로 음성을 만들어 `audio/날짜/`에 커밋합니다 (API 키·서버 없음, 하루 약 200KB).
- 앱은 `audio/날짜/yue.json`이 있으면 그 mp3를, 없으면 기기 음성을 씁니다. 음성 생성이 실패해도 학습에는 영향이 없습니다.
- 수동 실행: GitHub → Actions → yue-audio → Run workflow (force 로 다시 생성 가능). 로컬: `pip install -r tools/audio-requirements.txt && python tools/make_audio.py`
- 한계: 모델의 성조 정확도는 약 84%(제작자 평가)로, 사람 목소리와 같지 않습니다. 영어·중국어는 기기 음성을 씁니다.
