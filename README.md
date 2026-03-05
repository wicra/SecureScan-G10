# 🛡️ SecureScan

> **Hackathon IPSSI 2026** — Semaine du 2 au 6 mars 2026  
> Plateforme web d'analyse de qualité & sécurité de code, basée sur l'OWASP Top 10.

---

## 📌 C'est quoi ?

SecureScan est une **plateforme web** qui analyse automatiquement le code d'un dépôt Git à la recherche de **failles de sécurité**.

L'idée est simple :

1. Tu entres l'URL d'un repo Git (ou tu uploades ton code)
2. La plateforme lance des outils d'analyse en arrière-plan
3. Elle affiche un **dashboard clair** avec les vulnérabilités détectées, classées selon l'OWASP Top 10
4. Elle propose des **corrections automatiques** pour les failles courantes
5. Elle génère un **rapport PDF/HTML** prêt à être présenté

---

## ⚙️ Stack technique

| Couche | Technologie |
| --- | --- |
| Frontend | **Next.js** + TypeScript |
| Backend | **Node.js** (Express) + JavaScript |
| ORM / BDD | **Prisma** + PostgreSQL |
| Analyseurs | Semgrep, ESLint Security, npm audit, TruffleHog, Bandit |

> 📦 Frontend et backend sont dans le **même dépôt** (monorepo).

---

## 🗂️ Structure du projet

```
SecureScan/
│
├── front/                   # 🎨 Frontend Next.js + TypeScript
│   ├── public/
│   ├── src/
│   ├── next.config.ts
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   └── tsconfig.json
│
├── server/                  # 🔧 Backend Node.js / Express
│   ├── prisma/              # schema.prisma + migrations
│   ├── src/
│   │   ├── config/          # Config BDD, passport…
│   │   ├── controllers/     # Logique métier
│   │   ├── middlewares/     # Auth JWT, gestion erreurs
│   │   ├── models/          # Wrappers Prisma
│   │   ├── routes/          # Endpoints API
│   │   ├── services/        # Analyseurs (Semgrep, TruffleHog…)
│   │   ├── utils/           # Fonctions utilitaires
│   │   ├── index.js         # Démarrage serveur
│   │   └── seed-demo.js     # Données de démo
│   ├── app.js               # Config Express
│   └── .env.example
│
├── design/                  # 🎨 Maquettes wireframes + couleur
├── .gitignore
├── README-dev.md
└── README.md
```

---

## 🗃️ Base de données — PostgreSQL via Prisma

**3 modèles principaux.** Les résultats d'analyse sont stockés en JSON brut dans `scans` et parsés côté frontend. Seuls les fixes confirmés sont persistés.

```
users
  id, name, email, password_hash, github_id, avatar_url, role, created_at

scans
  id, user_id → users
  repo_url, repo_name, language, analyzers
  status (pending | running | completed | failed)
  score, vuln_critical, vuln_high, vuln_medium, vuln_low
  secrets_count, files_total
  results_json  ← résultats bruts de tous les analyseurs (JSONB)
  is_favorite, created_at, completed_at

vuln_fixes
  id, scan_id → scans
  rule_id, file_path, line_start, fixed_at
```

> Les rapports PDF/HTML sont **générés à la demande** depuis `results_json`, non stockés en base.

---

## 🚀 Lancer le projet

```bash
# 1. Cloner le repo
git clone https://github.com/wicra/SecureScan.git
cd SecureScan

# 2. Backend
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev        # → http://localhost:3000

# 3. Frontend (autre terminal)
cd ../front
npm install
npm run dev        # → http://localhost:3001
```

---

## 🔍 Analyseurs intégrés

| Outil | Rôle |
| --- | --- |
| **Semgrep** | Analyse statique (SAST), 30+ langages |
| **ESLint Security** | Détection de patterns dangereux en JS/TS |
| **npm audit** | Audit des dépendances Node.js |
| **TruffleHog** | Détection de secrets dans l'historique Git |
| **Bandit** | Analyse de sécurité Python |

---

## 🎨 Design

> 🔗 **[Accéder au projet Figma](https://www.figma.com/design/tk9NicbQPEJ2HZPZHk80Hr/SecureScan)**

Pages maquettées : Connexion, Accueil, Dashboard (connecté / non connecté), Résultats, Rapport.  
Wireframes + UI haute fidélité dark mode disponibles dans [`design/`](./design/).

---

## 📊 Critères d'évaluation

| Critère | Poids |
| --- | --- |
| Technique | 40 % |
| Sécurité OWASP | 25 % |
| UX & Rendu | 20 % |
| Travail d'équipe | 15 % |

---

## 🌿 Stratégie Git

### Branches principales

| Branche | Rôle |
| --- | --- |
| `main` | 🚀 Production — stable, prêt à présenter. Merge via PR uniquement. |
| `dev` | 🔧 Développement — intégration commune. Toutes les features mergent ici. |

> **Règle d'or :** on ne pousse **jamais** directement sur `main`.

### Convention de branches

```
feature/backend/<nom>
feature/frontend/<nom>
fix/backend/<nom>
fix/frontend/<nom>
chore/<nom>
```

### Workflow quotidien

```bash
git checkout dev && git pull origin dev
git checkout -b feature/backend/ma-feature

git add . && git commit -m "feat(backend): description"
git rebase origin/dev
git push -u origin feature/backend/ma-feature
# → PR vers dev
```

---

## 🤝 Contribuer

1. Toujours partir de `dev` à jour
2. Créer sa branche depuis `dev`
3. Commiter avec des messages clairs (`feat:`, `fix:`, `chore:`)
4. Rebase sur `dev` avant de pusher
5. Ouvrir une **Pull Request vers `dev`**, jamais vers `main`
6. Faire relire par au moins 1 autre membre

---

*Hackathon IPSSI 2026 — [Page du sujet](https://biynlearning.academy/hackathon-securescan.html)*
