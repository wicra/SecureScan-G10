const { execFileSync } = require('child_process');
const path = require('path');

// SÉVÉRITÉ BASÉE SUR LA VÉRIFICATION DU SECRET (actif > non vérifié > inconnu)
function resolveSeverity(verified, detectorName) {
  if (verified) return 'critical';
  if (CRITICAL_DETECTORS.has(detectorName)) return 'high';
  return 'medium';
}

// DÉTECTEURS CONSIDÉRÉS CRITIQUES MÊME NON VÉRIFIÉS (clés cloud, tokens d'accès)
const CRITICAL_DETECTORS = new Set([
  'AWS', 'GCP', 'Azure', 'GitHub', 'GitLab', 'Stripe',
  'Twilio', 'SendGrid', 'Slack', 'PrivateKey',
]);

/**
 * Exécute TruffleHog v3 sur un dossier local et retourne les secrets normalisés.
 * TruffleHog output : un objet JSON par ligne (NDJSON), pas un tableau.
 *
 * @param {string} repoPath - Chemin absolu du repo cloné
 * @returns {Array<Object>} Secrets détectés au format standard
 */
function runTrufflehog(repoPath) {
  const absPath = path.resolve(repoPath);

  let raw;
  try {
    raw = execFileSync(
      'trufflehog',
      [
        'filesystem',
        absPath,
        '--json',
        '--no-update',
      ],
      { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }
    ).toString();
  } catch (err) {
    // EXIT CODE 183 = SECRETS TROUVÉS, PAS UNE ERREUR D'EXÉCUTION
    if (err.stdout) {
      raw = err.stdout.toString();
    } else {
      console.error('[TruffleHog] Erreur d\'exécution :', err.message);
      return [];
    }
  }

  if (!raw.trim()) return [];

  // NORMALISATION : FORMAT NDJSON TRUFFLEHOG → FORMAT STANDARD DES ANALYSEURS
  // Chaque ligne est un objet JSON indépendant (pas un tableau)
  return raw
    .split('\n')
    .filter(Boolean)
    .reduce((acc, line) => {
      let finding;
      try {
        finding = JSON.parse(line);
      } catch {
        return acc;
      }

      const detector = finding.DetectorName || 'Unknown';
      const verified  = finding.Verified === true;

      // TruffleHog peut scanner Git ou Filesystem — on supporte les deux
      const meta = finding.SourceMetadata?.Data ?? {};
      const src  = meta.Filesystem ?? meta.Git ?? {};

      acc.push({
        tool:          'trufflehog',
        ruleId:        detector,
        title:         `Secret détecté : ${detector}`,
        description:   buildDescription(finding, verified),
        severity:      resolveSeverity(verified, detector),
        filePath:      src.file   || null,
        lineStart:     src.line   || null,
        lineEnd:       src.line   || null,
        codeSnippet:   finding.Redacted || null,
        fixSuggestion: 'Révoquer immédiatement le secret, le retirer de l\'historique Git (git-filter-repo), puis le remplacer.',
        cvssScore:     verified ? 9.8 : null,
        owaspCategory: 'A07:2021', // Identification & Authentication Failures → sera remappé par owasp.service.js
      });

      return acc;
    }, []);
}

function buildDescription(finding, verified) {
  const parts = [`Détecteur : ${finding.DetectorName || '?'}`];
  if (verified)               parts.push('✅ Secret vérifié comme actif');
  if (finding.DecoderName)    parts.push(`Encodage : ${finding.DecoderName}`);
  if (finding.SourceMetadata?.Data?.Git?.commit) {
    parts.push(`Commit : ${finding.SourceMetadata.Data.Git.commit.slice(0, 8)}`);
  }
  return parts.join(' — ');
}

module.exports = { runTrufflehog };
