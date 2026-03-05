# 📘 Documentation_Technique — SecureScan

> Documentation technique interne — Hackathon IPSSI 2026

---

## 🗂️ Structure du monorepo

```
SecureScan/
├── front/                   # Next.js + TypeScript
│   ├── public/
│   ├── src/
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   └── tsconfig.json
│
├── server/                  # Node.js + Express + Prisma
│   ├── prisma/              # schema.prisma + migrations
│   ├── src/
│   │   ├── config/          # Config BDD, passport, variables
│   │   ├── controllers/     # AuthController, ScanController
│   │   ├── middlewares/     # optionalAuth, ValidateMW, ErrorMW
│   │   ├── models/          # User, Scan, Vulnerability, Report
│   │   ├── routes/          # Déclaration des endpoints
│   │   ├── services/        # ScannerService, SemgrepService, GitService,
│   │   │                    # EslintService, NpmAuditService, TrufflehogService,
│   │   │                    # GitleaksService, ScoreService, AIService
│   │   ├── utils/           # Fonctions utilitaires
│   │   ├── index.js         # Démarrage du serveur
│   │   └── seed-demo.js     # Données de démo
│   ├── app.js               # Config Express (middlewares globaux)
│   └── .env.example
│
├── design/                  # Maquettes Figma (wireframes + couleur)
├── .gitignore
├── README.md
└── README-dev.md
```

---

## ⚙️ Setup développement

### Prérequis

- Node.js 20+
- MySQL 8+
- npm 10+

### Backend

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev
node src/seed-demo.js   # optionnel
npm run dev             # → http://localhost:3000
```

### Frontend

```bash
cd front
npm install
npm run dev             # → http://localhost:3001
```

---

## 🔧 Variables d'environnement — `server/.env`

```env
DATABASE_URL="mysql://user:password@localhost:3306/securescan"
JWT_SECRET=ton_secret_jwt
PORT=3000
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

---

## 🗃️ Base de données — MySQL via Prisma

Le schéma Prisma est dans `server/prisma/schema.prisma`.

### Modèles

```prisma
model User {
  id           Int      @id @default(autoincrement())
  name         String?
  email        String   @unique
  passwordHash String?
  githubId     String?
  avatarUrl    String?
  role         String   @default("analyste")  // analyste | admin
  createdAt    DateTime @default(now())
  scans        Scan[]
}

model Scan {
  id              Int             @id @default(autoincrement())
  userId          Int
  user            User            @relation(fields: [userId], references: [id])
  url             String
  repoName        String?
  language        String?
  status          String          @default("pending") // pending|running|completed|failed
  score           Int?
  vulnCritical    Int             @default(0)
  vulnHigh        Int             @default(0)
  vulnMedium      Int             @default(0)
  vulnLow         Int             @default(0)
  secretsCount    Int             @default(0)
  filesTotal      Int             @default(0)
  resultsJson     Json?
  isFavorite      Boolean         @default(false)
  createdAt       DateTime        @default(now())
  completedAt     DateTime?
  vulnerabilities Vulnerability[]
  reports         Report[]
}

model Vulnerability {
  id        Int       @id @default(autoincrement())
  scanId    Int
  scan      Scan      @relation(fields: [scanId], references: [id])
  ruleId    String?
  filePath  String?
  lineStart Int?
  severity  String?   // critical | high | medium | low
  message   String?
  owasp     String?
  fix       String?
  isFixed   Boolean   @default(false)
  fixedAt   DateTime?
}

model Report {
  id          Int      @id @default(autoincrement())
  scanId      Int
  scan        Scan     @relation(fields: [scanId], references: [id])
  htmlContent String?  @db.LongText
  pdfPath     String?
  createdAt   DateTime @default(now())
}
```

---

## 🏗️ Architecture backend — Classes principales

### Controllers

**AuthController**
- `register(req, res, next)`
- `login(req, res, next)`
- `githubCallback(req, res, next)`
- `getMe(req, res, next)`
- `generateToken(user)`

**ScanController**
- `createScan(req, res)` — valide l'URL, crée le scan en BDD, déclenche `ScannerService`
- `addScan(req, res, next)`
- `getScanStatus(req, res, next)`
- `getScanById(req, res, next)`
- `getScans(req, res, next)`
- `getSuggestedFixes(req, res, next)`
- `deleteScan(req, res, next)`
- `getTATStats(req, res, next)`
- `generateReport(req, res, next)`

### Middlewares

**AuthMiddleware** — vérifie le JWT et injecte `req.user`  
**ValidateMiddleware** — valide les body/params avec un schéma Joi  
**ErrorMiddleware** — handler global d'erreurs → `handleError(err, req, res, next)`

