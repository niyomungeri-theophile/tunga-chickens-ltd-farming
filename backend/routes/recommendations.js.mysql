const express = require('express');
const { authMiddleware } = require('./auth');

const router = express.Router();

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return Math.min(max, Math.max(min, i));
}

function normalizeChickType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'broiler';
  if (['broiler', 'broilers'].includes(raw)) return 'broiler';
  if (['layer', 'layers', 'egg'].includes(raw)) return 'layer';
  if (['dual', 'dual-purpose', 'dualpurpose'].includes(raw)) return 'dual-purpose';
  if (['local', 'indigenous', 'kienyeji', 'native'].includes(raw)) return 'local';
  return raw;
}

function stageFromAgeMonths(type, ageMonths) {
  // The UI uses months; poultry nutrition is usually in weeks.
  // We keep month-buckets for simplicity and explainability.
  const m = ageMonths;

  if (type === 'broiler') {
    if (m < 1) return 'Starter (0–4 weeks)';
    if (m < 2) return 'Grower (4–8 weeks)';
    return 'Finisher (8+ weeks)';
  }

  if (type === 'layer') {
    if (m < 2) return 'Chick Starter (0–8 weeks)';
    if (m < 4) return 'Grower/Developer (8–16 weeks)';
    if (m < 5) return 'Pre-Lay (16–20 weeks)';
    return 'Layer (20+ weeks)';
  }

  if (type === 'dual-purpose') {
    if (m < 2) return 'Starter (0–8 weeks)';
    if (m < 5) return 'Grower (8–20 weeks)';
    return 'Adult (20+ weeks)';
  }

  // local/indigenous or unknown
  if (m < 2) return 'Starter (0–8 weeks)';
  if (m < 5) return 'Grower (8–20 weeks)';
  return 'Adult (20+ weeks)';
}

