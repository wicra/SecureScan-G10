# 🛡️ SecureScan

> **Hackathon IPSSI 2026** — Semaine du 2 au 6 mars 2026  
> Plateforme web d'analyse de sécurité de code, basée sur l'OWASP Top 10 2025.

---

## 📌 Présentation

SecureScan permet d'analyser automatiquement un dépôt de code source à la recherche de failles de sécurité. L'utilisateur entre une URL Git ou uploade un ZIP — la plateforme orchestre plusieurs outils d'analyse open source, agrège les résultats et les présente dans un dashboard exploitable.

**Fonctionnalités clés :**
- Scan via URL Git ou upload ZIP (max 1 go)
- 4 analyseurs lancés en parallèle (Semgrep, ESLint Security, npm audit, TruffleHog)
- Score de sécurité /100 + grade A→F
- Vulnérabilités classées par sévérité et mappées sur l'OWASP Top 10 2025
- Corrections de code générées par IA (OpenRouter / Gemma 3)
- Export rapport PDF/HTML
- Scan anonyme possible — compte optionnel pour accéder au détail

---

## ⚙️ Stack technique

| Couche | Technologie | Pourquoi |
| --- | --- | --- |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS | SSR, routing App Router, typage fort |
| Backend | Node.js + Express | Léger, async natif, adapté aux processus externes |
| ORM / BDD | Prisma 5 + MySQL 8 | Migrations auto, schéma typé, requêtes simples |
| Analyseurs | Semgrep, ESLint Security, npm audit, TruffleHog | Open source, multi-langages, JSON output |
| IA | OpenRouter (Gemma 3 27B — gratuit) | Fix de code on-demand, zéro coût |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Utilisateur                              │
│               (URL Git ou upload ZIP)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Frontend — Next.js :3000                      │
│  page.tsx (scan) · dashboard · results · report · login         │
│  lib/api.ts → appels fetch + JWT Bearer                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API /api/*
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend — Express :3001                       │
│                                                                 │
│  optionalAuth → validate(Zod) → ScanController                  │
│                                                                 │
│  ScanController                                                 │
│    ├── GitService          → git clone --depth 500              │
│    ├── ScannerService      → Promise.all([...])                 │
│    │     ├── SemgrepService     semgrep --config auto --json    │
│    │     ├── EslintService      eslint-plugin-security          │
│    │     ├── NpmAuditService    npm audit --json                │
│    │     └── TrufflehogService  trufflehog filesystem --json    │
│    ├── OwaspService        → mapping résultats → OWASP 2025     │
│    ├── ScoreService        → calcul score /100 + grade          │
│    └── AiService           → fix IA on-demand (OpenRouter)      │
│                                                                 │
└──────────────┬──────────────────────────────────────────────────┘
               │ Prisma
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MySQL 8 — Base de données                     │
│   users · scans · vulnerabilities                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗃️ Schéma de base de données

```
┌──────────────┐         ┌─────────────────────────────┐
│    users     │  1 ─── N│           scans              │
├──────────────┤         ├─────────────────────────────┤
│ id           │         │ id                           │
│ name         │         │ userId (FK, nullable)        │
│ email        │         │ repoUrl                      │
│ passwordHash │         │ repoName                     │
│ githubId     │         │ language                     │
│ avatarUrl    │         │ status (pending|running|      │
│ role         │         │         completed|failed)    │
│ createdAt    │         │ score (0-100)                 │
└──────────────┘         │ vulnTotal / Critical /        │
                         │ High / Medium / Low           │
                         │ secretsCount                  │
                         │ filesTotal / filesImpacted    │
                         │ isFavorite                    │
                         │ createdAt / completedAt       │
                         └──────────────┬──────────────┘
                                        │ 1 ─── N
                         ┌──────────────▼──────────────┐
                         │      vulnerabilities         │
                         ├─────────────────────────────┤
                         │ id                           │
                         │ scanId (FK)                  │
                         │ tool (semgrep|eslint|…)      │
                         │ title                        │
                         │ severity (critical|high|…)   │
                         │ owaspCategory (A01:2025…)    │
                         │ filePath / lineStart / lineEnd│
                         │ ruleId                       │
                         │ codeSnippet                  │
                         │ fixSuggestion (IA, cached)   │
                         │ cvssScore                    │
                         │ isFixed                      │
                         └─────────────────────────────┘
```

> `userId` est nullable : les scans anonymes sont autorisés. Après connexion, le scan est rattaché via `PATCH /api/scans/:id/claim`.

---

## 🗺️ Mapping OWASP Top 10 2025

Les résultats bruts des analyseurs sont normalisés puis mappés sur l'OWASP Top 10 2025 par `OwaspService` via deux mécanismes :

**1. Remapping OWASP 2021 → 2025** (les catégories ont bougé entre les deux versions) :

| OWASP 2021 | OWASP 2025 |
| --- | --- |
| A01 — Broken Access Control | A01 — Broken Access Control *(inchangé)* |
| A02 — Cryptographic Failures | A04 — Cryptographic Failures |
| A03 — Injection | A05 — Injection |
| A04 — Insecure Design | A06 — Insecure Design |
| A05 — Security Misconfiguration | A02 — Security Misconfiguration *(monte)* |
| A06 — Vulnerable Components | A03 — Software Supply Chain Failures |
| A07 — Auth Failures | A07 — Authentication Failures |
| A08 — Integrity Failures | A08 — Software or Data Integrity Failures |
| A09 — Logging Failures | A09 — Security Logging & Alerting Failures |
| A10 — SSRF | A01 — Broken Access Control *(intégré)* |

**2. Matching par regex sur le `ruleId`** pour les résultats sans catégorie explicite :

| Pattern | Catégorie OWASP 2025 |
| --- | --- |
| `sqli`, `sql.inject`, `eval-with`, `xss`, `path.travers` | A05 — Injection |
| `aws`, `api.key`, `github.token`, `private.key`, `md5` | A04 — Cryptographic Failures |
| `CVE-XXXX`, `npm.audit`, `prototype.pollution` | A03 — Supply Chain |
| `cors.wildcard`, `helmet`, `xxe`, `debug.enabled` | A02 — Security Misconfiguration |
| `ssrf`, `open.redirect`, `idor` | A01 — Broken Access Control |
| `jwt`, `session.fixation`, `hardcode.credential` | A07 — Authentication Failures |
| *(non reconnu)* | A10 — Mishandling of Exceptional Conditions |

**Score CVSS par défaut** (si l'analyseur ne fournit pas de score) :

| Sévérité | CVSS par défaut |
| --- | --- |
| Critical | 9.8 |
| High | 7.5 |
| Medium | 5.0 |
| Low | 3.0 |

---

## 📊 Calcul du score de sécurité

```
Score = max(0, 100 − Σ pénalités plafonnées)
```

| Sévérité | Pénalité / vulnérabilité | Plafond par sévérité |
| --- | --- | --- |
| Critical | −20 pts | max −40 pts |
| High | −10 pts | max −40 pts |
| Medium | −2 pts | max −15 pts |
| Low | −0.5 pts | max −5 pts |

**Grade :** ≥80 → A · ≥60 → B · ≥40 → C · ≥20 → D · <20 → F

---

## 🚀 Installation et lancement

### Prérequis

- Node.js 20+, npm 10+
- MySQL 8+
- Semgrep : `pip install semgrep`
- TruffleHog : [github.com/trufflesecurity/trufflehog/releases](https://github.com/trufflesecurity/trufflehog/releases)

### Backend

```bash
cd server
cp .env.example .env
# Remplir DATABASE_URL et JWT_SECRET dans .env
npm install
npx prisma migrate dev    # Crée les tables MySQL
node src/seed-demo.js     # Optionnel : 3 scans de démo
npm run dev               # → http://localhost:3001
```

### Frontend

```bash
cd front
npm install
npm run dev               # → http://localhost:3000
```

### Variables d'environnement requises (`server/.env`)

```env
DATABASE_URL="mysql://root:password@localhost:3306/securescan"
JWT_SECRET=chaine_aleatoire_longue
PORT=3001

# Optionnels
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:3001/api/auth/github/callback
OPENROUTER_API_KEY=        # Pour les corrections IA
TMP_SCAN_DIR=./tmp
```

> Générer `JWT_SECRET` : `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## 🎨 Design & Maquettes

> 🔗 **[Projet Figma](https://www.figma.com/design/tk9NicbQPEJ2HZPZHk80Hr/SecureScan)**

Wireframes + UI haute fidélité dark mode disponibles dans [`design/`](./design/).  
Pages : Connexion · Accueil · Dashboard · Résultats · Rapport

---

## 🌿 Workflow Git

| Branche | Rôle |
| --- | --- |
| `main` | Production — merge via PR uniquement |
| `dev` | Intégration — toutes les features mergent ici |

```bash
git checkout dev && git pull origin dev
git checkout -b feature/backend/ma-feature
git commit -m "feat(backend): description"
git rebase origin/dev
git push -u origin feature/backend/ma-feature
# → PR vers dev, jamais directement sur main
```

---

*Hackathon IPSSI 2026 — [Page du sujet](https://biynlearning.academy/hackathon-securescan.html)*
