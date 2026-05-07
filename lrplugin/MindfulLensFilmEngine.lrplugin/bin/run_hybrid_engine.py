#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any


CONTRACT_VERSION = "ml-hybrid-bridge/v1"


def _load_module(module_path: Path, module_name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module spec: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_json(path: str | None, payload: Any) -> None:
    if not path:
        return
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the hybrid MindfulLens engine from the Lightroom plugin")
    parser.add_argument("--input", required=True, help="Source RAW/TIFF path")
    parser.add_argument("--output", required=True, help="Flat analyzer-compatible JSON path")
    parser.add_argument("--emulsion", required=True, help="Emulsion ID, e.g. ektar_100")
    parser.add_argument("--format", default="35mm", help="Capture format ID")
    parser.add_argument("--profile-mode", default="production", choices=["production", "debug"])
    parser.add_argument("--night-boost-level", default="off", choices=["off", "soft", "medium", "strong"])
    parser.add_argument("--source", default="lightroom_plugin", help="Caller identifier for telemetry")
    parser.add_argument("--request-output", default=None, help="Optional request JSON path")
    parser.add_argument("--response-output", default=None, help="Optional response JSON path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    script_dir = Path(__file__).resolve().parent
    analyzer = _load_module(script_dir / "analyzer_stub.py", "mindfullens_analyzer_stub")

    request = {
        "input_path": args.input,
        "output_path": args.output,
        "emulsion_id": args.emulsion,
        "format_id": args.format,
        "profile_mode": args.profile_mode,
        "night_boost_level": args.night_boost_level,
        "source": args.source,
    }

    result = analyzer.build_payload(
        emulsion_id=args.emulsion,
        format_id=args.format,
        source_input=args.input,
        profile_mode=args.profile_mode,
        night_boost=(args.night_boost_level != "off"),
        night_boost_level=args.night_boost_level,
    )
    result["engine_source"] = "plugin_hybrid_runner"
    result["engine_contract_version"] = CONTRACT_VERSION

    response = {
        "contract_version": CONTRACT_VERSION,
        "request": request,
        "result": result,
    }

    _write_json(args.request_output, request)
    _write_json(args.response_output, response)
    _write_json(args.output, result)

    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
