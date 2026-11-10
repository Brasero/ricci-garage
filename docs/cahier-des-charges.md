# Cahier des charges — Ricci Garage

> **Statut : BROUILLON v0.1 — en attente de validation.** Aucun code n'est écrit tant que ce document n'est pas validé.
> Les points marqués ❓ sont des questions ouvertes. Le message initial s'arrêtait à « D… » : la suite des besoins est à compléter (section 3.4).

## 1. Contexte et objectifs

Application web à **usage exclusif d'un seul utilisateur** (le père, mécanicien indépendant) pour organiser, gérer et archiver toute son activité : clients, véhicules, interventions, et documents associés.

Objectifs : remplacer papier/mémoire/carnets, retrouver en quelques secondes l'historique d'un véhicule ou d'un client, ne rien perdre.

Principes directeurs :
- **Simplicité avant tout** : utilisable sans formation, gros boutons, peu de champs obligatoires, lisible sur téléphone/tablette (atelier) et sur ordinateur.
- **Fiabilité des données** : sauvegardes automatiques, rien n'est supprimé définitivement par erreur (corbeille).
- **Mono-utilisateur** : pas de gestion de rôles, un simple accès protégé.

## 2. Périmètre

### Inclus (v1)
Clients, véhicules, liaison client↔véhicule, recherche, authentification simple, sauvegarde/export.

### Candidats pour la v1 ou v2 (à trancher, voir 3.4)
Interventions / historique d'entretien, devis et factures, photos et documents, rappels (contrôle technique, vidange), stock de pièces.

### Exclu
Multi-utilisateurs, paiement en ligne, espace client, comptabilité complète.

## 3. Besoins fonctionnels

### 3.1 Clients
| Champ | Type | Obligatoire |
|---|---|---|
| Nom | texte | oui |
| Prénom | texte | oui |
| Téléphone | texte (formats FR/LU/international, ex. +352…, +33…) | oui |
| Email | email | non |
| Notes | texte libre | non (ajout suggéré) |

Actions : créer, modifier, consulter (fiche client avec ses véhicules), archiver (corbeille), rechercher (nom, prénom, téléphone).
Règle : détection de **doublons** probables (même téléphone ou même nom+prénom) avec avertissement, sans blocage.

### 3.2 Véhicules
| Champ | Type | Obligatoire |
|---|---|---|
| Marque | liste + saisie libre | oui |
| Modèle | texte | oui |
| Motorisation | liste (essence, diesel, hybride, hybride rechargeable, électrique, GPL, autre) + cylindrée/puissance en texte libre | oui |
| Couleur | texte | non |
| Immatriculation | texte, **pays FR ou LU** | oui |
| Année / date de 1ʳᵉ mise en circulation | date | non |
| N° de châssis (VIN) | 17 caractères, validé | non |
| Kilométrage actuel | nombre | non |
| Notes | texte libre | non |

Règles sur l'immatriculation :
- FR : format SIV `AB-123-CD` (anciens formats FNI `123 ABC 45` tolérés, ❓ à confirmer).
- LU : format actuel 2 lettres + 4 chiffres (`AB 1234`) ; les plaques LU ont plusieurs variantes historiques (ex. chiffres seuls), ❓ à confirmer avec des exemples réels.
- Le champ « pays » détermine la validation ; normalisation (majuscules, séparateurs) pour que la recherche trouve `ab123cd` comme `AB-123-CD`.
- Unicité : une plaque = un véhicule (avec avertissement si déjà existante).