function recommendationFor(type, stage, ageMonths) {
  // Values are typical target ranges used in small/medium poultry operations.
  // Output is advisory; actual needs vary by breed, climate, and feed formulation.

  const baseNutrients = [
    { name: 'Protein', unit: '%', target: '' },
    { name: 'Energy (ME)', unit: 'kcal/kg', target: '' },
    { name: 'Calcium', unit: '%', target: '' },
    { name: 'Available Phosphorus', unit: '%', target: '' },
    { name: 'Salt (NaCl)', unit: '%', target: '0.25–0.35' },
    { name: 'Vitamins/Minerals premix', unit: '', target: 'As per supplier label' },
  ];

  const result = {
    chickType: type,
    ageMonths,
    stage,
    specificType: null,
    feed: {
      name: '',
      dailyIntakeGPerBird: '',
      dailyIntakeGPerBirdMin: null,
      dailyIntakeGPerBirdMax: null,
      notes: [],
    },
    water: {
      litersPerBirdPerDay: '',
      litersPerBirdPerDayMin: null,
      litersPerBirdPerDayMax: null,
      notes: [],
    },
    nutrients: baseNutrients,
    assumptions: [
      'Water need increases with heat, activity, and high-protein feed.',
      'For best accuracy, measure actual daily intake and adjust gradually.',
    ],
    totals: {
      flockSize: 1,
      feedKgPerDay: '',
      feedKgPerDayMin: null,
      feedKgPerDayMax: null,
      waterLitersPerDay: '',
      waterLitersPerDayMin: null,
      waterLitersPerDayMax: null,
    },
  };

  const pushNutrient = (name, target) => {
    const item = result.nutrients.find((n) => n.name === name);
    if (item) item.target = target;
  };

  const setFeed = (name, protein, energy, calcium, phosphorus) => {
    result.feed.name = name;
    pushNutrient('Protein', protein);
    pushNutrient('Energy (ME)', energy);
    pushNutrient('Calcium', calcium);
    pushNutrient('Available Phosphorus', phosphorus);
  };

  const approxWater = (minL, maxL) => {
    result.water.litersPerBirdPerDay = `${minL.toFixed(2)}–${maxL.toFixed(2)}`;
    result.water.litersPerBirdPerDayMin = Number(minL.toFixed(3));
    result.water.litersPerBirdPerDayMax = Number(maxL.toFixed(3));
  };

  const approxFeed = (minG, maxG) => {
    result.feed.dailyIntakeGPerBird = `${minG.toFixed(0)}–${maxG.toFixed(0)}`;
    result.feed.dailyIntakeGPerBirdMin = Number(minG.toFixed(0));
    result.feed.dailyIntakeGPerBirdMax = Number(maxG.toFixed(0));
  };

  // Default hygiene notes
  result.water.notes.push('Provide clean water 24/7; wash drinkers daily.');
  result.water.notes.push('In hot weather, expect +20–50% water intake.');

  // Default feeding notes
  result.feed.notes.push('Split feed into 2–4 meals/day (or free-choice for small flocks).');
  result.feed.notes.push('Avoid sudden feed changes; transition over 3–5 days.');

  if (type === 'broiler') {
    if (stage.startsWith('Starter')) {
      setFeed('Broiler Starter', '20–22', '2950–3050', '0.9–1.1', '0.45–0.55');
      approxFeed(20, 45);
      approxWater(0.05, 0.15);
    } else if (stage.startsWith('Grower')) {
      setFeed('Broiler Grower', '18–20', '3050–3150', '0.85–1.0', '0.40–0.50');
      approxFeed(60, 110);
      approxWater(0.15, 0.25);
    } else {
      setFeed('Broiler Finisher', '16–18', '3150–3250', '0.8–0.95', '0.35–0.45');
      approxFeed(120, 180);
      approxWater(0.25, 0.35);
    }

    result.feed.notes.push('Keep litter dry; wet litter often means drinker leaks or too much water flow.');
  } else if (type === 'layer') {
    if (stage.startsWith('Chick Starter')) {
      setFeed('Layer Chick Starter', '18–20', '2800–2950', '0.9–1.1', '0.45–0.55');
      approxFeed(15, 45);
      approxWater(0.05, 0.15);
    } else if (stage.startsWith('Grower')) {
      setFeed('Layer Grower/Developer', '15–17', '2700–2850', '0.85–1.0', '0.40–0.50');
      approxFeed(55, 85);
      approxWater(0.15, 0.25);
    } else if (stage.startsWith('Pre-Lay')) {
      setFeed('Pre-Lay (Developer + Calcium)', '16–17', '2750–2900', '2.0–2.5', '0.40–0.50');
      approxFeed(80, 95);
      approxWater(0.20, 0.30);
      result.feed.notes.push('Do not keep birds long on pre-lay; switch to layer feed at point-of-lay.');
    } else {
      setFeed('Layer Ration', '16–18', '2700–2850', '3.5–4.2', '0.35–0.45');
      approxFeed(95, 120);
      approxWater(0.25, 0.35);
      result.feed.notes.push('Provide grit/oyster shell if recommended by your feed supplier.');
    }

    result.feed.notes.push('Calcium needs rise sharply once laying starts.');
  } else if (type === 'dual-purpose') {
    if (stage.startsWith('Starter')) {
      setFeed('Dual-Purpose Starter', '18–20', '2800–3000', '0.9–1.1', '0.45–0.55');
      approxFeed(15, 45);
      approxWater(0.05, 0.15);
    } else if (stage.startsWith('Grower')) {
      setFeed('Dual-Purpose Grower', '16–18', '2750–2950', '0.85–1.0', '0.40–0.50');
      approxFeed(60, 100);
      approxWater(0.15, 0.28);
    } else {
      setFeed('Dual-Purpose Adult', '15–17', '2700–2900', '1.0–3.8', '0.35–0.45');
      approxFeed(90, 120);
      approxWater(0.22, 0.35);
      result.feed.notes.push('If hens are actively laying, use a layer ration (higher calcium).');
    }
  } else {
    // local/indigenous or unknown
    const isLocal = type === 'local';
    const label = isLocal ? 'Local/Indigenous' : 'General';

    if (stage.startsWith('Starter')) {
      setFeed(`${label} Starter`, '18–20', '2750–2950', '0.9–1.1', '0.45–0.55');
      approxFeed(15, 40);
      approxWater(0.05, 0.14);
    } else if (stage.startsWith('Grower')) {
      setFeed(`${label} Grower`, '16–18', '2700–2900', '0.85–1.0', '0.40–0.50');
      approxFeed(55, 95);
      approxWater(0.14, 0.25);
    } else {
      setFeed(`${label} Adult`, '15–17', '2650–2850', '1.0–3.8', '0.35–0.45');
      approxFeed(80, 115);
      approxWater(0.20, 0.33);
      result.feed.notes.push('If hens are laying eggs, switch to a layer ration (higher calcium).');
    }

    if (isLocal) {
      result.feed.notes.push('Local birds may forage; reduce concentrate feed only if body condition is good.');
    }
  }

  // Extra note when age is very young
  if (ageMonths < 0.5) {
    result.water.notes.push('For chicks 0–2 weeks: keep water lukewarm and easy to reach.');
    result.feed.notes.push('Provide starter crumble; ensure feeders are shallow for first days.');
  }

  // Fallback if for any reason min/max are missing.
  if (!Number.isFinite(result.feed.dailyIntakeGPerBirdMin) || !Number.isFinite(result.feed.dailyIntakeGPerBirdMax)) {
    result.feed.dailyIntakeGPerBirdMin = null;
    result.feed.dailyIntakeGPerBirdMax = null;
  }
  if (!Number.isFinite(result.water.litersPerBirdPerDayMin) || !Number.isFinite(result.water.litersPerBirdPerDayMax)) {
    result.water.litersPerBirdPerDayMin = null;
    result.water.litersPerBirdPerDayMax = null;
  }

  return result;
}

