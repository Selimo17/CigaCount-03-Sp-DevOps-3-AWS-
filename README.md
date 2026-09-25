# CigaCount – Déploiement DevOps d'une application conteneurisée sur AWS

CigaCount est une application web **mobile-first** qui aide un fumeur à visualiser le coût réel de sa consommation et à transformer sa réduction en **épargne vers un objectif d'achat**.

Le cœur du projet est la partie DevOps : l'application est **conteneurisée avec Docker**, publiée sur **Amazon ECR**, déployée sur **ECS Fargate** derrière un **Application Load Balancer**, avec une infrastructure entièrement décrite en **Terraform**, une **pipeline GitHub Actions** sans aucun secret AWS stocké (OIDC), et une supervision **CloudWatch** (logs, métriques, alarmes, dashboard, budget).

> ⚠️ CigaCount est un outil de suivi budgétaire : **il ne remplace pas un accompagnement médical**. Tabac Info Service : 39 89 – [tabac-info-service.fr](https://www.tabac-info-service.fr).

## Application en ligne

| | |
|---|---|
| **URL** | <http://cigacount-alb-530625861.eu-west-3.elb.amazonaws.com> |
| **Contrôle de santé** | <http://cigacount-alb-530625861.eu-west-3.elb.amazonaws.com/api/health> (renvoie la version déployée = SHA du commit) |
| **Vidéo explicative** | *lien Loom / YouTube non répertorié à ajouter* (voir [section 14](#14-vidéo-explicative)) |
| **Disponibilité** | en ligne jusqu'à la correction, puis environnement détruit (voir [section 10](#10-destruction-de-lenvironnement)) |

L'environnement est hébergé sur un compte AWS en **plan gratuit** : il est financé par les crédits AWS offerts, sans facturation possible. Si l'URL ne répond plus, l'environnement peut être recréé à l'identique en une vingtaine de minutes ([section 7](#7-déploiement-sur-aws)).

---

## Sommaire

1. [Livrables](#1-livrables)
2. [Architecture](#2-architecture)
3. [L'application](#3-lapplication)
4. [Structure du dépôt](#4-structure-du-dépôt)
5. [Lancer l'application en local](#5-lancer-lapplication-en-local)
6. [Prérequis pour le déploiement (Windows)](#6-prérequis-pour-le-déploiement-windows)
7. [Déploiement sur AWS](#7-déploiement-sur-aws)
8. [Pipeline CI/CD](#8-pipeline-cicd)
9. [Monitoring et exploitation](#9-monitoring-et-exploitation)
10. [Destruction de l'environnement](#10-destruction-de-lenvironnement)
11. [Choix techniques](#11-choix-techniques)
12. [Risques et améliorations pour la production](#12-risques-et-améliorations-pour-la-production)
13. [Estimation des coûts](#13-estimation-des-coûts)
14. [Vidéo explicative](#14-vidéo-explicative)
15. [Journal de bord : difficultés et recherches](#15-journal-de-bord--difficultés-et-recherches)
16. [Sources consultées](#16-sources-consultées)

---

## 1. Livrables

| Exigence du sujet | Où la trouver |
|---|---|
| 1a. Application conteneurisée | [`app/`](app/) · [`app/Dockerfile`](app/Dockerfile) · [`compose.yaml`](compose.yaml) |
| 1b. Image publiée sur ECR | [`infra/ecr.tf`](infra/ecr.tf) · étape *Build and push image* de [`deploy.yml`](.github/workflows/deploy.yml) |
| 2a. Déploiement ECS/Fargate | [`infra/ecs.tf`](infra/ecs.tf) |
| 2b. Point d'entrée public | [`infra/alb.tf`](infra/alb.tf) (ALB, HTTP ou HTTPS) |
| 2c. Réseau, rôles, moindre privilège | [`infra/network.tf`](infra/network.tf) · [`infra/security_groups.tf`](infra/security_groups.tf) · [`infra/iam.tf`](infra/iam.tf) · [`infra/github_oidc.tf`](infra/github_oidc.tf) |
| 3. Infrastructure as Code (Terraform) | [`infra/`](infra/) · [`infra/bootstrap/`](infra/bootstrap/) · [`scripts/`](scripts/) · tests [`infra/tests/`](infra/tests/) |
| 4. CI/CD (build → ECR → déploiement), sans secret | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) · [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| 5. Logs CloudWatch + métriques/alertes | [`infra/monitoring.tf`](infra/monitoring.tf) · [`app/src/logger.js`](app/src/logger.js) |
| 6a. Schéma d'architecture | [`docs/architecture.svg`](docs/architecture.svg) / [`docs/architecture.png`](docs/architecture.png) |
| 6b. Risques et améliorations | [section 12](#12-risques-et-améliorations-pour-la-production) |
| README : déploiement, destruction, choix techniques | sections [7](#7-déploiement-sur-aws), [10](#10-destruction-de-lenvironnement), [11](#11-choix-techniques) |
| Vidéo explicative | [section 14](#14-vidéo-explicative) |
| Traces de recherche et sources | sections [15](#15-journal-de-bord--difficultés-et-recherches) et [16](#16-sources-consultées) |

---

## 2. Architecture

![Architecture AWS](docs/architecture.png)

**Parcours d'une requête** : navigateur → Internet Gateway → **Application Load Balancer** (sous-réseaux publics, 2 zones de disponibilité) → **tâches ECS Fargate** (conteneur Node.js, port 3000). Le groupe de sécurité des tâches n'accepte que le trafic venant du load balancer.

**Parcours d'un déploiement** : `git push` sur `main` → GitHub Actions exécute la CI (tests, lint, validation Terraform) → s'authentifie auprès d'AWS par **OIDC** (identifiants temporaires) → construit l'image → la pousse sur **ECR** (tag = SHA du commit) → enregistre une nouvelle révision de la *task definition* → met à jour le service ECS (*rolling update*, rollback automatique en cas d'échec) → vérifie que la nouvelle version répond.

**Supervision** : les logs JSON des conteneurs partent dans **CloudWatch Logs** ; un filtre de métrique compte les erreurs applicatives ; des **alarmes** (service indisponible, erreurs 5xx, latence, CPU/mémoire, erreurs applicatives) notifient par e-mail via **SNS** ; un **budget AWS** alerte sur les coûts.

---

## 3. L'application

Application web volontairement simple côté serveur (le sujet porte sur le DevOps), mais complète côté fonctionnel :

- **Onboarding** : consommation de référence, prix du paquet, cigarettes par paquet → prix unitaire et budget quotidien, premier objectif (facultatif).
- **Tableau de bord** : cagnotte ou dette, jauge d'objectif, date estimée, compteur du jour, rythme d'épargne (taux officiel + tendance 7 jours), simulateur de rythme.
- **Déclaration en un clic** : bouton flottant `+1` présent sur tous les écrans, une ligne horodatée par cigarette, annulation possible pendant 5 secondes.
- **Objectifs** : création, file d'attente ordonnable, objectif « obtenu », historique.
- **Statistiques** : évolution du solde, consommation par heure et par jour de la semaine, historique des taux.
- **Coût** : coût annuel projeté, coût réel cumulé, équivalences concrètes, historique des prix.
- **Réglages** : nouveau prix, consommation de référence, saisie rétroactive, fuseau horaire, export JSON/CSV.

### Règles de calcul

Toutes les règles sont implémentées dans [`app/public/js/domain/ledger.js`](app/public/js/domain/ledger.js) (fonctions pures) et couvertes par des tests unitaires ([`app/test/ledger.test.js`](app/test/ledger.test.js)).

| Règle | Implémentation |
|---|---|
| `prix_unitaire = prix_paquet / cigarettes_par_paquet` | `computeUnitPrice` |
| `budget_quotidien = consommation_référence × prix_unitaire` | `computeDailyBudget` |
| `solde = jours_écoulés × budget_quotidien − total_dépensé`, calculé **à la lecture** | `computeLedger` : aucune tâche planifiée, chaque jour écoulé est crédité du budget en vigueur ce jour-là (identique à la formule tant que prix et référence ne changent pas ; une hausse de prix ne réécrit pas le passé). Un objectif marqué « obtenu » est retiré de la cagnotte. |
| `dette = solde < 0 ? −solde : 0` | `computeDebt` |
| `à_couvrir = montant_objectif + dette` | `allocateGoals` (tient compte de ce qui est déjà épargné et de la file d'objectifs) |
| Taux recalculé tous les 14 jours en périodes **fixes**, figé pendant la période, amorçage à 20 % du budget | `computeRatePeriods` |
| `durée_estimée = à_couvrir / taux` ; si `taux ≤ 0` : pas de date, dette + rythme réel + scénarios (dont « arrêt total ») | `projectDate`, `projectScenario` |
| `coût annuel projeté = (dépensé_30_derniers_jours / 30) × 365` | `computeLedger().cost` |
| Coût réel cumulé = somme des prix unitaires historisés | `computeLedger().cost` |
| Tendance secondaire : moyenne glissante 7 jours, sans effet sur la date | `averageOverRecentDays` |

**Contraintes techniques respectées** : prix historisés dans une table dédiée (chaque cigarette stocke le prix en vigueur), dates stockées en **UTC** et journées découpées selon le **fuseau local** de l'utilisateur ([`time.js`](app/public/js/domain/time.js)), saisie rétroactive et ajustement de la référence.

### Données : stockage local (choix d'architecture)

Les données de consommation sont des **données de santé personnelles**. Elles sont stockées **dans le navigateur (IndexedDB)** et ne quittent jamais l'appareil (export JSON/CSV possible). Conséquences :

- aucune donnée sensible à protéger côté serveur (pas de base de données, pas de RGPD serveur) ;
- le conteneur est **sans état** : il peut être remplacé, redémarré ou multiplié librement (rolling update, auto scaling) ;
- pas de coût de base de données.

Le serveur Node.js (Express) sert l'application, expose `GET /api/health` (utilisé par l'ALB et le healthcheck du conteneur) et `GET /api/version`, et écrit des **logs JSON structurés** (une ligne par requête) exploitables dans CloudWatch.

---

## 4. Structure du dépôt

```
.
├── app/                        # Application (code en anglais)
│   ├── Dockerfile              # Image multi-stage, utilisateur non-root, healthcheck
│   ├── src/                    # Serveur Express : app, logger JSON, healthcheck
│   ├── public/                 # Front-end (HTML/CSS/JS modules, sans framework)
│   │   └── js/domain/          # Règles métier pures (testées)
│   └── test/                   # Tests (node:test)
├── infra/                      # Terraform – stack principale
│   ├── bootstrap/              # Terraform – bucket S3 du state distant
│   ├── tests/                  # Tests Terraform hors-ligne (provider mocké)
│   └── *.tf                    # network, alb, ecr, ecs, iam, github_oidc, monitoring…
├── .github/workflows/          # ci.yml (vérifications), deploy.yml (déploiement), oidc-debug.yml (diagnostic)
├── scripts/                    # deploy.ps1 / destroy.ps1 (Windows PowerShell)
├── docs/                       # Schéma d'architecture (SVG source + PNG)
└── compose.yaml                # Lancement local avec Docker Compose
```

---

## 5. Lancer l'application en local

Avec **Docker** (recommandé) :

```powershell
docker compose up --build
# http://localhost:3000
```

> Docker Desktop doit afficher « Engine running ». Sous Windows, il nécessite la virtualisation et WSL 2 (voir [section 15.1](#151-docker-desktop-et-la-virtualisation)).

Avec **Node.js 22+** :

```powershell
cd app
npm ci
npm test        # 25 tests : règles métier, fuseaux horaires, serveur HTTP
npm start       # http://localhost:3000
```

---

## 6. Prérequis pour le déploiement (Windows)

### 6.1 Outils

Dans un terminal **PowerShell** (les commandes `winget` sont fournies avec Windows 10/11) :

```powershell
winget install --id Git.Git -e
winget install --id Hashicorp.Terraform -e      # Terraform >= 1.10
winget install --id Amazon.AWSCLI -e            # AWS CLI v2
winget install --id Docker.DockerDesktop -e     # facultatif : tests locaux
winget install --id GitHub.cli -e               # facultatif : configure GitHub automatiquement
```

Fermez et rouvrez le terminal, puis vérifiez : `terraform -version`, `aws --version`, `git --version`.

### 6.2 Compte AWS et identifiants pour Terraform

Seule étape réalisée dans la console AWS : créer une identité pour exécuter Terraform depuis le poste.

1. Console AWS → **IAM** → *Users* → *Create user* (ex. `terraform-admin`), politique `AdministratorAccess` (Terraform crée des rôles IAM, un VPC, etc.).
2. Onglet *Security credentials* → *Create access key* → *Command Line Interface (CLI)*.
3. Sur le poste : `aws configure` (Access key, Secret key, région `eu-west-3`, format `json`).
4. Vérifier : `aws sts get-caller-identity`.

> Ces clés restent **sur le poste** (`%USERPROFILE%\.aws\credentials`) et ne sont **jamais** dans le dépôt ni dans GitHub. La pipeline n'en a pas besoin (OIDC). Alternative recommandée : IAM Identity Center + `aws configure sso`.

### 6.3 Variables Terraform

```powershell
Copy-Item infra\terraform.tfvars.example infra\terraform.tfvars
notepad infra\terraform.tfvars
```

Renseigner au minimum :

- `github_repository` : `propriétaire/nom-du-dépôt` (sensible à la casse) ;
- `github_owner_id` et `github_repository_id` : identifiants numériques du propriétaire et du dépôt, utilisés par GitHub dans le jeton OIDC (valeurs publiques : champ `id` de `https://api.github.com/users/<propriétaire>` et de `https://api.github.com/repos/<propriétaire>/<dépôt>`) ;
- `alert_email` : adresse qui reçoit les alarmes et les alertes de budget.

Le fichier `terraform.tfvars` est ignoré par git.

---

## 7. Déploiement sur AWS

### 7.1 En une commande (script PowerShell)

Depuis la racine du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

Le script :

1. crée le **bucket S3 du state Terraform** (`infra/bootstrap`, chiffré, versionné, accès public bloqué) ;
2. génère `infra/backend.hcl` ;
3. applique la **stack principale** (`infra/`) : VPC, ALB, ECR, ECS, IAM, OIDC GitHub, CloudWatch, SNS, budget ;
4. si la **GitHub CLI** est installée et connectée (`gh auth login`), crée les variables du dépôt et lance le premier déploiement ; sinon il affiche les valeurs à saisir.

Ajoutez `-AutoApprove` pour ne pas confirmer chaque `terraform apply`.

### 7.2 Étape par étape (commandes Terraform)

```powershell
# 1. State distant
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap apply
terraform -chdir=infra/bootstrap output -raw backend_config | Set-Content -Encoding ascii infra/backend.hcl

# 2. Infrastructure (guillemets obligatoires sous PowerShell autour de -backend-config)
terraform -chdir=infra init "-backend-config=backend.hcl"
terraform -chdir=infra plan
terraform -chdir=infra apply

# 3. Valeurs utiles
terraform -chdir=infra output
```

### 7.3 Configurer GitHub (une seule fois)

Dans le dépôt GitHub : **Settings → Secrets and variables → Actions → onglet *Variables*** → *New repository variable* :

| Variable | Valeur | Obligatoire |
|---|---|---|
| `AWS_ROLE_ARN` | sortie `github_actions_role_arn` | oui |
| `AWS_REGION` | `eu-west-3` | non (défaut `eu-west-3`) |
| `APP_URL` | sortie `app_url` | non (active le test de fumée) |

Ce sont des **variables** et non des secrets : un ARN de rôle n'est pas un secret, il ne donne aucun accès sans le jeton OIDC signé par GitHub pour ce dépôt et cette branche.

### 7.4 Premier déploiement

Terraform crée le service ECS avant que la première image existe (tag `initial`) : ECS réessaie en attendant. Lancez la pipeline : **Actions → Deploy → Run workflow** (ou poussez un commit sur `main`). À la fin, l'application est disponible à l'URL `app_url` (ex. `http://cigacount-alb-123456789.eu-west-3.elb.amazonaws.com`).

Pensez à **confirmer l'abonnement SNS** reçu par e-mail pour recevoir les alertes.

### 7.5 HTTPS (optionnel)

Avec un nom de domaine : créer un certificat **ACM** dans la région, puis renseigner `certificate_arn` dans `terraform.tfvars` et relancer `terraform apply`. L'ALB écoute alors en HTTPS (TLS 1.2/1.3) et redirige HTTP → HTTPS.

---

## 8. Pipeline CI/CD

| Workflow | Déclencheur | Étapes |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | pull request, push sur une autre branche que `main`, appelé par `deploy.yml` | tests Node (`npm test`), `npm audit`, lint du Dockerfile (hadolint), build + test de fumée du conteneur, `terraform fmt`, `validate` et `test` (sans AWS) |
| [`deploy.yml`](.github/workflows/deploy.yml) | push sur `main` (hors documentation), manuel | CI complète → OIDC → **build** → **push ECR** (`image:SHA`) → rapport du scan de vulnérabilités → nouvelle révision de *task definition* → **déploiement ECS** (attente de stabilité) → test de fumée (`/api/health` renvoie le SHA déployé) |

**Gestion des secrets** : aucun secret AWS dans le dépôt ni dans GitHub. GitHub Actions obtient un jeton OIDC signé, échangé contre des identifiants **temporaires** (1 h max) pour le rôle `cigacount-github-deploy`. La politique de confiance n'accepte que la branche `main` de ce dépôt, sous ses deux formats d'identité GitHub : `repo:<propriétaire>/<dépôt>:ref:refs/heads/main` et `repo:<propriétaire>@<id>/<dépôt>@<id>:ref:refs/heads/main` (identifiants numériques immuables, épinglés par les variables `github_owner_id` et `github_repository_id`). Ce rôle peut uniquement pousser dans **ce** dépôt ECR, enregistrer une *task definition*, mettre à jour **ce** service et transmettre (*PassRole*) le rôle d'exécution à ECS. Il ne peut pas modifier l'infrastructure.

**Autres bonnes pratiques** : actions tierces épinglées par SHA de commit, `concurrency` pour ne jamais lancer deux déploiements en parallèle, tags d'images immuables (traçabilité commit ↔ version en production), cache de build Docker, *circuit breaker* ECS avec rollback automatique.

**Rollback manuel** : `git revert <commit>` puis push sur `main` (la pipeline redéploie la version précédente), ou, en urgence, mettre à jour le service ECS vers la révision précédente de la *task definition* (console ECS ou `aws ecs update-service --task-definition cigacount:<révision>`). Le rôle de déploiement n'est utilisable que depuis `main` : relancer le workflow sur une autre branche ou un tag est refusé.

**Diagnostic OIDC** : le workflow manuel [`oidc-debug.yml`](.github/workflows/oidc-debug.yml) affiche les informations publiques du jeton OIDC (jamais le jeton lui-même) pour les comparer à la politique de confiance du rôle (voir [section 15.2](#152-premier-déploiement-refusé-par-aws-oidc)).

---

## 9. Monitoring et exploitation

### Logs centralisés (CloudWatch Logs)

- Groupe `/ecs/cigacount`, rétention 14 jours, pilote `awslogs`.
- Une ligne JSON par requête : `timestamp`, `level`, `message`, `method`, `path`, `status`, `durationMs`, `version`.
- Consultation en direct : `aws logs tail /ecs/cigacount --follow`.
- Requêtes **Logs Insights** utiles :

```
# Requêtes les plus lentes
fields @timestamp, method, path, status, durationMs
| filter message = "http_request"
| sort durationMs desc
| limit 20

# Répartition des codes HTTP
filter message = "http_request" | stats count(*) by status

# Erreurs
filter level = "error" | fields @timestamp, message, error, path | sort @timestamp desc
```

### Métriques et alarmes

| Alarme | Métrique | Seuil |
|---|---|---|
| `cigacount-no-healthy-task` | `HealthyHostCount` (ALB) | < 1 pendant 3 min → **service indisponible** |
| `cigacount-target-5xx` | `HTTPCode_Target_5XX_Count` | > 5 en 5 min |
| `cigacount-alb-5xx` | `HTTPCode_ELB_5XX_Count` | > 5 en 5 min |
| `cigacount-latency-p95` | `TargetResponseTime` p95 | > 1 s pendant 10 min |
| `cigacount-cpu-high` / `memory-high` | `CPUUtilization` / `MemoryUtilization` (ECS) | > 85 % pendant 15 min |
| `cigacount-application-errors` | `CigaCount/ApplicationErrors` (filtre `level = "error"` sur les logs) | ≥ 1 en 5 min |
| Budget `cigacount-monthly` | coût du compte | 80 % réel, 100 % prévu |

Toutes les alarmes notifient le topic SNS `cigacount-alerts` (e-mail). Un **dashboard** CloudWatch `cigacount` regroupe trafic, erreurs, latence, CPU/mémoire, tâches saines et derniers logs d'erreur (URL : sortie `dashboard_url`).

**Tester l'alerte de disponibilité** (arrêt volontaire du service, puis remise en route) :

```powershell
$target = @('--service-namespace', 'ecs', '--resource-id', 'service/cigacount-cluster/cigacount-service', '--scalable-dimension', 'ecs:service:DesiredCount')
aws application-autoscaling register-scalable-target @target --min-capacity 0 --max-capacity 3
aws ecs update-service --cluster cigacount-cluster --service cigacount-service --desired-count 0
# ... attendre l'e-mail "ALARM: cigacount-no-healthy-task" (~3-4 min), puis :
aws application-autoscaling register-scalable-target @target --min-capacity 1 --max-capacity 3
aws ecs update-service --cluster cigacount-cluster --service cigacount-service --desired-count 1
```

### Auto scaling

Le service passe de 1 à 3 tâches selon le CPU moyen (cible 60 %).

---

## 10. Destruction de l'environnement

```powershell
# Application et infrastructure (le bucket du state est conservé)
powershell -ExecutionPolicy Bypass -File .\scripts\destroy.ps1

# Tout, y compris le bucket du state Terraform
powershell -ExecutionPolicy Bypass -File .\scripts\destroy.ps1 -IncludeBootstrap
```

Équivalent manuel : `terraform -chdir=infra destroy` puis `terraform -chdir=infra/bootstrap destroy`.

La destruction est complète sans action dans la console : le dépôt ECR est supprimé avec ses images (`force_delete`), le bucket de state avec ses versions (`force_destroy`), l'ALB n'a pas de protection contre la suppression. Seules subsistent les révisions de *task definition* créées par la pipeline (gratuites) et le cache de build GitHub. Pensez aussi à supprimer les clés d'accès de l'utilisateur IAM `terraform-admin` s'il n'est plus utilisé.

---

## 11. Choix techniques

| Sujet | Choix | Justification |
|---|---|---|
| Application | Node.js 24 + Express, front-end en JS natif (modules ES) | Aucune étape de build, image légère, code métier testable côté Node et exécuté côté navigateur |
| Données | IndexedDB dans le navigateur | Données de santé qui ne quittent pas l'appareil ; conteneur sans état ; zéro coût de base |
| Image | Multi-stage `node:24-alpine`, dépendances de prod uniquement, npm supprimé, utilisateur non-root (uid 1000), `HEALTHCHECK` | Surface d'attaque réduite, démarrage rapide |
| Calcul | **ECS Fargate** | Pas de serveur à gérer (vs EC2), plus simple et moins cher qu'EKS pour un seul service |
| Point d'entrée | **Application Load Balancer** | Health checks, rolling update sans coupure, HTTPS via ACM, multi-AZ |
| Réseau | VPC dédié, 2 AZ, SG chaînés (Internet → ALB → tâches), SG par défaut sans règle | Moindre privilège réseau ; option NAT + sous-réseaux privés via une variable |
| IAM | Rôle d'exécution restreint à un dépôt ECR et un groupe de logs ; **pas de task role** ; rôle CI limité | Moindre privilège (pas de politique gérée `*`) |
| Registre | ECR, tags **immuables** = SHA du commit, scan à l'envoi, politique de rétention (15 images) | Traçabilité, sécurité, maîtrise du stockage |
| IaC | Terraform, state S3 chiffré/versionné avec **verrouillage natif** (`use_lockfile`), stack de bootstrap séparée | Travail en équipe sûr, sans DynamoDB |
| Tests IaC | `terraform test` avec **provider mocké** | Vérifie des règles (durcissement, HTTPS, NAT, identité OIDC) en CI, sans compte AWS |
| CI/CD | GitHub Actions + **OIDC** ; déploiement par nouvelle révision de *task definition* | Aucun secret long terme ; Terraform n'est pas exécuté en CI, donc le rôle CI n'a pas besoin de droits d'administration |
| Terraform vs pipeline | `ignore_changes = [task_definition, desired_count]` sur le service | La pipeline gère la version déployée et l'auto scaling le nombre de tâches, sans conflit avec Terraform |
| Supervision | CloudWatch Logs, filtre de métrique, alarmes, dashboard, SNS, AWS Budgets | Natif AWS, pas d'outil tiers à héberger |

---

## 12. Risques et améliorations pour la production

### Sécurité

| Risque | Situation actuelle | Amélioration envisagée |
|---|---|---|
| Trafic en clair | HTTP si aucun certificat n'est fourni | Nom de domaine + certificat ACM (déjà prévu par `certificate_arn`), HSTS |
| Exposition des tâches | Sans NAT, les tâches ont une IP publique (entrant bloqué par SG) | `enable_nat_gateway = true` (sous-réseaux privés) ou **VPC endpoints** ECR/S3/Logs pour supprimer tout accès Internet |
| Attaques applicatives / DDoS | ALB exposé sans filtrage | **AWS WAF** (règles managées, rate limiting), AWS Shield |
| Identifiants Terraform | Utilisateur IAM avec clés longue durée sur le poste | IAM Identity Center (SSO) + MFA, ou exécution de Terraform en CI via un rôle OIDC dédié avec approbation |
| Vulnérabilités de l'image | Scan basique ECR (rapport non bloquant) | Amazon Inspector (scan continu), blocage sur CVE critiques, image *distroless*, signature d'images |
| Traçabilité | Pas de journal d'audit dédié | CloudTrail, AWS Config, GuardDuty, ALB access logs, VPC Flow Logs |
| Données au repos | Logs chiffrés par défaut (clé AWS) | Clés KMS gérées par le client |

### Disponibilité

| Risque | Situation actuelle | Amélioration envisagée |
|---|---|---|
| Tâche unique | 1 tâche par défaut : une panne ou la perte d'une AZ interrompt le service quelques minutes | `min_capacity = 2` (une tâche par AZ) |
| NAT unique (si activé) | Un seul NAT gateway | Un NAT par AZ |
| Déploiement défaillant | Circuit breaker + rollback automatique, rolling update | Déploiement **blue/green** ou canary (CodeDeploy / ECS natif) avec tests automatiques |
| Région unique | Tout est en `eu-west-3` | Plan de reprise multi-région si nécessaire (Route 53 failover) |
| Données utilisateur | Stockées sur l'appareil : perte si le navigateur est effacé | Export proposé ; en production : synchronisation chiffrée (API + DynamoDB + Cognito) |

### Coûts

| Risque | Situation actuelle | Amélioration envisagée |
|---|---|---|
| Coûts fixes même sans trafic | ALB (~20 $/mois) + Fargate + IPv4 publiques | Détruire l'environnement hors démonstration ; Fargate Spot ; arrêt planifié hors heures ouvrées |
| NAT gateway | Désactivé par défaut (≈ 35 $/mois + trafic) | VPC endpoints ou NAT partagé |
| Croissance des logs et images | Rétention 14 j, 15 images max | Ajuster les rétentions, archiver vers S3 |
| Dérive budgétaire | Budget avec alertes à 80 % / 100 % | Budgets par tag de projet, *Cost Anomaly Detection* |
| Surdimensionnement | 0,25 vCPU / 512 Mo | Graviton (ARM64, ~20 % moins cher), *right-sizing* selon les métriques |

---

## 13. Estimation des coûts

Ordre de grandeur pour la configuration par défaut en `eu-west-3` (tarifs publics, hors offre gratuite) :

| Ressource | Coût mensuel approximatif |
|---|---|
| Application Load Balancer | ~ 18 à 20 $ |
| 1 tâche Fargate 0,25 vCPU / 0,5 Go | ~ 10 $ |
| Adresses IPv4 publiques (ALB + tâche) | ~ 11 $ |
| CloudWatch (7 alarmes, logs, dashboard) | ~ 1 à 4 $ |
| ECR, S3, SNS | < 1 $ |
| **Total** | **≈ 40 à 45 $/mois (≈ 1,5 $/jour)** |

➡️ Sur un compte AWS en **plan gratuit**, ce coût est prélevé sur les crédits offerts (≈ 2 mois en ligne pour 100 $ de crédits) : l'application reste accessible jusqu'à la correction, puis l'environnement est **détruit** (section 10). Surveiller le solde dans *Billing and Cost Management → Credits*.

---

## 14. Vidéo explicative

🎥 **Lien : à ajouter** (Loom ou YouTube en non répertorié).

Contenu de la vidéo :

1. Démonstration de l'application en ligne (onboarding, déclaration, objectifs, statistiques, coût, réglages).
2. Architecture AWS à partir du schéma.
3. Code : Dockerfile, fichiers Terraform (réseau, ALB, ECS, IAM, OIDC, monitoring), workflows GitHub Actions, logger et règles de calcul.
4. Démonstration du CD : modification du code, push sur `main`, pipeline, nouvelle version visible sur `/api/health`.
5. Exploitation : logs CloudWatch, dashboard, alarme déclenchée et e-mail reçu.
6. Risques, améliorations et destruction de l'environnement.

---

## 15. Journal de bord : difficultés et recherches

Traces des problèmes rencontrés pendant la réalisation, de leur diagnostic et de leur résolution. Les runs en échec restent visibles dans l'onglet *Actions* du dépôt.

### 15.1 Docker Desktop et la virtualisation

- **Symptôme** : Docker Desktop affichait « Virtualization support not detected » et `docker compose` ne trouvait pas le moteur (`npipe:////./pipe/docker_engine`).
- **Contexte** : poste Windows 10 Entreprise 22H2, processeur Intel Core i7-7700HQ.
- **Diagnostic** : `(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled` renvoyait `True` (VT-x actif dans le BIOS) mais `(Get-CimInstance Win32_ComputerSystem).HypervisorPresent` renvoyait `False` : l'hyperviseur Windows n'était pas lancé.
- **Résolution** (PowerShell administrateur, puis redémarrage) :
  ```powershell
  dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
  dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
  bcdedit /set hypervisorlaunchtype auto
  wsl --update
  ```

### 15.2 Premier déploiement refusé par AWS (OIDC)

- **Symptôme** : le premier run du workflow *Deploy* échouait à l'étape *Configure AWS credentials (OIDC)* avec « Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity ».
- **Hypothèses écartées** : variable `AWS_ROLE_ARN` erronée, audience (`aud`) incorrecte, run lancé depuis une autre branche que `main`.
- **Diagnostic** : un workflow temporaire (conservé : [`oidc-debug.yml`](.github/workflows/oidc-debug.yml)) a affiché les *claims* du jeton. GitHub émettait le `sub` au format avec identifiants immuables, `repo:Selimo17@114984615/CigaCount-03-Sp-DevOps-3-AWS-@1387317443:ref:refs/heads/main`, alors que la politique de confiance n'acceptait que `repo:Selimo17/CigaCount-03-Sp-DevOps-3-AWS-:ref:refs/heads/main`.
- **Résolution** : la condition `sub` accepte les deux formats (`StringLike`), avec les identifiants épinglés par `github_owner_id` et `github_repository_id` (aucun joker `*`), puis `terraform apply` depuis le poste (le rôle de la pipeline n'a volontairement pas le droit de modifier IAM). Test Terraform ajouté.

### 15.3 Permission manquante anticipée : `ecs:TagResource`

En lisant le code source de l'action `amazon-ecs-render-task-definition`, il est apparu qu'elle recopie les *tags* de la révision précédente. Enregistrer une *task definition* avec des tags exige `ecs:TagResource` : la permission a été ajoutée, limitée à la famille `cigacount` et à l'action `RegisterTaskDefinition`.

### 15.4 PowerShell : « No positional arguments are expected »

`terraform -chdir=infra init -backend-config=backend.hcl` échoue sous PowerShell, qui découpe l'argument au niveau du point. Il faut le mettre entre guillemets : `"-backend-config=backend.hcl"`. Les scripts `deploy.ps1` / `destroy.ps1` n'étaient pas concernés (arguments passés en tableau de chaînes).

### 15.5 Remplacement systématique de la *task definition*

Chaque `terraform plan` proposait de remplacer la *task definition* : ECS renvoie des valeurs par défaut (`hostPort`, listes vides `mountPoints`, `volumesFrom`, `systemControls`, `capabilities.add`) absentes de la configuration. La définition du conteneur est désormais écrite exactement comme ECS la renvoie.

### 15.6 Autres ajustements

- **Runners GitHub** : GitHub annonçait la migration du label `ubuntu-latest` vers Ubuntu 26 au 19 octobre 2026 ; les runners sont épinglés sur `ubuntu-24.04` pour éviter un changement pendant la période de correction.
- **Versions des actions** : les dernières versions ont été relevées avec `git ls-remote --tags`, et chaque action tierce est épinglée par SHA de commit.
- **Validation hors-ligne de Terraform** : `terraform test` avec provider AWS mocké. Les ressources mockées ont reçu des ARN réalistes, car le provider valide leur format.
- **Coût** : compte AWS en plan gratuit (crédits offerts). Configuration par défaut sans NAT gateway ni Container Insights, une seule tâche Fargate.

---

## 16. Sources consultées

**AWS**

- ECS – paramètres des *task definitions* : <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html>
- ECS – *deployment circuit breaker* : <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html>
- ECS – rôle d'exécution des tâches : <https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html>
- IAM – fournisseurs d'identité OIDC : <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html>
- CloudWatch Logs – syntaxe des filtres de métriques : <https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html>
- Application Load Balancer – health checks : <https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html>
- Offre gratuite et tarifs : <https://aws.amazon.com/free/>, <https://aws.amazon.com/fargate/pricing/>, <https://aws.amazon.com/elasticloadbalancing/pricing/>, <https://aws.amazon.com/vpc/pricing/>

**Terraform**

- Provider AWS : <https://registry.terraform.io/providers/hashicorp/aws/latest/docs>
- Backend S3 et verrouillage natif (`use_lockfile`) : <https://developer.hashicorp.com/terraform/language/backend/s3>
- Tests et providers mockés : <https://developer.hashicorp.com/terraform/language/tests/mocking>

**GitHub Actions**

- OpenID Connect avec AWS : <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services>
- Principe et *claims* du jeton OIDC : <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect>
- Actions AWS : <https://github.com/aws-actions/configure-aws-credentials>, <https://github.com/aws-actions/amazon-ecr-login>, <https://github.com/aws-actions/amazon-ecs-render-task-definition>, <https://github.com/aws-actions/amazon-ecs-deploy-task-definition>
- Migration du label `ubuntu-latest` : <https://github.com/actions/runner-images/issues/14748>
- actionlint : <https://github.com/rhysd/actionlint>

**Docker et Windows**

- Bonnes pratiques Dockerfile : <https://docs.docker.com/build/building/best-practices/>
- hadolint : <https://github.com/hadolint/hadolint>
- Docker Desktop sous Windows : <https://docs.docker.com/desktop/setup/install/windows-install/>
- Installation de WSL : <https://learn.microsoft.com/windows/wsl/install>

**Application**

- Express : <https://expressjs.com/> · Helmet : <https://helmetjs.github.io/>
- IndexedDB : <https://developer.mozilla.org/docs/Web/API/IndexedDB_API>
- `Intl.DateTimeFormat` (fuseaux horaires) : <https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat>
- Test runner Node.js : <https://nodejs.org/api/test.html>
- Tabac Info Service : <https://www.tabac-info-service.fr>
