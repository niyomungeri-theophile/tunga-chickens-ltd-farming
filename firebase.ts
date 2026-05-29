// Re-export from API client for backward compatibility
// This file now uses MySQL backend instead of Firebase
import { auth, db } from './api';

export { auth, db };