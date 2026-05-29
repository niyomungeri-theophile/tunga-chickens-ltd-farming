# ML Prediction (Chick Health)

This folder hosts the Python loader used to run predictions from the saved scikit-learn model (Random Forest).

## 1) Put your model file

Copy your saved model here:

- `backend/ml/chickshelf.pkl`

The loader is tolerant to a few common filename variants (e.g. `Chickhelf.pkl`) for compatibility, but for Linux deployments you should prefer the exact lowercase name above.

Or set an environment variable:

- `ML_MODEL_PATH=C:\\path\\to\\Chickhelf.pkl`
	(You can also point it to `...\\chickshelf.pkl`)

## 2) Install Python deps

From the repo root:

- `pip install -r backend/ml/requirements.txt`

## 3) Run a quick prediction (CLI)

Your saved model expects these feature keys (exact spelling):

- `Ammonia_ppm`
- `CO2_ppm`
- `H2S_ppm`
- `CO_ppm`
- `Oxygen_percent`
- `Temperature_C`
- `Humidity_percent`
- `Light_lux`
- `Methane_ppm`

Example using a feature dictionary (recommended):

- `echo {\"features\": {\"Ammonia_ppm\": 5, \"CO2_ppm\": 600, \"H2S_ppm\": 2, \"CO_ppm\": 1, \"Oxygen_percent\": 20.5, \"Temperature_C\": 26, \"Humidity_percent\": 65, \"Light_lux\": 520, \"Methane_ppm\": 10}} | python backend/ml/predict.py`

Example using an ordered feature array:

- `echo {\"features\": [37.5, 62]} | python backend/ml/predict.py`

## API

The Node backend exposes:

- `POST /api/predictions/predict`

Body:

- `{ "features": { ... } }` for a single row
- `{ "rows": [ { ... }, { ... } ] }` for batch

Response:

- `{ success, prediction, probabilities?, classes?, featureOrder? }`
