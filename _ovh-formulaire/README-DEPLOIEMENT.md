# Déploiement contrôlé du formulaire CIT sur OVHcloud

Ce guide installe uniquement la passerelle des formulaires sur le sous-domaine `formulaire.cabinetinfirmierdutournaisis.be`. Le site statique reste sur GitHub Pages et le WordPress vide présent sur OVHcloud ne doit pas être modifié.

## État contrôlé le 1er septembre 2026

- Sous-domaines actifs : `formulaire.cabinetinfirmierdutournaisis.be` et `www.formulaire.cabinetinfirmierdutournaisis.be`.
- Dossier racine isolé : `formulaire-cit` ; le dossier principal `www` et WordPress sont intacts.
- Diagnostics DNS A et AAAA : verts pour les deux sous-domaines.
- Certificats Let's Encrypt : actifs pour les deux sous-domaines.
- Version serveur observée : PHP 8.4.
- Fichiers d'exécution transférés par SFTP ; `config.local.php` présent avec `mail_enabled=true` après autorisation explicite d'Éric.
- Contrôles distants : CORS CIT `204`, origine extérieure `403`, fichiers internes `403`, demande incomplète `422`.
- Redirection active : `formulaire@cabinetinfirmierdutournaisis.be` vers `direction@cabinetinfirmierdutournaisis.be`.
- Tests contrôlés réussis : patient `200`, professionnel `200`, puis confirmation par Éric de `2` messages reçus sur `info@…` et `2` sur `direction@…`.
- Aucune donnée réelle de patient utilisée et branche GitHub non publiée.

## Règles de sécurité

- Ne jamais utiliser le dossier du domaine principal ou le dossier WordPress.
- Créer un dossier neuf et vide réservé au sous-domaine, par exemple `formulaire-cit`.
- Garder `mail_enabled=false` jusqu'à l'autorisation explicite d'Éric pour deux e-mails fictifs ; après activation, ne plus envoyer de test sans une nouvelle autorisation.
- Ne jamais publier la branche GitHub avant la validation séparée d'Éric.
- Ne saisir aucune donnée réelle de patient pendant les tests.
- Arrêter immédiatement si le dossier cible n'est pas vide, si PHP 8 n'est pas disponible ou si le HTTPS n'est pas actif.

## 1. Préparer le sous-domaine isolé

1. Ouvrir l'espace client OVHcloud.
2. Aller dans `Web Cloud` > `Hébergements` > sélectionner l'hébergement > `Multisite`.
3. Cliquer sur `Actions` > `Ajouter un domaine ou sous domaine`.
4. Sélectionner `cabinetinfirmierdutournaisis.be`, puis saisir le sous-domaine `formulaire`.
5. Choisir comme dossier racine un nouveau dossier réservé, par exemple `formulaire-cit`.
6. Si OVHcloud ajoute automatiquement `www.formulaire`, vérifier qu'il pointe vers le même dossier isolé `formulaire-cit`. Ne jamais le faire pointer vers le dossier principal `www`.
7. Activer SSL et, si OVHcloud le propose, utiliser la configuration DNS automatique.
8. Valider puis attendre que le diagnostic A/AAAA soit vert.

OVHcloud indique que le dossier racine choisi reçoit les fichiers du sous-domaine et que la propagation DNS peut prendre jusqu'à 24 heures : <https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/multisites-configure-multisite>

## 2. Vérifier HTTPS et PHP

1. Dans `Certificats SSL`, vérifier que `formulaire.cabinetinfirmierdutournaisis.be` possède un certificat Let's Encrypt actif.
2. Ouvrir `https://formulaire.cabinetinfirmierdutournaisis.be` et vérifier que le navigateur n'affiche aucune alerte de certificat.
3. Vérifier dans l'hébergement qu'une version PHP 8 encore proposée par OVHcloud est disponible.
4. Ne pas modifier la version PHP globale sans vérifier son impact sur les autres dossiers, notamment WordPress.
5. Si une configuration PHP propre au sous-domaine est nécessaire, la préparer ensemble avant le transfert. Ne pas improviser un fichier `.ovhconfig`.

OVHcloud active normalement Let's Encrypt par défaut pour les nouveaux sous-domaines depuis août 2025, mais l'activation doit être contrôlée : <https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/ssl-letsencrypt>

La configuration PHP et les règles du fichier `.ovhconfig` sont décrites ici : <https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/configure-your-web-hosting>

