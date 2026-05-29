import pickle
import pandas as pd

# Load the model
model = pickle.load(open('backend/ml/Chickhelf.pkl', 'rb'))

# Define features in the same order as training
features = ['Ammonia_ppm', 'CO2_ppm', 'H2S_ppm', 'CO_ppm', 'Oxygen_percent', 
            'Temperature_C', 'Humidity_percent', 'Light_lux', 'Methane_ppm']

# Get importances
importances = model.feature_importances_

# Create DataFrame and sort
df_imp = pd.DataFrame({'Feature': features, 'Importance': importances})
df_imp = df_imp.sort_values('Importance', ascending=False)

print('Feature Importances (ranked by importance):')
print(df_imp.to_string(index=False))

print('\n' + '='*50)
light_importance = df_imp[df_imp['Feature'] == 'Light_lux']['Importance'].values[0]
print(f"Light_lux importance: {light_importance:.4f} ({light_importance*100:.2f}%)")

# Show ranking
rank = df_imp[df_imp['Feature'] == 'Light_lux'].index[0] + 1
print(f"Light_lux ranks #{rank} out of {len(features)} features")
