import json
import os
import sys
import pickle
from typing import Any, Dict, List, Optional, Tuple


def _script_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _model_filename_candidates() -> List[str]:
    # Be tolerant to common naming/casing variants.
    # This matters on Linux deployments where filenames are case-sensitive.
    return [
        "chickshelf.pkl",
        "ChickShelf.pkl",
        "Chickhelf.pkl",
    ]


def _default_model_paths() -> List[str]:
    # Prefer a model next to this script, but allow repo-root placement too.
    paths: List[str] = [os.environ.get("ML_MODEL_PATH", "")]
    for filename in _model_filename_candidates():
        paths.extend(
            [
                os.path.join(_script_dir(), filename),
                os.path.join(os.getcwd(), filename),
                os.path.join(os.getcwd(), "backend", "ml", filename),
            ]
        )
    return paths


def _load_model() -> Any:
    override = os.environ.get("ML_MODEL_PATH")
    candidates = [override] if override else []
    candidates.extend([p for p in _default_model_paths() if p])

    tried: List[str] = []
    for path in candidates:
        if not path:
            continue
        tried.append(path)
        if os.path.exists(path) and os.path.isfile(path):
            with open(path, "rb") as f:
                return pickle.load(f)

    raise FileNotFoundError(
        "Model file not found. Place chickshelf.pkl (or Chickhelf.pkl) in backend/ml/ or set ML_MODEL_PATH. Tried: "
        + ", ".join(tried)
    )


def _feature_names_from_model(model: Any) -> Optional[List[str]]:
    if hasattr(model, "feature_names_in_"):
        names = getattr(model, "feature_names_in_")
        try:
            return [str(x) for x in list(names)]
        except Exception:
            pass

    # scikit-learn Pipeline often keeps feature names on a step
    if hasattr(model, "named_steps"):
        try:
            for step in reversed(list(model.named_steps.values())):
                if hasattr(step, "feature_names_in_"):
                    names = getattr(step, "feature_names_in_")
                    return [str(x) for x in list(names)]
        except Exception:
            pass

    return None


