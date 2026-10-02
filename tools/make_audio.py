#!/usr/bin/env python3
"""광둥어 음성 파일 생성 (canto-tts, CPU).

data/days/YYYY-MM-DD.json (스키마 v2) 의 광둥어 세트로부터
  audio/YYYY-MM-DD/yue-1.mp3 …      단어별 음성
  audio/YYYY-MM-DD/passage.mp3       통합 글 전체 (문장별로 합성해 이어 붙임)
  audio/YYYY-MM-DD/yue.json          매니페스트 (앱이 읽음)
을 만든다. 이미 매니페스트가 있는 날짜는 건너뛴다 (--force 로 다시 생성).

입력은 자료에 이미 검증된 Jyutping(reading)을 그대로 넣는다 — 간체→번체 변환·한자→발음 추측 단계를 거치지 않는다.
사용: python tools/make_audio.py [--date YYYY-MM-DD] [--force] [--out audio]
요구: pip install -r tools/audio-requirements.txt, ffmpeg(libmp3lame)
"""
from __future__ import annotations

import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_REPO = "typangaa/canto-tts-nano"
MODEL_REVISION = "fe17418a293d9be85685ddf750b0cfef9c88abb4"   # 테스트한 버전으로 고정
MODEL_DIR = Path(os.environ.get("CANTO_TTS_MODEL_DIR", Path.home() / ".cache" / "canto_tts_model"))
SYLLABLE = re.compile(r"^[a-z]+[1-6]$")
GAP_SECONDS = 0.45   # 문장 사이 쉼


def clean_jyutping(s: str) -> str:
    """Jyutping 문자열에서 구두점을 지우고 소문자 음절만 남긴다. 음절 형식이 아니면 오류."""
    toks = re.sub(r"[^A-Za-z0-9 ]", " ", s).lower().split()
    bad = [t for t in toks if not SYLLABLE.match(t)]
    if not toks or bad:
        raise ValueError(f"Jyutping 형식 오류: {s!r} {bad}")
    return " ".join(toks)


def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg") or ("C:/ffmpeg/bin/ffmpeg.exe" if Path("C:/ffmpeg/bin/ffmpeg.exe").exists() else None)
    if not exe:
        sys.exit("ffmpeg 를 찾을 수 없습니다")
    return exe


def to_mp3(ffmpeg: str, src: Path, dst: Path) -> None:
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "24000",
                    "-codec:a", "libmp3lame", "-b:a", "48k", str(dst)], check=True)


def load_tts():
    from huggingface_hub import snapshot_download
    from canto_tts import CantoTTS
    # 심볼릭 링크 없는 실제 파일로 내려받는다 (ONNX Runtime 이 HF 캐시의 링크 경로를 보안상 거부함)
    md = snapshot_download(MODEL_REPO, revision=MODEL_REVISION, local_dir=str(MODEL_DIR))
    return CantoTTS(checkpoint=md)


def synth(tts, jyutping: str, out_wav: Path) -> None:
    # duration_filter: 최대 3번 합성해 길이가 정상 범위인 것을 고른다 (끊김·반복 방지)
    tts.synthesize(jyutping, str(out_wav), quality="duration_filter", max_attempts=3)


def concat_with_gaps(wavs: list[Path], out_wav: Path) -> None:
    import numpy as np, soundfile as sf
    parts, rate = [], None
    for w in wavs:
        data, sr = sf.read(str(w), dtype="float32")
        rate = rate or sr
        if sr != rate:
            raise RuntimeError("샘플레이트가 서로 다름")
        parts.append(data)
        gap = np.zeros((int(rate * GAP_SECONDS),) + data.shape[1:], dtype="float32")
        parts.append(gap)
    sf.write(str(out_wav), np.concatenate(parts[:-1]), rate)


def build_day(tts, ffmpeg: str, day_file: Path, out_root: Path) -> bool:
    d = json.loads(day_file.read_text(encoding="utf-8"))
    if d.get("schemaVersion") != 2 or d.get("status") != "ready":
        return False
    s = (d.get("sets") or {}).get("yue")
    if not s:
        return False
    date = d["date"]
    out = out_root / date
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"version": 1, "date": date, "engine": "canto-tts-nano", "model": MODEL_REVISION[:8],
                "input": "jyutping", "words": {}, "passage": None}
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for w in s["words"]:
            wav = tmp / f"{w['id']}.wav"
            synth(tts, clean_jyutping(w["reading"]), wav)
            to_mp3(ffmpeg, wav, out / f"{w['id']}.mp3")
            manifest["words"][w["id"]] = f"{w['id']}.mp3"
        sent_wavs = []
        for i, st in enumerate(s["passage"]["sentences"], 1):
            wav = tmp / f"s{i}.wav"
            synth(tts, clean_jyutping(st["reading"]), wav)
            sent_wavs.append(wav)
        full = tmp / "passage.wav"
        concat_with_gaps(sent_wavs, full)
        to_mp3(ffmpeg, full, out / "passage.mp3")
        manifest["passage"] = "passage.mp3"
    (out / "yue.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    size = sum(p.stat().st_size for p in out.glob("*.mp3")) // 1024
    print(f"OK {date}: 단어 {len(manifest['words'])}개 + 글 1편, {size}KB, {time.time() - t0:.1f}s", flush=True)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "audio"))
    a = ap.parse_args()
    out_root = Path(a.out)
    days = sorted((ROOT / "data" / "days").glob("*.json"))
    if a.date:
        days = [p for p in days if p.stem == a.date]
    todo = [p for p in days if a.force or not (out_root / p.stem / "yue.json").exists()]
    if not todo:
        print("만들 음성이 없습니다 (모두 존재)")
        return 0
    ffmpeg = find_ffmpeg()
    tts = load_tts()
    failed = 0
    for p in todo:
        try:
            build_day(tts, ffmpeg, p, out_root)
        except Exception as e:   # 한 날짜 실패가 다른 날짜를 막지 않게
            failed += 1
            shutil.rmtree(out_root / p.stem, ignore_errors=True)
            print(f"FAIL {p.stem}: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
