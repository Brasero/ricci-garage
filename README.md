# Ricci Garage

Application web (PWA) de suivi pour un garage : clients, véhicules (plaques FR/LU), recherche globale.
Fonctionne **hors connexion** : tout s'écrit d'abord sur l'appareil, puis se synchronise.
Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Architecture

- `src/` : application React (Vite) + base locale IndexedDB (Dexie) + moteur de synchronisation (`src/sync.ts`).
- `worker/` : API Cloudflare Worker (Hono) + base D1. Le même Worker sert aussi l'application (`dist/`).
- `shared/` : règles communes front/serveur (plaques, téléphone, recherche, fusion « le plus récent gagne »).
- `migrations/` : schéma D1.

## Développement local

```bash
npm install
printf 'APP_PASSWORD=choisis-un-mot-de-passe\nSESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
npm run db:migrate:local
npm run build && npm run preview      # application + API sur http://localhost:8787
npm test                              # tests unitaires
```

`npm run dev` lance Vite seul (rechargement à chaud) ; il redirige `/api` vers `localhost:8787`, donc lancer aussi `npm run preview` dans un autre terminal.

## Déploiement Cloudflare (gratuit)

```bash
npx wrangler login
npx wrangler d1 create ricci-garage          # copier le database_id dans wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put APP_PASSWORD         # le mot de passe de l'application
npx wrangler secret put SESSION_SECRET       # une longue chaîne aléatoire (openssl rand -hex 32)
npm run deploy                               # → https://ricci-garage.<compte>.workers.dev
```

Sur Android : ouvrir l'URL dans Chrome → menu → « Installer l'application ».
**Premier lancement sur un nouvel appareil : prévoir une connexion** (pour charger l'application et récupérer les données).

## Sauvegardes

- Réglages → « Exporter une sauvegarde » (JSON) / « Importer une sauvegarde ».
- D1 « Time Travel » : restauration à n'importe quel instant des 30 derniers jours (`npx wrangler d1 time-travel restore ricci-garage --timestamp=…`).