def _to_python(value: Any) -> Any:
    # Convert numpy/pandas scalars and arrays to pure Python for JSON.
    try:
        import numpy as np  # type: ignore

        if isinstance(value, (np.generic,)):
            return value.item()
        if isinstance(value, np.ndarray):
            return value.tolist()
    except Exception:
        pass

    # Lists/tuples/dicts
    if isinstance(value, dict):
        return {str(k): _to_python(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_python(v) for v in value]

    return value


def _normalize_feature_payload(payload: Dict[str, Any]) -> Dict[str, float]:
    if "features" in payload and isinstance(payload["features"], dict):
        feats = payload["features"]
    elif "rows" in payload and isinstance(payload["rows"], list) and payload["rows"] and isinstance(payload["rows"][0], dict):
        feats = payload["rows"][0]
    else:
        feats = {}

    return {
        "Ammonia_ppm": float(feats.get("Ammonia_ppm", feats.get("ammonia_ppm", feats.get("nh3", 0)) or 0)),
        "CO2_ppm": float(feats.get("CO2_ppm", feats.get("co2_ppm", feats.get("co2", 0)) or 0)),
        "H2S_ppm": float(feats.get("H2S_ppm", feats.get("h2s_ppm", feats.get("h2s", feats.get("lpg", 0)) or 0))),
        "LPG_ppm": float(feats.get("LPG_ppm", feats.get("lpg_ppm", feats.get("lpg", feats.get("h2s", 0)) or 0))),
        "CO_ppm": float(feats.get("CO_ppm", feats.get("co_ppm", feats.get("co", 0)) or 0)),
        "Oxygen_percent": float(feats.get("Oxygen_percent", feats.get("oxygen_percent", feats.get("o2", 0)) or 0)),
        "Temperature_C": float(feats.get("Temperature_C", feats.get("temperature_c", feats.get("temp", 0)) or 0)),
        "Humidity_percent": float(feats.get("Humidity_percent", feats.get("humidity_percent", feats.get("hum", 0)) or 0)),
        "Light_lux": float(feats.get("Light_lux", feats.get("light_lux", feats.get("lightLux", 0)) or 0)),
        "Methane_ppm": float(feats.get("Methane_ppm", feats.get("methane_ppm", feats.get("ch4", 0)) or 0)),
    }


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_high(value: float, warning_threshold: float, critical_threshold: float) -> float:
    if value <= warning_threshold:
        return 0.0
    return _clamp((value - warning_threshold) / (critical_threshold - warning_threshold), 0.0, 1.0)


def _normalize_low(value: float, warning_threshold: float, critical_threshold: float) -> float:
    if value >= warning_threshold:
        return 0.0
    return _clamp((warning_threshold - value) / (warning_threshold - critical_threshold), 0.0, 1.0)


def _balanced_window(value: float, good_min: float, good_max: float) -> float:
    if good_max == good_min:
        return 1.0
    midpoint = (good_min + good_max) / 2.0
    half_span = (good_max - good_min) / 2.0
    return 1.0 - min(1.0, abs(value - midpoint) / half_span)


def _fallback_prediction(payload: Dict[str, Any]) -> Dict[str, Any]:
    features = _normalize_feature_payload(payload)

    risk_score = (
        _normalize_high(features["Ammonia_ppm"], 10, 50) * 28
        + _normalize_high(features["CO2_ppm"], 800, 2000) * 22
        + _normalize_high(features["H2S_ppm"], 2, 10) * 18
        + _normalize_high(features["Methane_ppm"], 10, 50) * 8
        + _normalize_low(features["Oxygen_percent"], 19, 15) * 14
        + (1.0 - (_balanced_window(features["Temperature_C"], 36.5, 38.5) * 0.6 + _balanced_window(features["Humidity_percent"], 55, 70) * 0.4)) * 10
    )
    risk_score = _clamp(round(risk_score), 0, 100)

    if risk_score < 30:
        label = "Normal condition"
        probabilities = [0.9, 0.08, 0.02]
    elif risk_score < 60:
        label = "Mild stress"
        probabilities = [0.18, 0.66, 0.16]
    else:
        label = "High risk"
        probabilities = [0.05, 0.2, 0.75]

    return {
        "success": True,
        "prediction": [label],
        "probabilities": [probabilities],
        "classes": ["Normal condition", "Mild stress", "High risk"],
        "featureOrder": list(features.keys()),
        "fallback": True,
        "riskScore": risk_score,
    }


def _build_matrix(
    payload: Dict[str, Any], feature_names: Optional[List[str]]
) -> Tuple[Any, Optional[List[str]]]:
    """Returns X (2D list or pandas.DataFrame) and the feature order used (if applicable)."""

    if "rows" in payload and isinstance(payload["rows"], list):
        rows = payload["rows"]
        # rows can be list of dicts or list of lists
        if len(rows) == 0:
            raise ValueError("rows is empty")

        if isinstance(rows[0], dict):
            # use model feature names if available
            if feature_names:
                order = feature_names
            else:
                # stable order based on first row
                order = sorted([str(k) for k in rows[0].keys()])

            parsed_rows: List[Dict[str, Any]] = []
            for r in rows:
                if not isinstance(r, dict):
                    raise ValueError("rows must be all dicts or all lists")
                missing = [k for k in order if k not in r]
                if missing:
                    raise ValueError(f"Missing features in a row: {missing}")
                parsed_rows.append({k: float(r[k]) for k in order})

            # Use a DataFrame so scikit-learn sees valid feature names.
            try:
                import pandas as pd  # type: ignore

                df = pd.DataFrame(parsed_rows, columns=order)
                return df, order
            except Exception:
                X = [[row[k] for k in order] for row in parsed_rows]
                return X, order

        if isinstance(rows[0], list):
            X = [[float(x) for x in r] for r in rows]
            return X, None

        raise ValueError("rows must contain dicts or lists")

    if "features" in payload:
        feats = payload["features"]
        if isinstance(feats, dict):
            if feature_names:
                order = feature_names
            else:
                order = sorted([str(k) for k in feats.keys()])

            missing = [k for k in order if k not in feats]
            if missing:
                raise ValueError(f"Missing features: {missing}")

            row = {k: float(feats[k]) for k in order}

            try:
                import pandas as pd  # type: ignore

                df = pd.DataFrame([row], columns=order)
                return df, order
            except Exception:
                return [[row[k] for k in order]], order

        if isinstance(feats, list):
            return [[float(x) for x in feats]], None

        raise ValueError("features must be an object (dict) or array (list)")

    raise ValueError('Provide either "features" or "rows" in the request JSON')


def predict(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        model = _load_model()
        feature_names = _feature_names_from_model(model)

        X, order = _build_matrix(payload, feature_names)

        # Predict
        y = model.predict(X)

        response: Dict[str, Any] = {
            "success": True,
            "prediction": _to_python(y),
            "modelLoaded": True,
            "fallback": False,
        }

        if order:
            response["featureOrder"] = order

        # Probabilities (if classifier)
        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(X)
                response["probabilities"] = _to_python(proba)
                if hasattr(model, "classes_"):
                    response["classes"] = _to_python(getattr(model, "classes_"))
            except Exception:
                pass

        return response
    except Exception as exc:
        fallback = _fallback_prediction(payload)
        fallback["modelLoaded"] = False
        fallback["modelSource"] = "heuristic-fallback"
        fallback["warning"] = str(exc)
        return fallback


def main() -> None:
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("No JSON input received on stdin")

    payload = json.loads(raw)
    result = predict(payload)
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        err = {"success": False, "message": str(exc)}
        sys.stdout.write(json.dumps(err))
        sys.exit(1)
