# Deployment Strategy

We utilize a modern Jamstack pattern capable of zero-downtime scaling via Edge networks (Vercel, Netlify) or strictly via `Google Cloud Run`.

## Production Requirements
- **HTTPS Enforced**: Required for service worker functioning.
- **Environment Context**: Build must inject `.env.production` cleanly.
- **CI/CD Triggers**: GitHub Actions will automatically block merges if `run-tests.js` fails.
