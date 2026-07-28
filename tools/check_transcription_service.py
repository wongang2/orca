#!/usr/bin/env python3
"""음성→텍스트 저장소의 정적 품질 계약 연결을 검사한다."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path


REQUIRED_KEYS = {
    "contract_version",
    "contract_module",
    "profiles",
    "entrypoints",
    "evaluation_policy",
    "rights_registry",
    "regression_tests",
    "smoke_evidence",
    "quality_status_values",
    "source_roles",
    "provenance_fields",
    "external_teacher_runtime_dependency",
    "teacher_entrypoints",
    "delivery_status",
}
REQUIRED_STATUSES = {"PASS", "FAIL", "UNKNOWN"}
REQUIRED_ROLES = {"teacher_raw", "human_gold", "candidate", "production"}
REQUIRED_PROVENANCE = {
    "audio_sha256",
    "engine_id",
    "asr_backend",
    "model_name",
    "model_version",
    "diarizer",
    "profile",
    "fallback_reason",
    "quality_status",
    "delivery_status",
}
BUILTIN_PROFILES = {"call", "meeting", "lecture", "dictation", "live"}
ENTRYPOINT_TOKENS = {
    "audio_sha256",
    "engine_id",
    "asr_backend",
    "model_name",
    "model_version",
    "diarizer",
    "profile",
    "source_role",
    "fallback_reason",
    "quality_status",
    "delivery_status",
    "evaluation_id",
}
RIGHTS_TOKENS = {
    "training_allowed",
    "commercial_product_allowed",
    "voice_embedding_allowed",
}
PROMOTION_TEST_TOKENS = {"production", "PASS", "UNKNOWN"}
DELIVERY_STATUSES = {"draft_unverified", "final_verified"}
LIKELY_ENTRYPOINT_NAMES = re.compile(
    r"(?:^|[/_.-])(?:asr|stt|dictat(?:e|ion)|transcrib(?:e|er|ing|tion)|"
    r"speech[-_]?to[-_]?text|speech[-_]?runtime|voice[-_]?mode|"
    r"whisper|vito|rtzr|diari[sz])",
    re.I,
)
DELIVERY_PATH_NAMES = re.compile(
    r"(?:dictat(?:e|ion)|voice[-_]?mode|ime[-_]?service|gateway[/\\]run)",
    re.I,
)
RUNTIME_SIGNALS = re.compile(
    r"(?:\bimport\s+(?:vito|rtzr)\b|"
    r"\b(?:Whisper|Groq|OpenAiTranscription|Recognizer|Diarization)\b|"
    r"\.(?:transcribe|recognize)\s*\(|"
    r"/audio/transcriptions|speech[-_ ]?to[-_ ]?text|"
    r"automatic speech recognition|audio transcription|"
    r"\b(?:URLSession|requests\.(?:post|get)|fetch|Worker)\s*\()",
    re.I,
)
DELIVERY_SIGNALS = re.compile(
    r"(?:PendingDictationInsertStore|commitText\s*\(|"
    r"transcription\.(?:text|provenance)|"
    r"(?:result|transcription_result)\.get\s*\(\s*['\"]transcript['\"]|"
    r"(?:result|transcription_result)\s*\[\s*['\"]transcript['\"]\s*\]|"
    r"['\"]transcript['\"]\s*:)",
    re.I,
)
RUNTIME_FORBIDDEN = re.compile(
    r"(?:vito|rtzr|vito\.ai|rtzr\.ai|r?tzr[-_]?vito)", re.I
)
SCAN_SUFFIXES = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".go",
    ".rs", ".rb", ".php", ".sh", ".swift", ".kt", ".kts",
}
SCAN_IGNORES = {
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".next",
    ".gradle", "DerivedData", "Pods", "build", "coverage", "dist", "out",
    "target", "vendor",
}
TEST_DIRS = {"test", "tests", "__tests__", "fixtures"}
IGNORABLE_ROOT_MARKERS = {
    "archive", "archived", "backup", "backups", "bakeoff", "benchmark",
    "benchmarks", "experiment", "experiments", "external", "models",
    "research", "sample", "samples", "third_party", "tmp", "vendor",
}


def _is_test_path(rel: Path) -> bool:
    name = rel.name.lower()
    return (
        any(part.lower() in TEST_DIRS for part in rel.parts[:-1])
        or name.startswith("test_")
        or name.endswith(("_test.py", ".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
    )


def _as_set(value: object) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {str(item) for item in value}


def _likely_entrypoints(root: Path, ignored_roots: set[str]) -> set[str]:
    """실제 엔진 호출 또는 사용자 delivery 징후가 있는 STT 경로를 찾는다."""
    found: set[str] = set()
    for directory, child_dirs, filenames in os.walk(root):
        relative_directory = Path(directory).relative_to(root).as_posix()
        if relative_directory in ignored_roots:
            child_dirs[:] = []
            continue
        child_dirs[:] = [
            name
            for name in child_dirs
            if name not in SCAN_IGNORES and not name.startswith(".")
        ]
        base = Path(directory)
        for filename in filenames:
            path = base / filename
            if path.suffix.lower() not in SCAN_SUFFIXES:
                continue
            rel_path = path.relative_to(root)
            if _is_test_path(rel_path):
                continue
            rel = rel_path.as_posix()
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            runtime_candidate = (
                LIKELY_ENTRYPOINT_NAMES.search(rel)
                and RUNTIME_SIGNALS.search(text)
            )
            delivery_candidate = (
                DELIVERY_PATH_NAMES.search(rel)
                and DELIVERY_SIGNALS.search(text)
            )
            if runtime_candidate or delivery_candidate:
                found.add(rel)
    return found


def _json_objects(value: object):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _json_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from _json_objects(child)


def _json_fixture_paths(root: Path, ignored_roots: set[str]):
    for directory, child_dirs, filenames in os.walk(root):
        relative_directory = Path(directory).relative_to(root).as_posix()
        if relative_directory in ignored_roots:
            child_dirs[:] = []
            continue
        child_dirs[:] = [
            name
            for name in child_dirs
            if name not in SCAN_IGNORES and not name.startswith(".")
        ]
        base = Path(directory)
        for filename in filenames:
            path = base / filename
            if path.suffix.lower() in {".json", ".jsonl"}:
                yield path


def check(root: Path) -> list[str]:
    errors: list[str] = []
    manifest_path = root / "transcription-quality.json"
    if not manifest_path.is_file():
        return [f"manifest 없음: {manifest_path}"]
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"manifest 읽기 실패: {exc}"]
    if not isinstance(manifest, dict):
        return ["manifest 최상위는 object여야 함"]

    missing = sorted(REQUIRED_KEYS - set(manifest))
    if missing:
        errors.append("필수 키 누락: " + ", ".join(missing))
    if manifest.get("external_teacher_runtime_dependency") is not False:
        errors.append("external_teacher_runtime_dependency는 false여야 함")

    delivery_status = manifest.get("delivery_status")
    if delivery_status not in DELIVERY_STATUSES:
        errors.append("delivery_status는 draft_unverified 또는 final_verified여야 함")
    if delivery_status == "final_verified" and manifest.get("quality_status") == "UNKNOWN":
        errors.append("quality_status UNKNOWN은 final_verified가 될 수 없음")

    profiles = _as_set(manifest.get("profiles"))
    if not profiles:
        errors.append("profiles가 비어 있음")
    unknown_profiles = profiles - BUILTIN_PROFILES
    if unknown_profiles:
        errors.append("정의되지 않은 profile: " + ", ".join(sorted(unknown_profiles)))
    if not REQUIRED_STATUSES.issubset(_as_set(manifest.get("quality_status_values"))):
        errors.append("quality_status_values에 PASS, FAIL, UNKNOWN이 모두 필요")
    if not REQUIRED_ROLES.issubset(_as_set(manifest.get("source_roles"))):
        errors.append("source_roles에 teacher_raw, human_gold, candidate, production이 모두 필요")
    if not REQUIRED_PROVENANCE.issubset(_as_set(manifest.get("provenance_fields"))):
        absent = REQUIRED_PROVENANCE - _as_set(manifest.get("provenance_fields"))
        errors.append("provenance_fields 누락: " + ", ".join(sorted(absent)))

    path_fields = ["contract_module", "evaluation_policy", "rights_registry", "smoke_evidence"]
    list_path_fields = ["entrypoints", "regression_tests"]
    for key in path_fields:
        value = manifest.get(key)
        if not isinstance(value, str) or not value:
            errors.append(f"{key}는 경로 문자열이어야 함")
        elif not (root / value).is_file():
            errors.append(f"{key} 파일 없음: {value}")
    for key in list_path_fields:
        values = manifest.get(key)
        if not isinstance(values, list) or not values:
            errors.append(f"{key}가 비어 있음")
            continue
        for value in values:
            if not isinstance(value, str) or not (root / value).is_file():
                errors.append(f"{key} 파일 없음: {value}")

    if not isinstance(manifest.get("teacher_entrypoints"), list):
        errors.append("teacher_entrypoints는 배열이어야 함")
    else:
        for value in manifest["teacher_entrypoints"]:
            if not isinstance(value, str) or not (root / value).is_file():
                errors.append(f"teacher_entrypoints 파일 없음: {value}")

    runtime_entrypoints = _as_set(manifest.get("entrypoints"))
    teacher_entrypoints = _as_set(manifest.get("teacher_entrypoints"))
    ignored = manifest.get("ignored_entrypoints", [])
    ignored_paths: set[str] = set()
    if not isinstance(ignored, list):
        errors.append("ignored_entrypoints는 배열이어야 함")
    else:
        for item in ignored:
            if not isinstance(item, dict) or not isinstance(item.get("path"), str) or not isinstance(item.get("reason"), str) or not item.get("reason", "").strip():
                errors.append("ignored_entrypoints 각 항목은 path와 비어 있지 않은 reason이 필요")
                continue
            ignored_paths.add(item["path"])
    ignored_roots_value = manifest.get("ignored_entrypoint_roots", [])
    ignored_roots: set[str] = set()
    if not isinstance(ignored_roots_value, list):
        errors.append("ignored_entrypoint_roots는 배열이어야 함")
    else:
        for item in ignored_roots_value:
            if (
                not isinstance(item, dict)
                or not isinstance(item.get("path"), str)
                or not isinstance(item.get("reason"), str)
                or not item.get("reason", "").strip()
            ):
                errors.append(
                    "ignored_entrypoint_roots 각 항목은 path와 비어 있지 않은 reason이 필요"
                )
                continue
            relative = Path(item["path"])
            markers = {
                token
                for part in relative.parts
                for token in re.split(r"[-_.]", part.lower())
            }
            if (
                relative.is_absolute()
                or ".." in relative.parts
                or not (markers & IGNORABLE_ROOT_MARKERS)
            ):
                errors.append(
                    "ignored_entrypoint_roots는 research/benchmark/vendor/tmp 계열만 허용: "
                    + item["path"]
                )
                continue
            if not (root / relative).is_dir():
                errors.append(
                    "ignored_entrypoint_roots 디렉터리 없음: " + item["path"]
                )
                continue
            ignored_roots.add(relative.as_posix())

    discovered = _likely_entrypoints(root, ignored_roots)
    undeclared = discovered - runtime_entrypoints - teacher_entrypoints - ignored_paths
    if undeclared:
        errors.append("미선언 음성/STT 진입점: " + ", ".join(sorted(undeclared)))

    contract_text = ""
    contract_rel = manifest.get("contract_module")
    if isinstance(contract_rel, str) and (root / contract_rel).is_file():
        contract_text = (root / contract_rel).read_text(
            encoding="utf-8", errors="replace"
        )
    for rel in manifest.get("entrypoints") or []:
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        wired_text = text + "\n" + contract_text
        if RUNTIME_FORBIDDEN.search(text):
            errors.append(f"runtime entrypoint 외부 teacher 의존 금지 위반({rel}): VITO/RTZR 참조")
        absent = sorted(
            token for token in ENTRYPOINT_TOKENS if token not in wired_text
        )
        if absent:
            errors.append(f"entrypoint 계약 연결 누락({rel}): " + ", ".join(absent))

    rights_rel = manifest.get("rights_registry")
    if isinstance(rights_rel, str) and (root / rights_rel).is_file():
        rights_text = (root / rights_rel).read_text(
            encoding="utf-8", errors="replace"
        )
        absent = sorted(token for token in RIGHTS_TOKENS if token not in rights_text)
        if absent:
            errors.append("rights_registry 권리 필드 누락: " + ", ".join(absent))

    smoke_rel = manifest.get("smoke_evidence")
    if isinstance(smoke_rel, str) and (root / smoke_rel).is_file():
        smoke_text = (root / smoke_rel).read_text(
            encoding="utf-8", errors="replace"
        )
        if "quality_status" not in smoke_text:
            errors.append("smoke_evidence에 quality_status가 없음")

    # 산출물 fixture 안에서 UNKNOWN을 final_verified로 포장하는 패턴을 차단한다.
    for path in _json_fixture_paths(root, ignored_roots):
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for obj in _json_objects(parsed):
            if obj.get("delivery_status") == "final_verified" and obj.get("quality_status") == "UNKNOWN":
                errors.append(f"fixture UNKNOWN은 final_verified가 될 수 없음: {path.relative_to(root)}")

    regression_text = ""
    for rel in manifest.get("regression_tests") or []:
        path = root / rel
        if path.is_file():
            regression_text += path.read_text(
                encoding="utf-8", errors="replace"
            )
    absent = sorted(
        token for token in PROMOTION_TEST_TOKENS if token not in regression_text
    )
    if absent:
        errors.append(
            "UNKNOWN→production 차단 회귀 근거 누락: " + ", ".join(absent)
        )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo_root", nargs="?", default=".")
    args = parser.parse_args()
    root = Path(args.repo_root).expanduser().resolve()
    errors = check(root)
    if errors:
        print("FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: 정적 음성 전사 품질 계약 연결 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
