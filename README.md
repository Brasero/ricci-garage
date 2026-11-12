# Mitch depann

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

## Fiche véhicule en PDF (à remettre au client)

Sur la fiche d'un véhicule : bouton **Fiche PDF** (et **Partager la fiche** sur les téléphones qui le permettent). Le PDF est généré **sur l'appareil**, y compris hors connexion, et nommé `Fiche-<plaque>-<date>.pdf`.

- **Contenu** : coordonnées du garage (Réglages), véhicule, propriétaire, puis l'historique des interventions **terminées**, de la plus récente à la plus ancienne : date, kilométrage, travaux, durée, pièces avec **prix de vente** (unitaire et total), **main d'œuvre**, total de chaque intervention et total général.
- **Jamais dans le PDF** : prix d'achat, marge, notes internes, photos. Le modèle du document (`shared/fiche.ts`) n'a aucun champ pour les porter, et des tests le vérifient.
- **Mention** : « Document récapitulatif des interventions réalisées sur ce véhicule. Il ne tient pas lieu de facture. » (l'application ne gère ni TVA ni numérotation de factures).
- Les interventions « à faire » ou « en cours » et les interventions archivées n'y figurent pas.
- Les caractères hors latin-1 (emoji, alphabets non latins) sont remplacés par « ? » : les polices PDF standard utilisées ne les connaissent pas.

## Agenda et rappels par email

- **Agenda** : « À venir » (échéances en retard, rendez-vous des 14 jours, échéances des 30 jours, échéances au kilométrage, interventions à faire) et calendrier jour / semaine / mois.
- **Rendez-vous** (avertissement de chevauchement, « Créer l'intervention » en un clic), **échéances** par date et/ou kilométrage (contrôle technique, vidange, autre). À la clôture d'une intervention, le prochain rappel est proposé (ex. vidange : +12 mois ou +15 000 km).
- **Réglages** (onglet Réglages) : coordonnées du garage, délais de rappel (par défaut : rendez-vous la veille et 1 h avant ; échéances 30 et 7 jours avant), heure d'envoi, destinataires. Chaque client peut être exclu des rappels (case sur sa fiche).
- **Emails** : un Cron Trigger Cloudflare vérifie toutes les 15 minutes ce qui doit partir et l'envoie avec **Nodemailer** (SMTP). Chaque rappel est journalisé (`reminder_log`) et n'est jamais envoyé deux fois ; un envoi raté est retenté tant que son créneau n'est pas passé. Le client reçoit les rappels de rendez-vous et d'échéance datée ; le père reçoit le récapitulatif quotidien (et, si activé, les rappels de rendez-vous).

> **Mise en place** : voir le guide pas à pas [« Configurer Gmail et Google Agenda »](#configurer-gmail-et-google-agenda-pas-à-pas) plus bas. Tant que les secrets d'envoi ne sont pas enregistrés, aucun email ne part (l'état est visible dans Réglages) ; le reste de l'application fonctionne normalement.

## Google Agenda (application → Google, sens unique)

Les rendez-vous, interventions et échéances datées sont envoyés dans un agenda Google : ton père les voit dans l'application Google Agenda de son téléphone. Un cron (toutes les 15 min, décalé de 5 min par rapport aux rappels) n'envoie que ce qui a changé ; annuler/archiver un élément le retire de Google. **Rien n'est jamais lu depuis Google.**

**Alertes sur le téléphone** : l'application écrit dans l'agenda avec le compte de service, pas avec le compte de ton père ; or, dans Google, un rappel appartient à l'utilisateur qui le configure. Les événements ne portent donc aucun rappel : ton père règle les alertes dans **son** Google Agenda (*Paramètres de l'agenda* → *Notifications des événements* et *Notifications des événements toute la journée*). Les rappels par email de l'application, eux, sont indépendants et réglables dans les Réglages.

Contenu des événements : client, téléphone, véhicule, motif/travaux, notes. **Jamais de prix ni de pièces.** Ces données personnelles sont donc aussi stockées chez Google : à ne faire que si c'est acceptable pour les clients.

Mise en place : voir le guide pas à pas [« Configurer Gmail et Google Agenda »](#configurer-gmail-et-google-agenda-pas-à-pas).

Notes : un événement modifié ou supprimé à la main dans Google n'est réécrit que si l'élément correspondant change dans l'application. Changer l'identifiant d'agenda recrée tout dans le nouvel agenda (les anciens événements restent dans l'ancien). Les éléments de plus de 30 jours ne sont plus touchés. Les comptes Google rattachés à une organisation peuvent interdire la création de clés de compte de service (stratégie `iam.disableServiceAccountKeyCreation`).

## Configurer Gmail et Google Agenda pas à pas

Ce guide part de zéro et ne suppose aucune connaissance de Google Cloud. Les deux configurations sont **indépendantes** : on peut faire l'une sans l'autre. Durée : environ 15 minutes pour Gmail, 30 minutes pour Google Agenda.

> Les libellés exacts des écrans Google changent de temps en temps (noms de menus, emplacement des boutons). En cas de doute, cherche le mot-clé en gras dans la page.

### 0. Avant de commencer

| Il faut | Pourquoi |
|---|---|
| L'application **déployée** une première fois sur Cloudflare (section « Déploiement Cloudflare ») | Les secrets s'enregistrent sur le Worker `ricci-garage`, qui doit exister |
| Node.js et le dossier du projet sur ton ordinateur, avec `npm install` fait | Les commandes `npx wrangler …` se lancent depuis le dossier du projet |
| `npx wrangler login` déjà fait (même compte Cloudflare que le déploiement) | Wrangler doit être connecté pour enregistrer des secrets |
| Accès au compte Gmail expéditeur (par défaut `riccimichel3@gmail.com`) et à l'application sur un navigateur, connecté avec le code d'accès | Pour créer le mot de passe d'application et tester |

**Règles de sécurité valables partout dans ce guide**
- Un *secret* (mot de passe d'application, clé JSON) ne se colle **jamais** dans un fichier du projet, un message, un ticket, un email ni un chat. Il se saisit uniquement dans le terminal, avec `wrangler secret put`.
- Les secrets Cloudflare **survivent aux déploiements** (manuels ou automatiques) : on ne les enregistre qu'une fois.
- Pour vérifier la liste des secrets d'un Worker : `npx wrangler secret list` (affiche les noms, jamais les valeurs).

---

### A. Gmail : l'envoi des rappels par email

#### A1. Comprendre ce qui est configuré

- **Expéditeur** : le compte Gmail dont tu donnes l'adresse (`SMTP_USER`). Tous les emails (rappels aux clients, récapitulatif, test) partent de cette adresse, avec comme nom d'affichage le *Nom du garage* saisi dans les Réglages.
- **Réponses des clients** : elles arrivent à l'*Email de contact* des Réglages (sinon, à l'adresse expéditrice).
- **Destinataire du récapitulatif quotidien** : *Adresse de réception* des Réglages (par défaut `riccimichel3@gmail.com`, modifiable).
- **Limite** : Gmail plafonne à environ 500 destinataires par jour pour un compte personnel, très au-dessus de l'usage prévu.
- Le mot de passe du compte Gmail **n'est pas utilisé**. On crée un *mot de passe d'application* : un code à 16 caractères, valable uniquement pour l'envoi, que l'on peut révoquer à tout moment sans toucher au vrai mot de passe.

#### A2. Activer la validation en deux étapes (si ce n'est pas déjà fait)

1. Ouvre <https://myaccount.google.com/security> avec le compte expéditeur.
2. Section **« Comment vous vous connectez à Google »** → **Validation en deux étapes** → *Activer* et suis les instructions (numéro de téléphone, etc.).

Sans la validation en deux étapes, Google ne propose pas les mots de passe d'application. Sur un compte **Google Workspace** (adresse professionnelle), l'administrateur peut aussi avoir désactivé cette fonction : il faut alors la lui demander, ou utiliser un compte Gmail personnel.

#### A3. Créer le mot de passe d'application

1. Ouvre <https://myaccount.google.com/apppasswords>. (Si la page répond « non disponible », la validation en deux étapes n'est pas active : retour à l'étape A2. Tu peux aussi chercher « Mots de passe des applications » dans la barre de recherche de ton compte Google.)
2. Saisis un nom reconnaissable, par exemple **Mitch depann**, puis **Créer**.
3. Google affiche un code de **16 lettres**, parfois présenté en 4 groupes de 4 (`abcd efgh ijkl mnop`). **Il n'est affiché qu'une seule fois.** Garde la fenêtre ouverte jusqu'à l'étape A4. Tu le saisiras **sans les espaces**.
4. Si tu perds le code : supprime ce mot de passe d'application dans la même page et crée-en un nouveau.

#### A4. Enregistrer les deux secrets dans Cloudflare

Dans un terminal, depuis le dossier du projet :

```bash
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASSWORD
```

- À l'invite de `SMTP_USER` : tape l'adresse Gmail complète (ex. `riccimichel3@gmail.com`) puis Entrée.
- À l'invite de `SMTP_PASSWORD` : colle le code de 16 lettres **sans espaces ni guillemets** puis Entrée. Rien ne s'affiche pendant la saisie, c'est normal.
- Wrangler répond `Success! Uploaded secret …`. Les secrets sont pris en compte immédiatement, sans redéployer.

#### A5. Renseigner les Réglages de l'application

Ouvre l'application → onglet **Réglages** → section **Garage et rappels** :

| Champ | À mettre |
|---|---|
| Nom (obligatoire) | Le nom du garage, affiché comme expéditeur et en pied de mail |
| Adresse, Téléphone | Affichés en pied de chaque email |
| Email de contact | Adresse qui reçoit les réponses des clients (peut être la même que l'expéditeur) |
| Mention en bas des emails | Texte libre facultatif (horaires, mentions légales…) |
| Adresse de réception | Qui reçoit le récapitulatif quotidien (et les rappels de rendez-vous si la case est cochée) |
| Heure d'envoi | Heure (heure du Luxembourg) du récapitulatif et des rappels d'échéance. Par défaut 08 h |
| Cases à cocher | Rappels aux clients ; rappels de rendez-vous aussi pour toi ; récapitulatif quotidien |
| Délais de rendez-vous | Heures avant le rendez-vous, séparées par des virgules. Par défaut `24, 1` (la veille et 1 h avant) |
| Délais d'échéance | Jours avant l'échéance. Par défaut `30, 7` ; `0` = le jour même |

Clique sur **Enregistrer les réglages**. Ils sont ensuite partagés avec tous les appareils après synchronisation.

#### A6. Tester l'envoi

1. Toujours dans Réglages, descends jusqu'à **Envoi des emails**. Tu dois lire **« ✓ Serveur d'envoi configuré »**. Sinon, les secrets A4 sont absents (voir le dépannage).
2. Clique sur **✉️ Envoyer un email de test**.
3. Message attendu : *« ✓ Email de test envoyé »*. Vérifie la boîte de l'*Adresse de réception*, **y compris le dossier Indésirables**. Si l'email est dans les indésirables, marque-le « Pas du spam » (une seule fois suffit).

> C'est la seule étape qui n'a pas pu être vérifiée avec le vrai Gmail pendant le développement (la connexion chiffrée vers `smtp.gmail.com:465` n'y est pas testable). Si elle échoue, le message d'erreur exact s'affiche à cet endroit : il suffit de le comparer au tableau de dépannage ci-dessous.

#### A7. Activer les rappels aux clients

Les rappels ne partent que pour les clients dont l'**email est renseigné**. Sur la fiche d'un client : saisir l'email → la case **« Envoyer des rappels par email à ce client »** apparaît (cochée par défaut) → décocher pour exclure ce client.

Vérification de bout en bout, sans attendre : crée un rendez-vous dans **environ 1 h 30** pour un client dont tu connais l'email. Au prochain passage (toutes les 15 minutes) après l'heure « 1 h avant », le client et l'adresse de réception reçoivent le rappel. Dans Réglages → **Envoi des emails**, la ligne *Dernière vérification* indique le nombre d'emails envoyés et les derniers messages partis sont listés.

#### A8. Dépannage Gmail

Le message s'affiche dans Réglages → *Envoi des emails* (ligne *Dernière vérification* ou résultat du test).

| Message ou symptôme | Cause probable | Solution |
|---|---|---|
| « Envoi non configuré sur le serveur » / secrets manquants | `SMTP_USER` ou `SMTP_PASSWORD` absents | Refaire A4, puis `npx wrangler secret list` doit afficher les deux noms |
| `535 … Username and Password not accepted` | Mauvais mot de passe d'application, adresse inexacte, espaces dans le code | Recréer un mot de passe d'application (A3) et refaire `npx wrangler secret put SMTP_PASSWORD` |
| `534 … Application-specific password required` | On a saisi le vrai mot de passe du compte | Utiliser un mot de passe d'application (A3) |
| Mot de passe d'application introuvable | Validation en deux étapes inactive ou bloquée par l'administrateur Workspace | A2, ou compte Gmail personnel |
| `Connection timeout`, `ECONNREFUSED`, erreur TLS | La connexion chiffrée vers Gmail ne passe pas depuis le runtime Cloudflare | Noter le message exact et demander une correction : il existe deux solutions de repli (petit client SMTP sur `cloudflare:sockets`, ou API Gmail en HTTPS) |
| `Daily user sending limit exceeded` | Plus de 500 envois/jour | Attendre 24 h ; vérifier qu'aucun client n'est en boucle d'erreur |
| Test OK mais aucun rappel automatique | Cron inactif, heure d'envoi non atteinte, client sans email ou exclu, fenêtre dépassée | Cloudflare → *Workers & Pages* → `ricci-garage` → *Paramètres* → *Déclencheurs* : deux crons (`*/15 * * * *` et `5,20,35,50 * * * *`) doivent apparaître ; sinon, redéployer (`npm run deploy`) |
| Emails dans les indésirables | Expéditeur Gmail inconnu du destinataire | « Pas du spam » une fois ; demander au client d'ajouter l'adresse à ses contacts |

**Révoquer ou changer l'envoi** : <https://myaccount.google.com/apppasswords> → supprimer « Mitch depann » (l'envoi s'arrête aussitôt). Pour reprendre : A3 puis `npx wrangler secret put SMTP_PASSWORD`.

---

### B. Google Agenda : voir les rendez-vous dans le téléphone de ton père

#### B1. Comprendre le principe (et ses limites)

- L'application **envoie** ses rendez-vous, interventions et échéances datées dans un agenda Google dédié. Elle **ne lit jamais** Google.
- Elle s'y connecte avec un **compte de service** : un « robot » Google, qui n'appartient à aucune personne. Tu lui donnes le droit d'écrire dans *un seul agenda*, rien d'autre. Pas d'écran de consentement ni de mot de passe à renouveler.
- Contenu envoyé : nom du client, téléphone, véhicule, motif / travaux, notes. **Jamais de prix ni de pièces.** Ces données personnelles sont donc aussi stockées chez Google : à décider en connaissance de cause pour les clients.
- **Les alertes sur le téléphone ne viennent pas de l'application** : dans Google, un rappel appartient à celui qui le configure. Elles se règlent dans le Google Agenda de ton père (étape B10).
- Un cron envoie les changements toutes les 15 minutes (plus 5 minutes de décalage). Le bouton **Synchroniser Google Agenda** des Réglages le fait tout de suite.

#### B2. Créer un projet Google Cloud (gratuit, sans carte bancaire)

1. Ouvre <https://console.cloud.google.com> avec un compte Google (le tien ou celui de ton père : le projet ne sert qu'à héberger le « robot »).
2. Accepte les conditions si on te les demande.
3. En haut de la page, clique sur le **sélecteur de projet** → **Nouveau projet**.
4. Nom du projet : **ricci-garage** → **Créer**. Attends la notification « Projet créé », puis vérifie que **ricci-garage** est bien le projet sélectionné en haut.

> Aucune facturation n'est demandée : l'API Google Agenda est gratuite pour cet usage.

#### B3. Activer l'API Google Agenda

1. Menu ☰ → **API et services** → **Bibliothèque**.
2. Cherche **Google Calendar API** (« API Google Agenda ») → ouvre-la → **Activer**.

Sans cette étape, la synchronisation échoue avec « Droits insuffisants ».

#### B4. Créer le compte de service

1. Menu ☰ → **IAM et administration** → **Comptes de service** → **Créer un compte de service**.
2. Nom : **ricci-garage-sync** (l'identifiant se remplit tout seul) → **Créer et continuer**.
3. « Accorder à ce compte l'accès au projet » : **ne choisis aucun rôle** → **Continuer**. Étape suivante : **OK** (ou *Terminé*).
4. Dans la liste, repère l'**adresse email du compte de service**, de la forme `ricci-garage-sync@ricci-garage-XXXXXX.iam.gserviceaccount.com`. **Copie-la** : c'est elle qui sera ajoutée à l'agenda (B6). Elle est aussi affichée dans l'application une fois le secret enregistré (B8).

#### B5. Télécharger la clé du compte de service

1. Clique sur le compte **ricci-garage-sync** → onglet **Clés** → **Ajouter une clé** → **Créer une clé**.
2. Type **JSON** → **Créer**. Un fichier `ricci-garage-XXXXXX-….json` se télécharge.

⚠️ **Ce fichier est un secret** (il donne le droit d'écrire dans l'agenda). Ne le mets jamais dans le dossier du projet (ou dans un dossier synchronisé), ne l'envoie à personne, ne le colle nulle part. Tu le supprimeras après l'étape B8.

Si le bouton *Créer une clé* est grisé ou affiche une erreur « stratégie d'organisation » (`iam.disableServiceAccountKeyCreation`), le projet est rattaché à une **organisation** qui interdit les clés : crée le projet avec un **compte Gmail personnel** (sans organisation).

#### B6. Créer l'agenda dédié et le partager avec le compte de service

Fais cette étape **dans le compte Google de ton père** (celui du téléphone), pour que l'agenda apparaisse chez lui.

1. Ouvre <https://calendar.google.com> (ordinateur).
2. Colonne de gauche, à côté de **Autres agendas** → **+** → **Créer un agenda**.
3. Nom : **Mitch depann** ; fuseau horaire : **(GMT+01:00) heure d'Europe centrale – Luxembourg** → **Créer l'agenda**.
   *Pourquoi un agenda dédié ?* L'application crée, modifie et supprime ses propres événements : mieux vaut qu'elle ne soit pas mélangée à l'agenda personnel.
4. Dans la colonne de gauche, survole **Mitch depann** → **⋮** → **Paramètres et partage**.
5. Section **Partager avec des personnes ou des groupes spécifiques** → **Ajouter des personnes ou des groupes**.
6. Colle l'**adresse du compte de service** (B4). Dans *Autorisations*, choisis **Apporter des modifications aux événements** → **Envoyer**.
   (Google peut avertir que l'adresse n'est pas un compte Google classique : c'est normal pour un compte de service, valide quand même.)

#### B7. Copier l'identifiant de l'agenda

Sur la même page de paramètres, descends jusqu'à **Intégrer l'agenda** → copie l'**ID de l'agenda**. Il ressemble à `abcdef1234567890@group.calendar.google.com` (pour l'agenda principal d'un compte, c'est l'adresse Gmail).

#### B8. Enregistrer la clé dans Cloudflare

Dans un terminal, depuis le dossier du projet. Remplace le chemin par celui du fichier téléchargé en B5 :

```bash
# macOS / Linux
npx wrangler secret put GOOGLE_SA_JSON < ~/Téléchargements/ricci-garage-XXXXXX-clé.json
```

```powershell
# Windows (PowerShell)
Get-Content -Raw "$HOME\Downloads\ricci-garage-XXXXXX-clé.json" | npx wrangler secret put GOOGLE_SA_JSON
```

Wrangler répond `Success! Uploaded secret GOOGLE_SA_JSON`. Vérifie : `npx wrangler secret list` doit montrer `GOOGLE_SA_JSON`.

**Puis supprime le fichier téléchargé** (et vide la corbeille). Cloudflare en garde la seule copie dont l'application a besoin. Si tu le perds, ce n'est pas grave : on crée une nouvelle clé (B5) et on refait B8.

#### B9. Activer la synchronisation dans l'application

1. Ouvre l'application → **Réglages** → **Garage et rappels** → champ **Identifiant de l'agenda Google** → colle l'ID copié en B7 → **Enregistrer les réglages**.
2. Descends jusqu'à **Google Agenda**. Tu dois lire **« ✓ Compte de service configuré. Partagez votre agenda Google avec … »** suivi de l'adresse du compte de service. Si ce n'est pas le cas, le secret B8 est absent ou illisible.
3. Clique sur **🔄 Synchroniser Google Agenda**. Au bout de quelques secondes : *« Dernière synchronisation : … N envoyé(s) … N élément(s) dans Google Agenda »*.
4. Ouvre <https://calendar.google.com> : les événements apparaissent dans **Mitch depann** (📅 rendez-vous, 🔧 interventions, ⏰ échéances « toute la journée »).

Ensuite tout est automatique : chaque création, modification, annulation ou archivage est répercuté en moins de 20 minutes, ou tout de suite avec le bouton.

#### B10. Régler les alertes sur le téléphone de ton père (Android)

À faire **sur son téléphone**, dans **son** compte Google, car c'est lui le propriétaire des alertes :

1. Installer / ouvrir l'application **Google Agenda** et être connecté au bon compte.
2. Menu ☰ → vérifier que **Mitch depann** est **coché** (visible), sinon cocher la case. Si l'agenda est absent : ☰ → *Paramètres* → *Mitch depann* → activer **Synchronisation**.
3. ☰ → **Paramètres** → **Mitch depann** → **Notifications des événements** → **Ajouter une notification** (par exemple *30 minutes avant* et *1 jour avant*).
4. Même écran : **Notifications des événements sur toute la journée** → par exemple *1 jour avant à 08:00* : c'est ce qui prévient des contrôles techniques et vidanges à venir.
5. Dans les paramètres Android → *Applications* → *Agenda* → *Notifications* : autoriser les notifications (et, selon les marques de téléphone, désactiver l'optimisation de batterie pour Google Agenda pour qu'elles arrivent à l'heure).

> Ces alertes sont **indépendantes** des rappels par email de l'application : ce sont deux systèmes distincts, on peut garder l'un, l'autre, ou les deux.

#### B11. Dépannage Google Agenda

Les messages s'affichent dans Réglages → *Google Agenda* (ligne *Dernière synchronisation*).

| Message ou symptôme | Cause probable | Solution |
|---|---|---|
| « Clé du compte de service absente sur le serveur » | Secret `GOOGLE_SA_JSON` absent ou JSON tronqué | Refaire B8 avec le fichier **complet** |
| Rien ne se passe, bouton grisé | Identifiant d'agenda non saisi | B9, étape 1 |
| « Connexion à Google refusée (invalid_grant …) » | Clé supprimée ou révoquée dans la console, ou fichier modifié | Créer une nouvelle clé (B5) puis B8 |
| « Droits insuffisants … 403 » | L'agenda n'est pas partagé avec le compte de service, droit trop faible, ou **API Google Calendar non activée** | Vérifier B6 (permission *Apporter des modifications aux événements*) et B3 |
| « Agenda introuvable … 404 » | Identifiant d'agenda faux (faute de frappe, espace) | Recopier l'ID depuis *Intégrer l'agenda* (B7) |
| « N restant(s) » | Plus de 18 opérations à faire d'un coup (premier envoi de beaucoup d'éléments) | Normal : le reste part automatiquement aux passages suivants (15 min) |
| Événement absent de Google | Élément de plus de 30 jours, client / véhicule archivé, rendez-vous annulé, agenda décoché sur le téléphone | Vérifier dans l'application ; cocher l'agenda (B10) ; cliquer sur le bouton |
| Événement modifié ou supprimé à la main dans Google, qui ne revient pas | Volontaire : l'application ne réécrit que ce qui change de son côté | Modifier l'élément dans l'application (même un changement mineur) ou le recréer |
| Pas d'alerte sur le téléphone | Les alertes ne viennent pas de l'application | B10 |

**Changer d'agenda** : saisir un autre identifiant dans les Réglages recrée **tout** dans le nouvel agenda ; les anciens événements restent dans l'ancien (à supprimer à la main).

**Arrêter la synchronisation** : vider le champ *Identifiant de l'agenda Google* → Enregistrer. Les événements déjà créés restent dans Google.

**Révoquer l'accès** : (1) dans Google Agenda, retirer le compte de service des partages de l'agenda ; (2) dans la console Google Cloud → *IAM et administration* → *Comptes de service* → *ricci-garage-sync* → *Clés* → supprimer la clé ; (3) `npx wrangler secret delete GOOGLE_SA_JSON`.

---

### C. Liste de contrôle finale

- [ ] `npx wrangler secret list` affiche `APP_PASSWORD`, `SESSION_SECRET`, `SMTP_USER`, `SMTP_PASSWORD`, `GOOGLE_SA_JSON`.
- [ ] Réglages → *Envoi des emails* : « ✓ Serveur d'envoi configuré » et l'email de test est arrivé.
- [ ] Réglages → *Google Agenda* : « ✓ Compte de service configuré » et « N élément(s) dans Google Agenda ».
- [ ] Les événements sont visibles dans l'agenda **Mitch depann** sur <https://calendar.google.com>.
- [ ] Le téléphone de ton père affiche l'agenda et ses notifications sont réglées (B10).
- [ ] Le fichier JSON de la clé est supprimé de l'ordinateur.
- [ ] Un client de test avec un email a reçu un rappel de rendez-vous (A7).

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

- **Envoi Gmail non testé de bout en bout** : Nodemailer a été testé sous `wrangler dev` (runtime Workers) contre un serveur SMTP local sans TLS, avec authentification : l'envoi fonctionne. La connexion TLS vers Gmail (port 465) n'a pas pu être vérifiée hors ligne. Le bouton « Envoyer un email de test » sert à le valider après déploiement (étape A6 du guide). En cas d'échec, solutions de repli : client SMTP minimal sur `cloudflare:sockets`, ou API Gmail en HTTPS.
- Pas de rappel par email pour une échéance **au kilométrage** (le kilométrage n'est connu que quand une intervention le relève) : elle apparaît dans « À venir » et dans le récapitulatif quotidien quand il reste moins de 1 000 km.
- **Google Agenda non testé contre le vrai Google** : testé avec un faux serveur Google local (jeton JWT RS256 vérifié, création / mise à jour / suppression, erreurs 403 et 404). Le bouton « Synchroniser Google Agenda » et les messages d'erreur des Réglages permettent de valider la configuration réelle (étape B9 du guide).
- Pas de synchronisation dans l'autre sens (Google → application).

## Sauvegardes

- Réglages → « Exporter une sauvegarde » (JSON) / « Importer une sauvegarde » : clients, véhicules, interventions. **Les photos n'y sont pas** : elles sont uniquement dans R2, qui n'a pas d'historique de restauration (une photo supprimée côté serveur est perdue ; dans l'application, « supprimer » ne retire que l'affichage).
- D1 « Time Travel » : restauration à n'importe quel instant des 30 derniers jours (`npx wrangler d1 time-travel restore ricci-garage --timestamp=…`).
