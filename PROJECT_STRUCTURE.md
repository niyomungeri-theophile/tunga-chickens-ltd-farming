# Project Structure Overview

## New Organized Structure

```
tunga-chickens-ltd-farming/
├── frontend/                      # React + TypeScript frontend
│   ├── src/
│   │   ├── pages/                # Route pages
│   │   ├── components/           # Reusable components
│   │   ├── contexts/             # React contexts
│   │   ├── styles/               # CSS files
│   │   ├── api.ts                # API utilities
│   │   ├── auth.ts               # Auth logic
│   │   ├── firebase.ts           # Firebase config
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── public/                   # Static assets
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── index.html
│   └── README.md
│
├── backend/                       # Node.js + Express API
│   ├── src/
│   │   ├── routes/               # API route definitions
│   │   ├── controllers/          # Business logic
│   │   ├── models/               # Database queries
│   │   ├── middleware/           # Auth, error handling
│   │   ├── utils/                # Helper functions
│   │   ├── config/               # DB configuration
│   │   ├── server.js
│   │   └── index.js
│   ├── database/
│   │   └── schema.sql
│   ├── ml/
│   │   ├── predict.py
│   │   ├── chickshelf.pkl        # ML model
│   │   └── requirements.txt
│   ├── scripts/                  # Utility scripts
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── data/                         # Large datasets & notebooks
│   ├── smart_poultry_dataset.csv
│   ├── notebooks/
│   │   └── Random forest.ipynb
│   └── README.md
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md
│   ├── DEVICE_BLOCKING_IMPLEMENTATION.md
│   └── README.md
│
├── .gitignore
├── .env.example
├── README.md
├── package.json                  # Root package (for npm run dev:all)
└── PROJECT_STRUCTURE.md          # This file
```

## Key Points

### Frontend (`/frontend`)
- React 18 with TypeScript
- Vite for fast development
- Component-based architecture
- Context API for state management
- TailwindCSS for styling

### Backend (`/backend`)
- Express.js REST API
- MySQL database
- JWT authentication
- Role-based access control
- ML prediction endpoints
- Socket.io for real-time updates

### Data (`/data`)
- Training datasets (.csv files)
- Jupyter notebooks for analysis
- Should be added to .gitignore for large files

### Docs (`/docs`)
- API documentation
- Architecture diagrams
- Setup guides
- Feature documentation

## File Organization Benefits

✅ **Clear Separation of Concerns** - Frontend, backend, and data clearly separated
✅ **Scalability** - Easy to add new features without cluttering root
✅ **Maintainability** - Each part has its own dependencies and configuration
✅ **Collaboration** - Team members can work on frontend/backend independently
✅ **CI/CD** - Easier to set up separate pipelines for frontend/backend
✅ **Documentation** - Each module has its own README

## Getting Started

```bash
# Install dependencies for both
npm install

# Start both frontend and backend
npm run dev:all

# Or run separately
cd frontend && npm run dev    # Port 5173
cd backend && npm run dev     # Port 5000
```

## Next Steps

1. **Move Files**: Transfer existing files from root to appropriate directories
2. **Update Imports**: Update import paths in all files
3. **Test**: Verify both frontend and backend work after reorganization
4. **Create PR**: Submit pull request for review

## Language Composition

After reorganization:
- **Frontend**: TypeScript (12.7%), JavaScript (5.2%), CSS (0.2%), HTML (0.7%)
- **Backend**: TypeScript, JavaScript
- **ML**: Python (0.2%)
- **Data**: Jupyter Notebook (79%)
