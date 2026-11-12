# Cahier des charges — Mitch depann

> **Statut : VALIDÉ (v0.4) — jalons 1 à 4 réalisés.** Aucun code n'est écrit tant que ce document n'est pas validé.
> Les points marqués ❓ sont des questions ouvertes (regroupées en section 10). Plus de question bloquante : le document peut être validé.

## 0. Décisions validées
- Hébergement **Cloudflare** (Pages + Workers + D1 + R2).
- Utilisateur sur **Android** + PC (notifications push PWA fiables sur Android).
- Front en **React**.
- Pièces : **prix d'achat et prix de vente** (marge visible).
- **Pas de taux horaire** : durée et prix de main d'œuvre sont deux saisies libres, indépendantes.
- **Rappels par email** au client et au père.
- **Pas de nom de domaine** : sous-domaine gratuit Cloudflare (`*.pages.dev` / `*.workers.dev`).
- **Envoi d'emails via Nodemailer + SMTP Gmail** (expéditeur et destinataire du récapitulatif : `riccimichel3@gmail.com`).
- Délais de rappel et coordonnées du garage **paramétrables** (écran Paramètres, section 3.8).
- Aucune donnée à importer.
- Plaque LU : **2 lettres + 4 chiffres** (`AB 1234`).

## 1. Contexte et objectifs

Application web à **usage exclusif d'un seul utilisateur** (le père, mécanicien indépendant) pour organiser, gérer et archiver toute son activité : clients, véhicules, interventions, rendez-vous et échéances.

**Suivi uniquement** : pas de devis ni de facture pour le moment (les prix servent de mémoire interne, pas de document comptable).

Principes directeurs :
- **Simplicité** : utilisable sans formation, gros boutons, peu de champs obligatoires.
- **Téléphone + PC** : même données sur les deux, interface adaptée aux deux écrans.
- **Jamais bloqué hors connexion** : on peut tout saisir sans réseau, la synchronisation se fait au retour de la connexion.
- **Zéro perte de données** : sauvegardes, corbeille.
- **Hébergement gratuit** (usage minime).

## 2. Périmètre

| Domaine | v1 |
|---|---|
| Clients | oui |
| Véhicules (liés à un client) | oui |
| Recherche globale | oui |
| Interventions détaillées et chiffrées (pièces, prix, durée, photos) | oui |
| Calendrier intégré + rendez-vous clients | oui |
| Rappels (rendez-vous, CT, vidange…) | oui |
| Mode hors connexion + synchronisation | oui |
| Synchronisation Google Calendar | oui, **sens unique** (voir 5.4) |
| Devis / factures | **non** (plus tard, éventuellement) |
| Multi-utilisateurs, paiement, espace client | non |

## 3. Besoins fonctionnels

### 3.1 Clients
| Champ | Obligatoire |
|---|---|
| Nom, Prénom | oui |
| Téléphone (FR / LU / international : +352…, +33…) | oui |
| Email | non |
| Notes | non |

Créer, modifier, consulter (fiche avec ses véhicules, interventions et rendez-vous), archiver (corbeille). Avertissement (sans blocage) si doublon probable (même téléphone, ou même nom + prénom). Bouton « appeler » / « écrire » depuis la fiche sur téléphone.

### 3.2 Véhicules
| Champ | Obligatoire |
|---|---|
| Marque, Modèle | oui |
| Motorisation (essence, diesel, hybride, hybride rechargeable, électrique, GPL, autre) + précision libre (cylindrée, puissance) | oui |
| Immatriculation + **pays (FR ou LU)** | oui |
| Couleur | non |
| Date de 1ʳᵉ mise en circulation | non |
| N° de châssis (VIN, 17 caractères validés) | non |
| Kilométrage actuel (mis à jour automatiquement par les interventions) | non |
| Date du dernier contrôle technique (alimente les rappels) | non |
| Notes | non |