## 3. Transférer uniquement les fichiers nécessaires

Privilégier SFTP dans FileZilla lorsque l'offre OVHcloud le permet. Ouvrir le dossier racine exact du sous-domaine dans la colonne de droite.

Transférer le contenu suivant à la racine du sous-domaine, sans transférer le dossier `_ovh-formulaire` lui-même :

```text
.htaccess
config.php
envoyer.php
lib/
  FormService.php
  HttpResponder.php
  RateLimiter.php
var/
  .htaccess
```

Ne pas transférer :

```text
.gitignore
config.example.local.php
tests/
README-DEPLOIEMENT.md
un éventuel contenu local du dossier var/
```

Guide officiel FileZilla/SFTP : <https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/ftp-filezilla-user-guide>

## 4. Créer la configuration OVH avec les e-mails désactivés

Créer à la racine du sous-domaine un fichier nommé exactement `config.local.php` contenant :

```php
<?php
declare(strict_types=1);

return ['mail_enabled' => false];
```

Ce fichier reste uniquement sur OVHcloud. Il ne doit jamais être ajouté à GitHub.

## 5. Vérifier la passerelle sans envoyer d'e-mail

Effectuer les contrôles dans cet ordre :

1. `https://formulaire.cabinetinfirmierdutournaisis.be/envoyer.php` répond sans afficher de détail PHP.
2. Une requête `OPTIONS` provenant du site CIT obtient le statut `204` et autorise l'origine CIT.
3. `https://formulaire.cabinetinfirmierdutournaisis.be/config.php` est refusé.
4. `https://formulaire.cabinetinfirmierdutournaisis.be/lib/FormService.php` est refusé.
5. `https://formulaire.cabinetinfirmierdutournaisis.be/var/rate-secret` est refusé, même après la création de la protection anti-abus.
6. Une demande fictive incomplète est refusée sans exposer son contenu dans une erreur.
7. Une demande fictive complète avec `mail_enabled=false` obtient une indisponibilité contrôlée et n'envoie aucun message.

Résultat obligatoire avant la suite : HTTPS actif, CORS limité au site CIT, fichiers internes refusés et aucun e-mail reçu.

## 6. Premier arrêt obligatoire : autorisation des e-mails fictifs

Présenter les résultats précédents à Éric et attendre son autorisation explicite pour :

- un test patient vers `info@cabinetinfirmierdutournaisis.be` ;
- un test professionnel vers `direction@cabinetinfirmierdutournaisis.be`.

Après accord seulement :

1. Vérifier que `formulaire@cabinetinfirmierdutournaisis.be` existe ou fonctionne comme alias d'envoi OVHcloud.
2. Remplacer uniquement `false` par `true` dans `config.local.php`.
3. Envoyer deux demandes contenant clairement `TEST CIT — NE PAS TRAITER` et aucune donnée réelle.
4. Vérifier avec Éric et Céline la boîte destinataire, l'heure de réception et l'absence de copie vers l'autre boîte.
5. Vérifier qu'un accusé envoyé à l'adresse fictive ne contient ni type de soin, ni date, ni lieu, ni message.

En cas d'échec, remettre immédiatement `mail_enabled=false`.

## 7. Second arrêt obligatoire : autorisation de publication GitHub

Après validation des deux e-mails fictifs, présenter le diff final, les tests et les contrôles smartphone. Attendre une nouvelle autorisation explicite d'Éric avant de pousser ou fusionner la branche `formulaires-securises-cit`.

## 8. Contrôles après publication

1. Ouvrir l'accueil et la page professionnelle sur smartphone.
2. Vérifier qu'aucun élément ne déborde horizontalement.
3. Envoyer au maximum les deux tests fictifs autorisés.
4. Confirmer le routage patient vers `info@…` et professionnel vers `direction@…`.
5. Vérifier que les messages d'erreur restent génériques et que les boutons flottants ne recouvrent aucun champ.

## Retour arrière

En cas de problème :

1. Mettre immédiatement `mail_enabled=false` sur OVHcloud.
2. Ne supprimer ni WordPress, ni sa base de données, ni le dossier du domaine principal.
3. Revenir sur GitHub au dernier commit public validé avant les formulaires.
4. Conserver temporairement le dossier isolé du sous-domaine pour le diagnostic ; ne le supprimer qu'après une décision séparée d'Éric.
5. Vérifier que l'ancien site statique fonctionne toujours et que plus aucun nouveau message de formulaire n'est envoyé.
