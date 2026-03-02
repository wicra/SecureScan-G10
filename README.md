# 🛡️ SecureScan

> **Hackathon IPSSI 2026** — Semaine du 2 au 6 mars 2026  
> Plateforme web d'analyse de sécurité de code, basée sur l'OWASP Top 10.

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

| Couche      | Technologie              |
|-------------|--------------------------|
| Frontend    | **React** (Vite)         |
| Backend     | **Node.js** (Express)    |
| Base de données | **PostgreSQL**       |
| Analyseurs  | Semgrep, ESLint Security, npm audit, TruffleHog, Bandit |

> 📦 Le frontend et le backend sont dans le **même dépôt** (monorepo).

---

## 🗂️ Structure du projet

```
SecureScan/
│
├── client/                  # 🎨 Frontend React
│   ├── public/
│   └── src/
│       ├── components/      # Composants réutilisables
│       ├── pages/           # Dashboard, Scan, Rapport…
│       ├── services/        # Appels API vers le backend
│       └── App.jsx
│
├── server/                  # 🔧 Backend Node.js / Express
│   ├── routes/              # Endpoints API REST
│   ├── controllers/         # Logique métier
│   ├── services/            # Intégration des analyseurs
│   │   ├── semgrep.js
│   │   ├── eslint.js
│   │   ├── npmAudit.js
│   │   └── trufflehog.js
│   ├── models/              # Modèles BDD
│   └── index.js
│
├── .env.example             # Variables d'environnement
├── docker-compose.yml       # Lancement de tout l'environnement
├── package.json             # Racine du monorepo
└── README.md
```

---

## 🗃️ Base de données — PostgreSQL

5 tables, déduites directement des écrans de la maquette.

```
┌─────────────────────┐
│        users        │  ← Page Login + sidebar avatar
├─────────────────────┤
│ id          SERIAL  │
│ name        VARCHAR │  "Alice Martin"
│ email       VARCHAR │  utilisé au login
│ password_hash TEXT  │  bcrypt
│ github_id   VARCHAR │  OAuth "Continuer avec GitHub"
│ avatar_url  TEXT    │
│ role        VARCHAR │  'analyste' | 'admin'
│ created_at  TIMESTAMP
└────────┬────────────┘
         │ 1
         │
         ▼ N
┌─────────────────────────────┐
│           scans             │  ← Page Home (liste) + Dashboard header
├─────────────────────────────┤
│ id              SERIAL      │
│ user_id         FK → users  │
│ repo_url        TEXT        │  "github.com/juice-shop/juice-shop"
│ repo_name       VARCHAR     │
│ language        VARCHAR     │  "JavaScript", "TypeScript/React"
│ branch          VARCHAR     │  "main"
│ status          VARCHAR     │  'pending'|'running'|'completed'|'failed'
│ score           INT         │  23 /100  (score global dashboard)
│ vuln_total      INT         │  47
│ vuln_critical   INT         │  3
│ vuln_high       INT         │  11
│ vuln_medium     INT         │  21
│ vuln_low        INT         │  12
│ secrets_count   INT         │  5  (stat "Secrets détectés")
│ files_total     INT         │  842 (stat "Fichiers analysés")
│ files_impacted  INT         │  127
│ is_favorite     BOOLEAN     │  étoile "Favoris" dans sidebar
│ created_at      TIMESTAMP   │
│ completed_at    TIMESTAMP   │
└──────┬──────────────────────┘
       │ 1                          │ 1
       ▼ N                          ▼ N
┌──────────────────────┐   ┌─────────────────────────────────┐
│   scan_analyzers     │   │        vulnerabilities          │
├──────────────────────┤   ├─────────────────────────────────┤
│ id        SERIAL     │   │ id            SERIAL            │
│ scan_id   FK → scans │   │ scan_id       FK → scans        │
│ analyzer  VARCHAR    │   │ tool          VARCHAR           │ 'semgrep'|'eslint'|
│  (semgrep, eslint,   │   │                                 │ 'npm_audit'|'trufflehog'
│   npm_audit,         │   │ title         VARCHAR           │ "SQL Injection…"
│   trufflehog,        │   │ description   TEXT              │ texte long
│   bandit,            │   │ severity      VARCHAR           │ 'critical'|'high'|
│   composer_audit)    │   │                                 │ 'medium'|'low'
│ enabled   BOOLEAN    │   │ owasp_category VARCHAR          │ 'A05:2025'
│ status    VARCHAR    │   │ file_path     TEXT              │ "routes/api.js"
│ vuln_count INT       │   │ line_start    INT               │ 127
│ started_at TIMESTAMP │   │ line_end      INT               │
│ completed_at TIMESTAMP   │ rule_id       VARCHAR           │ "javascript.express.sqli"
└──────────────────────┘   │ code_snippet  TEXT              │ extrait vulnérable
                           │ fix_suggestion TEXT             │ code corrigé (IA)
                           │ cvss_score    DECIMAL(3,1)      │ 9.8
                           │ is_fixed      BOOLEAN           │ bouton "Appliquer le fix"
                           │ created_at    TIMESTAMP         │
                           └──────────┬──────────────────────┘
                                      │ N
                                      │
                                      ▼ 1
                           ┌──────────────────────┐
                           │        reports       │  ← Page Rapport
                           ├──────────────────────┤
                           │ id         SERIAL    │
                           │ scan_id    FK → scans│
                           │ format     VARCHAR   │  'pdf' | 'html'
                           │ language   VARCHAR   │  'fr' | 'en'
                           │ file_url   TEXT      │  chemin du fichier généré
                           │ created_at TIMESTAMP │
                           └──────────────────────┘
```

> **Note :** `scan_analyzers` stocke quels outils ont été cochés sur la page **Home** (Semgrep ✓, ESLint ✓, npm audit ✓, TruffleHog ✓, Bandit ☐, Composer ☐) et leurs résultats individuels.

---

## 🚀 Lancer le projet

```bash
# 1. Cloner le repo
git clone https://github.com/wicra/SecureScan.git
cd SecureScan

# 2. Installer les dépendances (racine + sous-projets)
npm install
npm install --prefix client
npm install --prefix server

# 3. Configurer les variables d'environnement
cp .env.example .env

# 4. Lancer en développement
npm run dev        # Lance client + server en parallèle
```

Ou avec Docker :

```bash
docker-compose up --build
```

---

## 🔍 Analyseurs intégrés

| Outil              | Rôle                                      |
|--------------------|-------------------------------------------|
| **Semgrep**        | Analyse statique (SAST), 30+ langages     |
| **ESLint Security**| Détection de patterns dangereux en JS     |
| **npm audit**      | Audit des dépendances Node.js             |
| **TruffleHog**     | Détection de secrets dans l'historique Git|
| **Bandit**         | Analyse de sécurité Python                |

---

## 📊 Critères d'évaluation

| Critère         | Poids |
|-----------------|-------|
| Technique       | 40 %  |
| Sécurité OWASP  | 25 %  |
| UX & Rendu      | 20 %  |
| Travail d'équipe| 15 %  |

---

## 🤝 Contribuer

1. Crée une branche : `git checkout -b feature/ma-fonctionnalite`
2. Fais tes modifications et commite : `git commit -m "feat: ..."`
3. Push : `git push origin feature/ma-fonctionnalite`
4. Ouvre une **Pull Request**

---

*Hackathon IPSSI 2026 — [Page du sujet](https://biynlearning.academy/hackathon-securescan.html)*