// POST /api/recommendations/feed-water
router.post('/feed-water', authMiddleware, (req, res) => {
  try {
    const chickType = normalizeChickType(req.body?.chickType);
    const ageMonths = clampNumber(req.body?.ageMonths, 0, 36, 1);
    const flockSize = clampInt(req.body?.flockSize, 1, 1000000, 1);
    const specificType = String(req.body?.specificType || '').trim() || null;

    const supported = ['broiler', 'layer', 'dual-purpose', 'local'];
    if (!supported.includes(chickType)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported chickType. Use one of: ${supported.join(', ')}`,
      });
    }

    const stage = stageFromAgeMonths(chickType, ageMonths);
    const recommendation = recommendationFor(chickType, stage, ageMonths);

    recommendation.specificType = specificType;
    recommendation.totals.flockSize = flockSize;

    // Compute totals per day for the whole flock.
    if (Number.isFinite(recommendation.feed.dailyIntakeGPerBirdMin) && Number.isFinite(recommendation.feed.dailyIntakeGPerBirdMax)) {
      const minKg = (Number(recommendation.feed.dailyIntakeGPerBirdMin) * flockSize) / 1000;
      const maxKg = (Number(recommendation.feed.dailyIntakeGPerBirdMax) * flockSize) / 1000;
      recommendation.totals.feedKgPerDayMin = Number(minKg.toFixed(3));
      recommendation.totals.feedKgPerDayMax = Number(maxKg.toFixed(3));
      recommendation.totals.feedKgPerDay = `${minKg.toFixed(2)}–${maxKg.toFixed(2)}`;
    }

    if (Number.isFinite(recommendation.water.litersPerBirdPerDayMin) && Number.isFinite(recommendation.water.litersPerBirdPerDayMax)) {
      const minL = Number(recommendation.water.litersPerBirdPerDayMin) * flockSize;
      const maxL = Number(recommendation.water.litersPerBirdPerDayMax) * flockSize;
      recommendation.totals.waterLitersPerDayMin = Number(minL.toFixed(3));
      recommendation.totals.waterLitersPerDayMax = Number(maxL.toFixed(3));
      recommendation.totals.waterLitersPerDay = `${minL.toFixed(2)}–${maxL.toFixed(2)}`;
    }

    return res.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    console.error('Feed/water recommendation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate recommendation' });
  }
});

module.exports = router;