### Services

**GitService**  
- Clone le repo avec `git clone --depth 500`
- Détecte le langage via `detectLanguage(repoPath)`
- Nettoie le repo après analyse `cleanup(repoPath)`

**ScannerService**  
- Orchestre tous les analyseurs en parallèle
- `runScan(repoPath)` → appelle Semgrep, ESLint, npm audit, TruffleHog, Gitleaks
- Agrège les findings, calcule le score, catégorise par OWASP
- Insère les vulnérabilités en BDD via `Vulnerability.createMany()`
- Met à jour le statut du scan : `pending → running → completed`

**SemgrepService**  
Commande : `semgrep --config auto --format json/semlint --format json/trufflehog filesystem --json`  
- Remapping OWASP 2021 → OWASP 2025
- Score CVSS par sévérité
- Pénalités plafonnées par sévérité : critical 20pt cap 40, high 10pt cap 40, medium 3pt cap 10, low 0.8pt cap 5

**EslintService**  
- `ESLINT_ENTRY`, `ESLINT_ENV_JS`, `ESLINT_BROWSER_EB`, `PARAMETERS_FOR_INT`, `PARAMETERS_FOR_UPT`, `PAR_SCAN_STR`
- `eslintScanContent('filePath, lineStart, lineEnd, fullCode)'`
- `formatRuleId(rule)`

**NpmAuditService**  
- `ESLINT_ENV_NMP`, `ESLINT_MMP`
- `runNpmAudit()` — exécute `npm audit --json`
- `formatNpmVulns(vulns, main, source)` — normalise les résultats

**TrufflehogService**  
- `CRITICAL_DETECTORS` — liste des détecteurs critiques
- `extractSecrets(repo)` — exécute TruffleHog filesystem
- `filterResults(after, finalOutputFormat)` — filtre les faux positifs
- `rankSecrets(scanRes, mainSecret)` — classe par criticité

**GitleaksService**  
- `scan(url, repoId, fillings)` — scan Git history
- `validateScan(items)` — validation des findings
- `normalizeScore(fillings)` — normalise les scores

**ScoreService**  
- `calculateScore(vulns)` — calcule le score /100
- `categorizeScores(specificVulns)` — regroupe par catégorie OWASP
- `scanCompleteSetResults(vulns)` — finalise les résultats
- `categorizesAtNbsReportes` — compte par sévérité

**AIService**  
- Modèles : `AVAILABLE_MODELS`
- `getModelById(id)` — sélectionne le modèle IA
- `getModelPriorityQueue()` — file de priorité des modèles
- `getSuggestedFix(vuln, context, model)` — génère un fix IA
- `calculateCost(input, output)` — calcule le coût d'inférence

**UploadService**  
- `saveUploadedFiles(filename)` — sauvegarde les fichiers uploadés
- `checkPath(path)` — vérifie le chemin

---

## 🔌 API REST — Endpoints

### Auth

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Inscription email/password |
| POST | `/api/auth/login` | Connexion → JWT |
| GET | `/api/auth/github` | OAuth GitHub redirect |
| GET | `/api/auth/github/callback` | Callback GitHub |
| GET | `/api/auth/me` | Profil utilisateur connecté |

### Scans

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/scans` | Lancer un nouveau scan (URL Git) |
| GET | `/api/scans` | Liste des scans de l'utilisateur |
| GET | `/api/scans/:id` | Détail + statut d'un scan |
| GET | `/api/scans/:id/fixes` | Suggestions de fix IA |
| DELETE | `/api/scans/:id` | Supprimer un scan |
| GET | `/api/scans/stats` | Statistiques TAT |
| GET | `/api/scans/:id/report` | Générer rapport PDF/HTML |

---

## 🔄 Flux d'un scan (séquence)

```
Utilisateur → POST /api/scans (url, analyzers)
  → optionalAuth()
  → ValidateMW validateUrlSchema()
  → ScanController.createScan()
    → GitService.extractRepoName(url)
    → GitService.cloneRepo(url, repoPath)        # git clone --depth 500
    → ScanModel.create({ userId, url, status: "pending" })
    → ScannerService.markAsRunning(scanId)        # UPDATE status = running
    → GitService.readPath(repoPath)
    → GitService.detectLanguage(repoPath)
    → ScanModel.updateLanguage(scanId, language)  # UPDATE SET language
    → ScannerService.runScan(repoPath)
      → Semgrep + ESLint + npm audit + TruffleHog + Gitleaks (parallèle)
      → ScoreService.calculateScore(vulns)        # score /100, pénalités plafonnées
      → ScoreService.categorizeScores(vulns)      # catégories OWASP
      → ScoreService.scanCompleteSetResults(vulns)
      → ScoreService.categorizesAtNbsReportes
    → ScanModel.filesSaved(repoPath)
    → ScanModel.applyTransition(id, status)
    → ScanModel.insertVulnerabilities(id, vulns)  # INSERT INTO vulnerabilities
    → GitService.cleanup(repoPath)                # fs.rmSync récursif