Liaison : un véhicule appartient à **un client** ; un client peut avoir **plusieurs véhicules**. Un véhicule peut **changer de propriétaire** (l'historique reste attaché au véhicule, l'ancien propriétaire est conservé dans l'historique).

### 3.3 Fonctions transverses
- **Recherche globale** unique (nom, téléphone, plaque, marque/modèle).
- **Authentification** : un mot de passe (ou code) ; session longue sur son appareil habituel.
- **Sauvegarde** : copie automatique quotidienne + export manuel (fichier téléchargeable).
- **Corbeille** : suppression réversible.
- **Langue** : français uniquement. Interface en gros caractères.

### 3.4 À compléter / à décider ❓
1. Suite de ton message (« D… ») : quelle fonction manquait ?
2. **Interventions** : enregistrer date, km, description, pièces, temps passé, prix ? (très probablement le cœur de l'« archivage »)
3. **Devis / factures** : nécessaire ? Si oui, il y a des obligations légales (numérotation continue, mentions TVA, conservation 10 ans) qui changent beaucoup le projet. Statut fiscal de ton père (micro-entreprise, France ou Luxembourg ?) ?
4. **Photos / documents** (carte grise, factures fournisseurs) : oui/non ?
5. **Rappels** (CT, entretien) avec SMS/email : oui/non ?
6. Utilisation prévue : surtout téléphone, tablette, PC ?
7. Doit-il fonctionner **sans connexion** à l'atelier ?
8. Faut-il importer des données existantes (Excel, carnet) ?

## 4. Besoins non fonctionnels

- **Données personnelles (RGPD)** : on stocke noms, téléphones, plaques → données personnelles. Mentions minimales, droit de suppression/export, hébergement dans l'UE, mot de passe hashé, HTTPS obligatoire.
- **Performance** : quelques milliers de fiches maximum, recherche instantanée.
- **Disponibilité** : pas de contrainte forte, mais **zéro perte de données**.
- **Coût d'exploitation** : le plus bas possible (idéalement < 10 €/mois).
- **Maintenance** : doit rester simple à maintenir par toi seul.

## 5. Pistes techniques (à discuter, pas décidé)

Analogie : choisir la stack, c'est choisir entre un **tournevis multifonction** (simple, suffisant) et une **caisse à outils d'atelier** (puissante, mais plus lourde à ranger et entretenir). Pour un utilisateur unique et quelques milliers de fiches, le tournevis suffit.

**Recommandation** (je te dis franchement ce que je ferais) :
- **Une application web classique rendue côté serveur + base SQLite**, plutôt qu'une architecture « API + application JavaScript séparée » avec PostgreSQL. SQLite = un seul fichier à sauvegarder, zéro serveur de base à administrer ; amplement suffisant pour un seul utilisateur. Une architecture séparée serait du sur-dimensionnement ici.
- Au choix selon tes préférences : Python (Django, qui fournit authentification, admin et formulaires gratuitement) **ou** Node/TypeScript. Je penche pour **Django** : moins de code à écrire et maintenir. Dis-moi quelle techno tu maîtrises, car tu seras le mainteneur.
- **PWA** (installable sur l'écran d'accueil du téléphone) plutôt qu'une vraie application mobile.
- Hébergement : petit VPS européen, ou service managé UE ; sauvegardes chiffrées hors serveur.

❓ Une alternative à envisager sérieusement : un logiciel de gestion de garage existant coûte peu et gère déjà devis/factures légales. Si la facturation est un besoin central, ne pas la réinventer.

## 6. Plan de livraison proposé

1. **Jalon 1** : authentification, clients, véhicules, liaison, recherche, sauvegarde.
2. **Jalon 2** : interventions / historique par véhicule.
3. **Jalon 3** : documents/photos, rappels (selon réponses 3.4).
4. **Jalon 4** (optionnel) : devis/factures.

## 7. Critères d'acceptation du jalon 1

- Créer un client en < 30 s avec uniquement nom, prénom, téléphone.
- Ajouter un véhicule FR ou LU ; une plaque invalide est refusée avec un message clair.
- Retrouver un véhicule en tapant une plaque sans tirets ni espaces.
- Un client affiche tous ses véhicules ; un véhicule affiche son propriétaire.
- Une sauvegarde peut être restaurée sur une installation vierge.
