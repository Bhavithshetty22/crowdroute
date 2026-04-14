# Developer Security Checklist

- [x] Strict CSP (`Content-Security-Policy`) enforced in `serve.json`.
- [x] No plaintext API keys logged or committed.
- [x] LocalStorage payload type validation checks out.
- [x] `X-Frame-Options` blocks clickjacking vectors.
- [x] `Permissions-Policy` scopes hardware limits.
