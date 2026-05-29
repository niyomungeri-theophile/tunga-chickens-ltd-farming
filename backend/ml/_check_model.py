import pickle
from pathlib import Path

candidate_paths = [
    Path(r'backend/ml/chickshelf.pkl'),
    Path(r'backend/ml/ChickShelf.pkl'),
    Path(r'backend/ml/Chickhelf.pkl'),
]

model_path = next((p for p in candidate_paths if p.exists()), candidate_paths[-1])
print('exists:', model_path.exists(), 'path:', model_path)

model = pickle.loads(model_path.read_bytes())
print('model_type:', type(model))

names = getattr(model, 'feature_names_in_', None)
try:
    names_list = list(names) if names is not None else None
except Exception:
    names_list = names
print('feature_names_in_:', names_list)

# Attempt a dummy prediction
try:
    if names_list:
        X = [[0.0 for _ in names_list]]
    else:
        X = [[0.0]]
    pred = model.predict(X)
    print('predict_ok:', pred)
    if hasattr(model, 'predict_proba'):
        try:
            print('proba:', model.predict_proba(X))
        except Exception as e:
            print('predict_proba_error:', e)
except Exception as e:
    print('predict_error:', e)
