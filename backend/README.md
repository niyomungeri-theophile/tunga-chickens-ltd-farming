# Eco-Smart Poultry Backend API

Node.js/Express backend with MySQL database for the Eco-Smart Poultry Care System.

## Prerequisites

- Node.js 18+ 
- MySQL 8.0+

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file and update with your MySQL credentials:

```bash
cp .env.example .env
```

Edit `.env` with your database settings:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=eco_smart_poultry
DB_PORT=3306
JWT_SECRET=your_super_secret_jwt_key_change_this
JWT_EXPIRES_IN=7d
PORT=5000
```

### 3. Create Database

Run the SQL schema to create the database and tables:

```bash
mysql -u root -p < database/schema.sql
```

Or connect to MySQL and run:
```sql
SOURCE database/schema.sql;
```

### 4. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production:
```bash
npm start
```

The API will be available at `http://localhost:5000/api`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/verify` - Verify JWT token

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Sensors
- `GET /api/sensors` - Get all sensor data
- `POST /api/sensors/update` - Update sensor readings (for IoT devices)
- `GET /api/sensors/power/cost` - Get current power cost

### Transactions
- `GET /api/transactions` - Get all transactions
- `POST /api/transactions` - Add new transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction

### Incubators
- `GET /api/incubators` - Get all incubators
- `POST /api/incubators` - Add new incubator
- `PUT /api/incubators/:id` - Update incubator
- `DELETE /api/incubators/:id` - Delete incubator

### Health Check
- `GET /api/health` - API health status

### Device Repair Tool

If `device_registrations` is empty but a farmer already has a `device_serial_number`, use the repair script:

```bash
cd backend
node scripts/repair-device-registration.js
```

Dry-run mode only prints the orphaned farmer serials. To repair a row, provide the ESP32 chip ID:

```bash
node scripts/repair-device-registration.js --apply --serial NT-01-TCL --chip-id YOUR_ESP32_CHIP_ID --user-id YOUR_USER_ID
```

The script creates the matching `device_registrations` and `device_credentials` rows inside one transaction.

### ML Predictions (Random Forest)

- `POST /api/predictions/predict` - Run a prediction using the saved model (JWT auth required)

Requirements:

- A Python 3 environment on the backend machine
- Python packages: `pip install -r backend/ml/requirements.txt`
- Model file: place `backend/ml/chickshelf.pkl` (preferred) or set `ML_MODEL_PATH` to an absolute path

Useful environment variables:

- `PYTHON_BIN` — path/name of the Python executable used by Node (defaults to `python`)
- `ML_MODEL_PATH` — absolute path to the `.pkl` model file
- `ML_DEBUG=1` — logs Python stderr (useful for diagnosing import/model issues)

Common errors and fixes:

- `spawn python ENOENT` → Python not found; install Python or set `PYTHON_BIN`.
- `Model file not found...` → ensure the model exists in `backend/ml/` and filename casing matches (Linux is case-sensitive).
- `ModuleNotFoundError: No module named 'sklearn'` → install ML deps with `pip install -r backend/ml/requirements.txt`.
- `Invalid prediction output...` → the Python script printed non-JSON to stdout; enable `ML_DEBUG=1` and remove extra prints.

## Default Admin User

The schema includes a default admin user:
- **Email:** niyomungeritheophile02@gmail.com
- **Password:** admin123
- **Role:** admin
