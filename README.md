# Ricci Garage

Application web (PWA) de suivi pour un garage : clients, véhicules (plaques FR/LU), interventions chiffrées avec photos, recherche globale.
Fonctionne **hors connexion** : tout s'écrit d'abord sur l'appareil, puis se synchronise.
Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Architecture

- `src/` : application React (Vite) + base locale IndexedDB (Dexie) + moteur de synchronisation (`src/sync.ts`).
- `worker/` : API Cloudflare Worker (Hono) + base D1 (données) + bucket R2 (photos). Le même Worker sert aussi l'application (`dist/`).
- `shared/` : règles communes front/serveur (plaques, téléphone, recherche, fusion « le plus récent gagne »).
- `migrations/` : schéma D1.

## Sécurité : rien sans le code

- Le Worker reçoit **toutes** les requêtes (`run_worker_first`). Sans session valide, il ne renvoie qu'une page de code (401) : ni l'application, ni les scripts, ni le manifeste, ni l'API, ni les données. Seules les deux icônes sont publiques (le navigateur les demande sans cookie pour installer l'application).
- Le code est le secret Cloudflare `APP_PASSWORD`. Blocage après 5 essais ratés (15 min) ; cookie de session `HttpOnly`, 30 jours.
- L'application fonctionnant hors connexion, elle **se verrouille aussi sur l'appareil** (écran de code à l'ouverture, puis après 15 min d'inactivité ou d'arrière-plan : `LOCK_AFTER_MS` dans `src/lock.ts`). Hors connexion, le code est vérifié localement grâce à une empreinte (PBKDF2, sel) mémorisée à la première connexion.
- « Se déconnecter » (Réglages) efface cette empreinte : l'appareil exige alors une connexion en ligne.
- Limites à connaître : les données de l'appareil restent dans le navigateur (non chiffrées) ; l'écran de code protège l'application, pas un examen technique du téléphone (garder un verrouillage d'écran). L'empreinte locale d'un code court se casse vite : **choisir une phrase de passe d'au moins 12 caractères**. Après un changement d'`APP_PASSWORD`, l'ancien code reste valable hors connexion sur les appareils déjà connectés jusqu'à leur prochaine connexion en ligne (ou « Se déconnecter »).
- Quota : comme tout passe par le Worker, chaque fichier chargé compte dans les 100 000 requêtes/jour du forfait gratuit ; l'application étant mise en cache sur l'appareil, l'usage prévu en est très loin.

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
npx wrangler r2 bucket create ricci-garage-photos   # photos (jalon 2)
npm run db:migrate:remote
npx wrangler secret put APP_PASSWORD         # le mot de passe de l'application
npx wrangler secret put SESSION_SECRET       # une longue chaîne aléatoire (openssl rand -hex 32)
npm run deploy                               # → https://ricci-garage.<compte>.workers.dev
```

Sur Android : ouvrir l'URL dans Chrome → menu → « Installer l'application ».
**Premier lancement sur un nouvel appareil : prévoir une connexion** (pour charger l'application et récupérer les données).

## Déploiement automatique (GitHub Actions)

Le workflow `.github/workflows/ci.yml` :
- sur chaque **pull request** : typage, tests, compilation ;
- à chaque **fusion sur `main`** : mêmes vérifications, puis migrations D1 et déploiement sur Cloudflare.

Configuration à faire **une seule fois** :
1. Faire le déploiement manuel ci-dessus au moins une fois (création de la base D1 et des deux secrets `APP_PASSWORD` / `SESSION_SECRET`, qui restent dans Cloudflare et ne passent jamais par GitHub) et **commiter le vrai `database_id`** dans `wrangler.jsonc` (ce n'est pas un secret).
2. Cloudflare → *My Profile → API Tokens → Create Token* → modèle « Edit Cloudflare Workers », puis ajouter les permissions *Account → D1 → Edit* et *Account → Workers R2 Storage → Edit*. Limiter le jeton à ton compte.
3. GitHub → *Settings → Secrets and variables → Actions* : ajouter `CLOUDFLARE_API_TOKEN` (le jeton) et `CLOUDFLARE_ACCOUNT_ID` (visible dans le tableau de bord Cloudflare). Idéalement dans l'environnement `production` (Settings → Environments), qui peut aussi exiger une approbation avant déploiement.
4. Recommandé : protéger `main` (Settings → Branches) pour imposer la PR et le succès de « Vérifications ».

## Sauvegardes

- Réglages → « Exporter une sauvegarde » (JSON) / « Importer une sauvegarde » : clients, véhicules, interventions. **Les photos n'y sont pas** : elles sont uniquement dans R2, qui n'a pas d'historique de restauration (une photo supprimée côté serveur est perdue ; dans l'application, « supprimer » ne retire que l'affichage).
- D1 « Time Travel » : restauration à n'importe quel instant des 30 derniers jours (`npx wrangler d1 time-travel restore ricci-garage --timestamp=…`).