← 201 scan{id, score, grade, nb_vulns}
Utilisateur ← redirect dashboard avec résultats complets
```

---

## 🎨 Architecture frontend — Next.js + TypeScript

```
front/src/
├── app/                     # App Router Next.js
│   ├── layout.tsx
│   ├── page.tsx             # Accueil / formulaire scan
│   ├── dashboard/           # Dashboard résultats
│   ├── results/             # Détail vulnérabilités
│   ├── report/              # Rapport PDF/HTML
│   └── auth/                # Login / Register
├── components/
│   ├── layout/              # Sidebar, Navbar
│   ├── scan/                # ScanForm, ScanCard, ScanStatus
│   ├── vulns/               # VulnList, VulnDetail, SeverityBadge
│   └── charts/              # ScoreGauge, OwaspChart
├── services/
│   ├── api.ts               # Fetch + interceptors JWT
│   ├── scans.ts
│   └── auth.ts
└── types/
    └── index.ts
```

---

## 👤 User Journey — Actions disponibles

**Cas d'utilisation — Scan depuis la page d'accueil**
- Entrer une URL Git et cliquer Lancer
- Scanner un dépôt Git (status : pending)
- Voir les analyseurs partager leur résultat côté serveur
- Voir le score calculé via les formules
- Afficher les résultats

**Authentification**
- Se connecter via GitHub OAuth
- Se connecter par email / mot de passe
- Si pas de compte : Création de compte

**Rapport**
- Visualiser le rapport format texte
- Télécharger/exporter le rapport HTML
- Télécharger/exporter le rapport PDF (en cours)

**Scan depuis la page**
- Scan avec les 20 fichiers les plus vulnérables
- Suivre la progression du scan en temps réel
- Scanner un dépôt Git (status : pending)
- Scanner et corriger une erreur de 20+ scans actifs

**Dashboard**
- Ajout des informations non présentes Faculty
- Mettre à jour son profil/son compte
- Supprimer un scan
- Naviguer vers le détail des résultats à la demande
- Voir les statistiques temporelles actifNG
- Go to scan

**Résultats**
- Consulter la liste des vulnérabilités de l'OWASP Top 10
- Consulter les failles selon le taux de résolution (%)
- Voir les catégories filtrées à la demande
- Déposer et filtrer sur le score CVSS en temps réel
- Copier et filtrer les technologies (par filtres, sévérité, contenu)
- Naviguer vers les fixes suggérés pour une vulnérabilité

**Analyse automatique**
- Détecter le langage

---

## 🚨 Points de vigilance

- **Ne jamais commit le `.env`** (déjà dans `.gitignore`)
- **Toujours rebase sur `dev`** avant d'ouvrir une PR
- **Ne jamais pousser directement sur `main`**
- Les scans sont longs → **polling** côté frontend sur le statut (`pending → running → completed`)
- Le clonage de repo côté serveur est une surface d'attaque → `--depth 500` + cleanup `fs.rmSync` récursif obligatoire
- Score plafonné par sévérité : critical −20pt cap 40, high −10pt cap 40, medium −3pt cap 10, low −0.8pt cap 5

---

## 🌿 Convention Git

### Commits

```
feat(backend): add semgrep runner
fix(frontend): correct scan status polling
chore(db): update prisma schema
```

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Config, deps, docs |
| `refactor` | Refacto sans impact fonctionnel |

### Répartition

| Personne | Périmètre |
|---|---|
| Dev Backend A | Auth, ScanController, API REST, middlewares |
| Dev Backend B | ScannerService, analyseurs, ScoreService, AIService |
| Dev Frontend | Pages Next.js, composants, appels API |

---

## 📦 Releases

| Version | Date | Notes |
|---|---|---|
| v1.1.0 | 04/03/2026 | [GitHub Releases](https://github.com/wicra/SecureScan/releases/tag/v1.1.0) |
| v1.0.0 | 02/03/2026 | Release initiale |

---

*Hackathon IPSSI 2026 — [wicra/SecureScan](https://github.com/wicra/SecureScan)*
