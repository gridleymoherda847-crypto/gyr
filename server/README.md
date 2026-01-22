## LittlePhone API Proxy

This folder runs a tiny proxy so the frontend never contains your API key.

### Setup (one-time)

Create a file: `server/.env.local` with:

- `MIBI_API_BASE_URL` = your base url (without trailing slash, `/v1` optional)
- `MIBI_API_KEY` = your key
- `PORT` = `8787` (optional)

Then run `start.bat` from the project root.

