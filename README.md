# Ricci Garage

Application web (PWA) de suivi pour un garage : clients, véhicules (plaques FR/LU), interventions chiffrées avec photos, agenda et rappels par email, synchronisation Google Agenda, recherche globale.
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

## Agenda et rappels par email

- **Agenda** : « À venir » (échéances en retard, rendez-vous des 14 jours, échéances des 30 jours, échéances au kilométrage, interventions à faire) et calendrier jour / semaine / mois.
- **Rendez-vous** (avertissement de chevauchement, « Créer l'intervention » en un clic), **échéances** par date et/ou kilométrage (contrôle technique, vidange, autre). À la clôture d'une intervention, le prochain rappel est proposé (ex. vidange : +12 mois ou +15 000 km).
- **Réglages** (onglet Réglages) : coordonnées du garage, délais de rappel (par défaut : rendez-vous la veille et 1 h avant ; échéances 30 et 7 jours avant), heure d'envoi, destinataires. Chaque client peut être exclu des rappels (case sur sa fiche).
- **Emails** : un Cron Trigger Cloudflare vérifie toutes les 15 minutes ce qui doit partir et l'envoie avec **Nodemailer** (SMTP). Chaque rappel est journalisé (`reminder_log`) et n'est jamais envoyé deux fois ; un envoi raté est retenté tant que son créneau n'est pas passé. Le client reçoit les rappels de rendez-vous et d'échéance datée ; le père reçoit le récapitulatif quotidien (et, si activé, les rappels de rendez-vous).

### Configurer l'envoi (Gmail)

1. Sur le compte Gmail expéditeur : activer la validation en 2 étapes, puis créer un **mot de passe d'application** (Compte Google → Sécurité → Mots de passe des applications).
2. Enregistrer les secrets dans Cloudflare (le mot de passe est saisi dans le terminal, jamais dans un fichier ni dans GitHub) :

```bash
npx wrangler secret put SMTP_USER        # l'adresse Gmail expéditrice
npx wrangler secret put SMTP_PASSWORD    # le mot de passe d'application (16 caractères)
```

3. Dans l'application : Réglages → « Envoyer un email de test ». Tant que ce test n'a pas réussi, aucun rappel ne part (l'état d'envoi est affiché dans Réglages).

Si le test échoue avec Gmail, c'est la seule partie non vérifiable hors ligne (voir « Limites ») : le message d'erreur s'affiche dans Réglages.

## Google Agenda (application → Google, sens unique)

Les rendez-vous, interventions et échéances datées sont envoyés dans un agenda Google : ton père les voit dans l'application Google Agenda de son téléphone. Un cron (toutes les 15 min, décalé de 5 min par rapport aux rappels) n'envoie que ce qui a changé ; annuler/archiver un élément le retire de Google. **Rien n'est jamais lu depuis Google.**

**Alertes sur le téléphone** : l'application écrit dans l'agenda avec le compte de service, pas avec le compte de ton père ; or, dans Google, un rappel appartient à l'utilisateur qui le configure. Les événements ne portent donc aucun rappel : ton père règle les alertes dans **son** Google Agenda (*Paramètres de l'agenda* → *Notifications des événements* et *Notifications des événements toute la journée*). Les rappels par email de l'application, eux, sont indépendants et réglables dans les Réglages.

Contenu des événements : client, téléphone, véhicule, motif/travaux, notes. **Jamais de prix ni de pièces.** Ces données personnelles sont donc aussi stockées chez Google : à ne faire que si c'est acceptable pour les clients.

Mise en place (une fois) :

1. [console.cloud.google.com](https://console.cloud.google.com) → créer un projet → *API et services* → *Bibliothèque* → activer **Google Calendar API**.
2. *IAM et administration* → *Comptes de service* → créer un compte (aucun rôle nécessaire) → onglet *Clés* → *Ajouter une clé* → **JSON** : un fichier est téléchargé. C'est un secret : ne jamais le commiter ni le partager.
3. Dans Google Agenda (web) : *Paramètres de l'agenda* (idéalement un agenda dédié « Ricci Garage ») → *Partager avec des personnes ou des groupes* → ajouter l'adresse `client_email` du fichier JSON avec la permission **« Apporter des modifications aux événements »**.
4. Même page → *Intégrer l'agenda* → copier l'**ID de l'agenda**.
5. Enregistrer la clé comme secret Cloudflare, puis supprimer le fichier :

```bash
npx wrangler secret put GOOGLE_SA_JSON < chemin/vers/cle-du-compte-de-service.json
```

6. Dans l'application : Réglages → *Identifiant de l'agenda Google* → Enregistrer → *Synchroniser maintenant*. L'état et les erreurs (agenda non partagé, identifiant faux…) s'affichent dans Réglages.

Notes : un événement modifié ou supprimé à la main dans Google n'est réécrit que si l'élément correspondant change dans l'application. Changer l'identifiant d'agenda recrée tout dans le nouvel agenda (les anciens événements restent dans l'ancien). Les éléments de plus de 30 jours ne sont plus touchés. Les comptes Google rattachés à une organisation peuvent interdire la création de clés de compte de service (stratégie `iam.disableServiceAccountKeyCreation`).

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

## Limites connues

- **Envoi Gmail non testé de bout en bout** : Nodemailer a été testé sous `wrangler dev` (runtime Workers) contre un serveur SMTP local sans TLS, avec authentification : l'envoi fonctionne. La connexion TLS vers Gmail (port 465) n'a pas pu être vérifiée hors ligne. Le bouton « Envoyer un email de test » sert à le valider après déploiement. En cas d'échec, solutions de repli : client SMTP minimal sur `cloudflare:sockets`, ou API Gmail en HTTPS.
- Pas de rappel par email pour une échéance **au kilométrage** (le kilométrage n'est connu que quand une intervention le relève) : elle apparaît dans « À venir » et dans le récapitulatif quotidien quand il reste moins de 1 000 km.
- **Google Agenda non testé contre le vrai Google** : testé avec un faux serveur Google local (jeton JWT RS256 vérifié, création / mise à jour / suppression, erreurs 403 et 404). Le bouton « Synchroniser maintenant » et les messages d'erreur des Réglages permettent de valider la configuration réelle.
- Pas de synchronisation dans l'autre sens (Google → application).

## Sauvegardes

- Réglages → « Exporter une sauvegarde » (JSON) / « Importer une sauvegarde » : clients, véhicules, interventions. **Les photos n'y sont pas** : elles sont uniquement dans R2, qui n'a pas d'historique de restauration (une photo supprimée côté serveur est perdue ; dans l'application, « supprimer » ne retire que l'affichage).
- D1 « Time Travel » : restauration à n'importe quel instant des 30 derniers jours (`npx wrangler d1 time-travel restore ricci-garage --timestamp=…`).
