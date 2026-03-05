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
│   │   ├── config/          # Config BDD, passport, etc.
│   │   ├── controllers/     # Logique métier par ressource
│   │   ├── middlewares/     # Auth JWT, gestion erreurs, etc.
│   │   ├── models/          # Modèles (wrappers Prisma)
│   │   ├── routes/          # Déclaration des endpoints
│   │   ├── services/        # Intégration analyseurs (Semgrep, TruffleHog…)
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
- PostgreSQL 15+
- npm 10+

### Backend

```bash
cd server
cp .env.example .env    # remplir les variables
npm install
npx prisma migrate dev  # crée les tables en BDD
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
DATABASE_URL="postgresql://user:password@localhost:5432/securescan"
JWT_SECRET=ton_secret_jwt
PORT=3000
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

---

## 🗃️ Base de données — Prisma + PostgreSQL

Le schéma Prisma est dans `server/prisma/schema.prisma`.

**3 modèles :**

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
  id           Int       @id @default(autoincrement())
  userId       Int
  user         User      @relation(fields: [userId], references: [id])
  repoUrl      String
  repoName     String?
  language     String?
  analyzers    String[]
  status       String    @default("pending")  // pending | running | completed | failed
  score        Int?
  vulnCritical Int       @default(0)
  vulnHigh     Int       @default(0)
  vulnMedium   Int       @default(0)
  vulnLow      Int       @default(0)
  secretsCount Int       @default(0)
  filesTotal   Int       @default(0)
  resultsJson  Json?
  isFavorite   Boolean   @default(false)
  createdAt    DateTime  @default(now())
  completedAt  DateTime?
  fixes        VulnFix[]
}

model VulnFix {
  id        Int      @id @default(autoincrement())
  scanId    Int
  scan      Scan     @relation(fields: [scanId], references: [id])
  ruleId    String
  filePath  String
  lineStart Int
  fixedAt   DateTime @default(now())
}
```

> `resultsJson` stocke les résultats bruts de tous les analyseurs — le frontend filtre et affiche en mémoire.

---

## 🔌 API REST — Endpoints

### Auth

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Inscription email/password |
| POST | `/api/auth/login` | Connexion → JWT |
| GET | `/api/auth/github` | OAuth GitHub redirect |
| GET | `/api/auth/github/callback` | Callback GitHub |

### Scans

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/scans` | Lancer un nouveau scan |
| GET | `/api/scans` | Liste des scans de l'utilisateur |
| GET | `/api/scans/:id` | Détail d'un scan |
| PATCH | `/api/scans/:id/favorite` | Toggle favori ⭐ |
| DELETE | `/api/scans/:id` | Supprimer un scan |

### Vulnérabilités & Fixes

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/scans/:id/vulns` | Liste des vulnérabilités |
| POST | `/api/scans/:id/fixes` | Enregistrer un fix appliqué |

### Rapports

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/scans/:id/report/pdf` | Générer rapport PDF |
| GET | `/api/scans/:id/report/html` | Générer rapport HTML |

---

## 🔍 Analyseurs — Intégration

### Semgrep

```bash
semgrep --config=auto --json <chemin_repo>
```

Extraction de `results[]` → `check_id`, `path`, `start.line`, `severity`, `message`.

### ESLint Security

Plugin `eslint-plugin-security` lancé programmatiquement sur les fichiers JS/TS du repo cloné.

### npm audit

```bash
npm audit --json
```

Extraction de `vulnerabilities` → `severity`, `name`, `via`.

### TruffleHog

```bash
trufflehog filesystem <chemin_repo> --json
```

Détection de secrets dans les fichiers et l'historique Git.

### Bandit (Python)

```bash
bandit -r <chemin_repo> -f json
```

Utilisé uniquement si des `.py` sont détectés dans le repo scanné.

---

## 🧱 Architecture frontend — Next.js + TypeScript

```
front/src/
├── app/                     # App Router Next.js (pages et layouts)
│   ├── layout.tsx
│   ├── page.tsx             # Accueil / formulaire de scan
│   ├── dashboard/
│   ├── results/
│   ├── report/
│   └── auth/
├── components/
│   ├── layout/              # Sidebar, Navbar
│   ├── scan/                # ScanForm, ScanCard, ScanStatus
│   ├── vulns/               # VulnList, VulnDetail, SeverityBadge
│   └── charts/              # ScoreGauge, OwaspChart
├── services/
│   ├── api.ts               # Fetch/Axios + interceptors JWT
│   ├── scans.ts
│   └── auth.ts
└── types/
    └── index.ts
```

---

## 🔐 Authentification

- JWT stocké côté client
- Header `Authorization: Bearer <token>` sur chaque requête API
- OAuth GitHub via `passport-github2` côté serveur (`app.js`)

---

## 🎨 Design

> 🔗 [Figma](https://www.figma.com/design/tk9NicbQPEJ2HZPZHk80Hr/SecureScan)

Pages maquettées (wireframe + couleur dark mode) :
- Connexion
- Accueil (formulaire scan)
- Dashboard connecté / non connecté
- Résultats
- Rapport

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

### Branches

```
feature/backend/<nom>
feature/frontend/<nom>
fix/backend/<nom>
fix/frontend/<nom>
chore/<nom>
```

### Répartition

| Personne | Périmètre |
|---|---|
| Dev Backend A | Auth, scan controller, API REST |
| Dev Backend B | Intégration analyseurs, jobs async, rapport |
| Dev Frontend | Pages Next.js, composants, appels API |

---

## 🚨 Points de vigilance

- **Ne jamais commit le `.env`** (déjà dans `.gitignore`)
- **Toujours rebase sur `dev`** avant d'ouvrir une PR
- **Ne jamais pousser directement sur `main`**
- Les scans sont longs → **polling** côté frontend sur le statut (`pending` → `running` → `completed`)
- Le clonage de repo côté serveur est une surface d'attaque → sandbox + timeout obligatoire

---

## 📦 Releases

| Version | Date | Notes |
|---|---|---|
| v1.1.0 | 04/03/2026 | [GitHub Releases](https://github.com/wicra/SecureScan/releases/tag/v1.1.0) |
| v1.0.0 | 02/03/2026 | Release initiale |

---

*Hackathon IPSSI 2026 — [wicra/SecureScan](https://github.com/wicra/SecureScan)*
