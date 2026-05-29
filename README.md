<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Eco-Smart Poultry Care System

A comprehensive IoT-based poultry farm management system with real-time monitoring, AI predictions, and financial tracking.

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express
- **Database:** MySQL
- **Authentication:** JWT (JSON Web Tokens)

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+

### 1. Setup Database

```bash
# Connect to MySQL and run the schema
mysql -u root -p < backend/database/schema.sql
```

### 2. Configure Backend

```bash
cd backend
npm install

# Copy and edit environment file
cp .env.example .env
# Edit .env with your MySQL credentials
```

### 3. Start Backend Server

```bash
cd backend
npm run dev
```

The API will be available at `http://localhost:5000/api`

### 4. Setup Frontend

```bash
# In the root directory
npm install
```

### 5. Run Frontend

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Default Login

- **Email:** niyomungeritheophile02@gmail.com
- **Password:** admin123
- **Role:** Admin

## Features

- 📊 Real-time sensor monitoring (Temperature, Humidity, Gas)
- ⚡ Power consumption tracking (Solar/Grid/Battery)
- 💰 Financial management (Income/Expense tracking)
- 👥 User management with role-based access
- 🔧 Incubator device management
- 🤖 AI-powered predictions

## API Documentation

See [backend/README.md](backend/README.md) for full API documentation.

## AI Predictions (Random Forest)

The backend exposes a prediction endpoint powered by a saved scikit-learn model.

- Endpoint: `POST /api/predictions/predict` (JWT auth required)
- Model file (recommended name): `backend/ml/chickshelf.pkl`
- Python loader: [backend/ml/README.md](backend/ml/README.md)

If predictions fail, start by verifying:

- Python is installed on the machine running the backend (or set `PYTHON_BIN`).
- ML dependencies are installed: `pip install -r backend/ml/requirements.txt`.
- The model file exists and its filename casing matches (important on Linux).
