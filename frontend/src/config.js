// API base URL. Locally VITE_API_URL is the dev proxy (http://localhost:3001, from .env.local);
// in AWS it is the CloudFront domain, which serves both the web app and /api/* (same origin).
export const API_BASE_URL = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api/pm-service`

export const APP_NAME = 'ACME Project Tracker'