Règles d'immatriculation :
- FR : SIV `AB-123-CD` ; ancien format `123 ABC 45` toléré ❓.
- LU : 2 lettres + 4 chiffres (`AB 1234`), validé par `^[A-Z]{2}[0-9]{4}$` après normalisation.
- Normalisation (majuscules, sans séparateurs) pour la recherche et l'unicité ; avertissement si la plaque existe déjà.

Un véhicule appartient à **un client** ; un client peut avoir **plusieurs véhicules** ; le propriétaire peut changer, l'historique reste attaché au véhicule.

### 3.3 Interventions
Une intervention est liée à **un véhicule** (et donc à son client).

| Champ | Détail |
|---|---|
| Date et heure | horodatage (début), modifiable |
| Durée | temps passé réel (heures/minutes), saisie libre, indépendante du prix |
| Kilométrage | relevé lors de l'intervention |
| Type | liste : vidange, freins, distribution, pneus, diagnostic, contrôle, autre… (extensible) |
| Description / travaux effectués | texte libre |
| Pièces | lignes : désignation, référence, quantité, **prix d'achat** et **prix de vente** unitaires |
| Main d'œuvre | **prix saisi librement** (aucun calcul à partir de la durée) |
| Totaux | calculés : total pièces (vente), total achat, **marge sur pièces**, total général = pièces vente + main d'œuvre |
| Photos | plusieurs, prises directement avec l'appareil photo du téléphone |
| Statut | à faire / en cours / terminée |
| Notes internes | texte libre |

À la clôture d'une intervention : proposition automatique de **créer les rappels suivants** (ex. vidange → prochaine dans 12 mois ou 15 000 km, modifiable) et mise à jour du kilométrage du véhicule.
Historique complet par véhicule, consultable en chronologie.

### 3.4 Calendrier et rendez-vous
- Calendrier intégré, vues **jour / semaine / mois**, adapté téléphone et PC.
- **Rendez-vous client** : client, véhicule (optionnel), date/heure, durée estimée, motif, statut (prévu / honoré / annulé), notes. Un rendez-vous peut être transformé en intervention en un clic.
- Les interventions horodatées apparaissent aussi dans le calendrier.
- Détection de chevauchement (avertissement).

### 3.5 Rappels et échéances
- **Échéances véhicule** : contrôle technique, vidange, autre (type libre) ; par **date** et/ou par **kilométrage**.
- **Rappels de rendez-vous** (ex. la veille et 1 h avant).
- Écran « À venir » : échéances dépassées ou proches (30 jours), triées.
- Canaux de notification : voir 5.5 (contrainte technique importante).
- **Rappels email au client** (rendez-vous, échéance CT/vidange) uniquement si son email est renseigné ; **récapitulatif email au père** (agenda du jour/lendemain et échéances proches). Envoi automatique configurable (délais, activé/désactivé par client). SMS exclu (payant).
- Les emails client sont des messages de service (pas de publicité) et précisent le garage et un moyen de contact.

