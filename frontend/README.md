# Frontend - React + TypeScript

This directory contains the frontend application built with React, TypeScript, and Vite.

## Structure

```
frontend/
├── src/
│   ├── pages/           # Route pages (Dashboard, Login, etc.)
│   ├── components/      # Reusable React components
│   ├── contexts/        # React contexts (Language, Theme)
│   ├── styles/          # CSS stylesheets
│   ├── api.ts          # API client utilities
│   ├── auth.ts         # Authentication logic
│   ├── firebase.ts     # Firebase configuration
│   ├── App.tsx         # Main app component
│   ├── index.tsx       # Entry point
│   └── index.html      # HTML template
├── public/             # Static assets
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
├── package.json        # Dependencies
└── README.md
```

## Getting Started

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build for production: `npm run build`

## Features

- Dark/Light theme switching
- Multi-language support (i18n)
- Real-time updates (Socket.io)
- Role-based access control
- Charts and visualizations (Recharts)