### 3.6 Recherche globale
Un seul champ de recherche, tolérant (accents, majuscules, séparateurs), qui retrouve un véhicule par :
- immatriculation (`ab123cd`, `AB-123-CD`, `ab 1234`…),
- marque, modèle,
- **nom ou prénom du propriétaire** (dans n'importe quel ordre),
et accessoirement : téléphone du client, texte des interventions.
Résultat : liste de véhicules avec propriétaire visible. Fonctionne **hors connexion**.

### 3.8 Paramètres (modifiables depuis l'application)
- **Coordonnées du garage** : nom, adresse, téléphone, email de contact, mention libre en pied de mail (utilisées dans les emails).
- **Délais de rappel** (valeurs par défaut) :
  - rendez-vous : **la veille** et **1 h avant** ;
  - contrôle technique, vidange et autres échéances : **30 jours** et **7 jours avant** ;
  - chaque délai est modifiable, ajoutable/supprimable, et activable/désactivable séparément pour les clients et pour le père ;
  - réglage possible par échéance ou par client (ex. ne pas écrire à tel client).
- **Email du récapitulatif** (par défaut `riccimichel3@gmail.com`) et heure d'envoi.
- Types d'intervention et d'échéance (listes extensibles).

### 3.7 Fonctions transverses
- **Authentification** : un seul compte protégé (mot de passe ; session longue sur ses appareils).
- **Sauvegarde / export** : export complet (données + photos) en un clic et copie automatique régulière.
- **Corbeille** : suppression réversible.
- Français uniquement, gros caractères.

## 4. Besoins non fonctionnels
- **RGPD** : noms, téléphones, plaques, photos = données personnelles. HTTPS, mot de passe hashé, hébergement UE si possible, export et suppression d'un client sur demande.
- **Volumétrie** : quelques milliers de fiches, plusieurs milliers de photos à terme → les photos sont **compressées côté appareil** (~200 à 400 Ko) pour tenir dans les quotas gratuits.
- **Coût** : 0 € (sous-domaine Cloudflare gratuit, SMTP Gmail gratuit).
- **Limite assumée** : une URL du type `ricci-garage.pages.dev` (pas de nom personnalisé) ; les mails partent d'une adresse Gmail personnelle, ce qui est moins « pro » mais fiable à ce volume.
- **Maintenance** : simple, tenable par une seule personne.

## 5. Architecture proposée

> **Je révise ma recommandation précédente.** Dans la v0.1, je proposais Django + SQLite. Avec vos nouvelles exigences (hors connexion + gratuit + photos), ce choix n'est plus le bon : un serveur classique suppose d'être en ligne pour chaque action, et les hébergeurs gratuits à disque éphémère (type Render/Fly gratuit) **effacent un fichier SQLite** à chaque redémarrage.

### 5.1 Principe : « local d'abord » (local-first)
Analogie : c'est comme le **carnet que ton père garde dans sa poche** et qu'il recopie au propre dans le grand classeur de l'atelier en rentrant. L'application écrit **toujours d'abord dans une base locale du navigateur** (IndexedDB) : c'est instantané et ça ne dépend jamais du réseau. Un « facteur » (le moteur de synchronisation) fait ensuite le va-et-vient avec le serveur dès qu'il y a de la connexion.

- **PWA** (Progressive Web App) : installable sur l'écran d'accueil du téléphone et du PC, fonctionne sans réseau grâce à un Service Worker qui met l'application en cache.
- Identifiants (UUID) générés côté appareil : on peut créer un client, un véhicule et son intervention sans serveur.
- Chaque enregistrement porte `updatedAt` ; conflit = **le plus récent gagne** (acceptable : un seul utilisateur). Suppressions « douces » (marqueur) pour qu'elles se propagent.
- File d'attente de synchronisation ; les photos partent après les données, en tâche de fond.

### 5.2 Hébergement gratuit : deux options
| | A. Cloudflare (Pages + Workers + D1 + R2) | B. Supabase (Postgres + Storage + Auth) |
|---|---|---|
| Gratuit | oui, quotas très larges (D1 5 Go, R2 10 Go) | oui, mais 500 Mo de base et 1 Go de fichiers |
| Mise en veille | **non** | **oui : projet mis en pause après ~7 jours d'inactivité** (réveil manuel), risqué pour un usage « minime » |
| Photos | R2 (10 Go gratuits) | 1 Go : saturé en un à deux ans de photos |
| Tâches planifiées (rappels) | Cron Triggers inclus | possible via fonctions programmées |
| Complexité | un peu plus de code serveur à écrire | un peu moins |

**Choix retenu : A (Cloudflare)**, car la mise en pause de Supabase est précisément le piège d'un usage faible.

Écarté : Firebase (le stockage de fichiers exige désormais un forfait avec carte bancaire).

### 5.3 Stack applicative (à valider)
TypeScript partout (une seule langue pour le front et le serveur) ; front **React** (Vite) ; base locale IndexedDB (Dexie) ; composant calendrier open source. Tests sur les règles métier (plaques, synchronisation, rappels).

### 5.4 Google Calendar : sens unique d'abord
Deux sens = deux sources de vérité = conflits difficiles et OAuth plus lourd (vérification Google pour certaines autorisations). Je recommande :
- **v1 : application → Google Calendar** (les rendez-vous et interventions planifiées sont poussés vers un agenda dédié « Mitch depann »). Bénéfice immédiat : ton père reçoit les **rappels natifs de Google Calendar sur son téléphone**, sans rien de plus.
- Alternative encore plus simple : un **flux ICS en lecture** auquel Google Calendar s'abonne (mise à jour avec quelques heures de délai, mais zéro OAuth).
- Synchronisation dans l'autre sens (modifier dans Google → app) : reportée, seulement si c'est vraiment utile.

### 5.5 Rappels : la contrainte à connaître
Les notifications push d'une PWA marchent bien sur Android et PC (pas de contrainte iPhone puisque l'utilisateur est sur Android). Elles ne sont jamais garanties à l'heure exacte. Stratégie à trois niveaux, tous gratuits :
1. Notification push de la PWA ;
2. Rappels via Google Calendar (fiables, natifs) ;
3. Emails (père : récapitulatif ; clients : rappels), envoyés par un Cron Trigger Cloudflare avec **Nodemailer via SMTP Gmail** (`smtp.gmail.com`, mot de passe d'application Google, validation en 2 étapes requise sur le compte, secret stocké dans les secrets Cloudflare, jamais dans le code). Limite Gmail ~500 mails/jour, très largement suffisant. Les réponses des clients arrivent directement dans la boîte Gmail. ⚠️ **Risque technique** : Nodemailer s'appuie sur des sockets TCP Node ; leur support dans les Workers Cloudflare (`nodejs_compat`) est récent et je ne l'ai pas validé. **Un test de faisabilité (« spike ») sera fait au tout début du jalon 3** ; si cela échoue, repli sur l'API Gmail en HTTPS (`fetch`) avec le même compte, sans changer le reste.

## 6. Modèle de données (aperçu)
`Client` 1—n `Véhicule` 1—n `Intervention` 1—n (`LignePièce`, `Photo`) ; `Véhicule` 1—n `Échéance` ; `RendezVous` → `Client` (+ `Véhicule` optionnel, + `Intervention` éventuelle). Tous : `id` (UUID), `createdAt`, `updatedAt`, `deletedAt`.

## 7. Plan de livraison proposé
1. **Jalon 1 — Socle** : PWA installable, authentification, base locale, synchronisation, clients, véhicules, recherche globale, export.
2. **Jalon 2 — Interventions** : saisie détaillée et chiffrée, pièces, photos, historique par véhicule.
3. **Jalon 3 — Agenda** : calendrier, rendez-vous, échéances, rappels, écran « À venir ».
4. **Jalon 4 — Google Calendar** (sens unique) et email récapitulatif.

Le mode hors connexion est construit **dès le jalon 1** (le rajouter après revient à reconstruire les fondations).

## 8. Critères d'acceptation
- En mode avion, créer un client, un véhicule et une intervention avec photo ; au retour du réseau, tout apparaît sur l'autre appareil sans doublon.
- Taper `dupont` ou `golf` ou `ab123cd` retrouve le bon véhicule avec son propriétaire, hors connexion comprise.
- Une plaque invalide est refusée avec un message clair.
- Clôturer une vidange propose le rappel suivant ; il apparaît dans « À venir » et dans le calendrier.
- Un rendez-vous créé apparaît dans Google Calendar avec ses rappels.
- Une sauvegarde exportée peut être restaurée sur une installation vierge.

## 10. Questions ouvertes
Aucune bloquante. À valider par toi :
1. Es-tu d'accord avec l'URL sous-domaine gratuit (`xxx.pages.dev`) et l'envoi depuis une adresse Gmail personnelle ?
2. Peux-tu activer la validation en 2 étapes sur `riccimichel3@gmail.com` et créer le « mot de passe d'application » le moment venu (je te guiderai) ? **Ne me le communique jamais dans le chat** : il sera saisi directement comme secret Cloudflare.
3. Le document est-il validé tel quel pour démarrer le jalon 1 ?
