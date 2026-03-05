"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap, Lock, FolderOpen, CheckCircle, Check, ArrowRight, Circle,
  Folder, LockKeyhole, AlertTriangle, Key, UploadCloud, X,
} from "lucide-react";
import JSZip from "jszip";
import { createScan, uploadScanFile, isLoggedIn, setCurrentScanId } from "@/lib/api";

// ─── Helpers JSZip (compression dossier côté client) ──────────────────────────

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
      reader.readEntries(res, rej)
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function addEntryToZip(zip: JSZip, entry: FileSystemEntry, basePath: string) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej)
    );
    zip.file(`${basePath}${entry.name}`, file);
  } else if (entry.isDirectory) {
    const folder = zip.folder(`${basePath}${entry.name}/`)!;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    for (const child of children) {
      await addEntryToZip(folder as unknown as JSZip, child, "");
    }
  }
}

async function zipDirectoryEntry(entry: FileSystemDirectoryEntry): Promise<File> {
  const zip = new JSZip();
  const reader = entry.createReader();
  const children = await readAllEntries(reader);
  for (const child of children) {
    await addEntryToZip(zip, child, "");
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return new File([blob], `${entry.name}.zip`, { type: "application/zip" });
}

async function zipFileList(files: FileList): Promise<File> {
  const zip = new JSZip();
  const folderName = files[0]?.webkitRelativePath?.split("/")[0] || "upload";
  for (const file of Array.from(files)) {
    zip.file(file.webkitRelativePath || file.name, file);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return new File([blob], `${folderName}.zip`, { type: "application/zip" });
}

// ─────────────────────────────────────────────────────────────────────────────

const stepLabels = [
  "Clonage / extraction du projet",
  "Semgrep — Analyse statique",
  "ESLint Security — Linting JS",
  "npm audit — Dépendances",
  "TruffleHog — Secrets",
  "Mapping OWASP Top 10",
];

const steps = [
  { done: "✓ Projet prêt",          next: "Semgrep — Analyse statique..." },
  { done: "✓ Semgrep terminé",       next: "ESLint Security..." },
  { done: "✓ ESLint terminé",        next: "npm audit..." },
  { done: "✓ npm audit terminé",     next: "TruffleHog — Secrets..." },
  { done: "✓ TruffleHog terminé",    next: "Mapping OWASP..." },
  { done: "✓ Mapping OWASP complet", next: "Analyse terminée !" },
];

export function HomeScanBox() {
  const router = useRouter();

  const zipInputRef    = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [repoInput,    setRepoInput]    = useState("");
  const [uploadFile,   setUploadFile]   = useState<File | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [isZipping,    setIsZipping]    = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showResults,  setShowResults]  = useState(false);
  const [currentStep,  setCurrentStep]  = useState(0);
  const [progress,     setProgress]     = useState(0);
  const [scanResult,   setScanResult]   = useState<Record<string, unknown> | null>(null);
  const [scanError,    setScanError]    = useState("");

  // ─── Drag-and-drop ────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setScanError("");

    const item = e.dataTransfer.items?.[0];
    if (!item) return;
    const entry = item.webkitGetAsEntry?.();

    if (entry?.isDirectory) {
      setIsZipping(true);
      try {
        const file = await zipDirectoryEntry(entry as FileSystemDirectoryEntry);
        setUploadFile(file);
        setRepoInput("");
      } catch {
        setScanError("Impossible de compresser le dossier.");
      } finally {
        setIsZipping(false);
      }
    } else if (entry?.isFile) {
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setScanError("Seuls les fichiers ZIP ou les dossiers sont acceptés.");
        return;
      }
      setUploadFile(file);
      setRepoInput("");
    }
  }, []);

  // ─── Sélection via input ──────────────────────────────────────────────────

  const handleZipSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setScanError("Seuls les fichiers ZIP sont acceptés.");
      return;
    }
    setUploadFile(file);
    setRepoInput("");
    setScanError("");
  }, []);

  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsZipping(true);
    setScanError("");
    try {
      const file = await zipFileList(files);
      setUploadFile(file);
      setRepoInput("");
    } catch {
      setScanError("Impossible de compresser le dossier.");
    } finally {
      setIsZipping(false);
    }
  }, []);

  const resetUpload = () => {
    setUploadFile(null);
    setScanError("");
    if (zipInputRef.current)    zipInputRef.current.value    = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // ─── Lancer le scan ───────────────────────────────────────────────────────

  const startScan = async () => {
    const url = repoInput.trim();
    if (!url && !uploadFile) {
      setScanError("Entrez une URL de dépôt Git ou déposez un fichier.");
      return;
    }

    setScanError("");
    setShowProgress(true);
    setShowResults(false);
    setCurrentStep(0);
    setProgress(0);

    const pcts = [17, 34, 50, 67, 83, 100];
    let step = 0;
    const interval = setInterval(() => {
      if (step < steps.length) {
        setCurrentStep(step + 1);
        setProgress(pcts[step]);
        step++;
      } else {
        clearInterval(interval);
      }
    }, 900);

    try {
      const result = url
        ? await createScan(url)
        : await uploadScanFile(uploadFile!);

      clearInterval(interval);
      setCurrentStep(steps.length);
      setProgress(100);
      setScanResult(result);

      if (isLoggedIn() && result.scanId) {
        setTimeout(() => router.push(`/dashboard?scanId=${result.scanId}`), 800);
        return;
      }

      // Scan anonyme : stocker l'ID pour rattachement à la connexion
      if (result.scanId) setCurrentScanId(result.scanId);

      setTimeout(() => {
        setShowProgress(false);
        setShowResults(true);
      }, 600);
    } catch (err: unknown) {
      clearInterval(interval);
      setShowProgress(false);
      const message = err instanceof Error ? err.message : "Erreur lors du scan";
      setScanError(message);
    }
  };

  const scanTarget = repoInput.trim() || uploadFile?.name || "Fichier uploadé";

  return (
    <div className="max-w-[820px] mx-auto px-4">
      {!showProgress && !showResults && (
        <div className="bg-[rgba(17,19,24,0.92)] border border-(--color-border2) rounded-2xl p-8 mb-10 backdrop-blur">

          {/* ── URL Git ── */}
          <div className="text-[15px] font-semibold mb-1.5">🔗 URL du dépôt Git</div>
          <div className="text-[13px] text-(--color-text2) mb-4">
            Entrez l&apos;URL d&apos;un dépôt GitHub, GitLab ou Bitbucket public
          </div>
          <div className="flex gap-3 mb-2">
            <input
              type="text"
              className="flex-1 bg-(--color-bg) border border-(--color-border2) rounded-[10px] py-3.5 px-4 text-sm text-(--color-text) font-(--font-space-mono) outline-none focus:border-(--color-accent) placeholder:text-(--color-text3)"
              placeholder="https://github.com/organisation/mon-projet.git"
              value={repoInput}
              onChange={(e) => { setRepoInput(e.target.value); if (uploadFile) resetUpload(); }}
              onKeyDown={(e) => e.key === "Enter" && startScan()}
            />
            <button
              onClick={startScan}
              className="inline-flex items-center gap-2 py-2.5 px-7 rounded-lg bg-(--color-accent) text-white font-semibold text-sm hover:bg-(--color-accent2) transition-colors"
            >
              <Zap size={18} strokeWidth={2} />
              Lancer l&apos;analyse
            </button>
          </div>

          {scanError && <div className="text-xs text-(--color-red) mb-2">{scanError}</div>}

          <div className="text-xs text-(--color-text3) flex items-center gap-1.5 mb-5">
            <Lock size={14} strokeWidth={2} />
            Analyse sécurisée · Aucun code stocké · Résultats instantanés
          </div>

          {/* ── Séparateur ── */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-1 h-px bg-(--color-border)" />
            <span className="text-xs text-(--color-text3)">ou uploadez vos fichiers</span>
            <div className="flex-1 h-px bg-(--color-border)" />
          </div>

          {/* ── Zone drag-and-drop ── */}
          {isZipping ? (
            <div className="border-2 border-dashed border-(--color-accent) bg-[rgba(59,130,246,0.06)] rounded-[10px] p-7 text-center">
              <div className="flex justify-center mb-2">
                <div className="w-8 h-8 border-2 border-(--color-border2) border-t-(--color-accent) rounded-full animate-spin" />
              </div>
              <div className="text-sm text-(--color-text2)">Compression du dossier en cours…</div>
            </div>
          ) : uploadFile ? (
            <div className="border-2 border-(--color-green) bg-[rgba(34,197,94,0.05)] rounded-[10px] p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle size={28} className="text-(--color-green)" strokeWidth={2} />
                <div>
                  <div className="text-sm font-semibold text-(--color-green)">{uploadFile.name}</div>
                  <div className="text-xs text-(--color-text3)">{(uploadFile.size / 1024 / 1024).toFixed(2)} Mo · Prêt à scanner</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={startScan}
                  className="inline-flex items-center gap-2 py-2 px-5 rounded-lg bg-(--color-accent) text-white font-semibold text-sm hover:bg-(--color-accent2) transition-colors"
                >
                  <Zap size={16} strokeWidth={2} /> Scanner
                </button>
                <button onClick={resetUpload} className="p-2 rounded-lg hover:bg-(--color-surface2) text-(--color-text3) hover:text-(--color-text) transition-colors">
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-[10px] p-8 text-center cursor-pointer transition-colors select-none ${
                isDragging
                  ? "border-(--color-accent) bg-[rgba(59,130,246,0.08)]"
                  : "border-(--color-border2) hover:border-(--color-accent) hover:bg-[rgba(59,130,246,0.04)]"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => zipInputRef.current?.click()}
            >
              <input ref={zipInputRef}    type="file" className="hidden" accept=".zip" onChange={handleZipSelect} />
              <input ref={folderInputRef} type="file" className="hidden"
                // @ts-expect-error : webkitdirectory non dans les types standards
                webkitdirectory=""
                onChange={handleFolderSelect}
              />
              <div className="mb-3 flex justify-center">
                <UploadCloud size={36} className={isDragging ? "text-(--color-accent)" : "text-(--color-text2)"} strokeWidth={1.5} />
              </div>
              <div className="text-sm text-(--color-text2) mb-1">
                {isDragging
                  ? <span className="text-(--color-accent) font-semibold">Relâchez pour analyser</span>
                  : <>
                      Glissez un <strong className="text-(--color-text)">dossier</strong> ou un{" "}
                      <strong className="text-(--color-text)">.zip</strong> ici,
                      ou <span className="text-(--color-accent)">cliquez pour parcourir</span>
                    </>
                }
              </div>
              <div className="text-xs text-(--color-text3)">ZIP · Dossier entier — Max 1 Go</div>
              <button
                onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-(--color-text3) hover:text-(--color-text) border border-(--color-border2) hover:border-(--color-border) rounded-lg px-3 py-1.5 transition-colors"
              >
                <FolderOpen size={13} strokeWidth={2} /> Sélectionner un dossier
              </button>
            </div>
          )}
        </div>
      )}

      {showProgress && (
        <div className="bg-[rgba(17,19,24,0.92)] border border-(--color-border2) rounded-2xl p-8 max-w-[820px] mx-auto mb-10 backdrop-blur">
          <div className="text-base font-semibold mb-5 flex items-center gap-2.5">
            <div className="w-[18px] h-[18px] border-2 border-(--color-border2) border-t-(--color-accent) rounded-full animate-spin shrink-0" />
            <span>{currentStep < steps.length ? steps[currentStep]?.next : "Analyse terminée !"}</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-3 text-[13px]">
                <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                  i < currentStep ? "bg-[rgba(34,197,94,0.2)] text-(--color-green)" : i === currentStep ? "bg-[rgba(59,130,246,0.2)] text-(--color-accent)" : "bg-(--color-surface2) text-(--color-text3)"
                }`}>
                  {i < currentStep ? <Check size={14} strokeWidth={2.5} /> : i === currentStep ? <ArrowRight size={14} strokeWidth={2.5} /> : <Circle size={6} fill="currentColor" />}
                </div>
                <span className={i <= currentStep ? "text-(--color-text)" : "text-(--color-text2)"}>{label}</span>
              </div>
            ))}
          </div>
          <div className="h-1 bg-(--color-border) rounded mt-5 overflow-hidden">
            <div className="h-full bg-(--color-accent) rounded transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {showResults && scanResult && (
        <PublicResults scanTarget={scanTarget} result={scanResult} />
      )}
    </div>
  );
}

function PublicResults({ scanTarget, result }: { scanTarget: string; result: Record<string, unknown> }) {
  const score = (result.score as number) ?? 0;
  const total = (result.totalVulnerabilities as number) ?? 0;
  const grade = (result.grade as string) ?? "F";
  const gradeColor = score >= 80 ? "var(--color-green)" : score >= 60 ? "var(--color-yellow)" : score >= 40 ? "var(--color-orange)" : "var(--color-red)";
  const dashOffset = 427 - (427 * score / 100);

  return (
    <section className="max-w-[900px] mx-auto px-12 pb-[60px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-xs font-(--font-space-mono) text-(--color-text3) mb-1 flex items-center gap-1.5">
            <Folder size={14} strokeWidth={2} />
            {scanTarget}
          </div>
          <div className="text-[22px] font-bold">Résultats de l&apos;analyse</div>
        </div>
        <Link href="/login" className="inline-flex items-center gap-2 py-2.5 px-5 rounded-lg bg-(--color-accent) text-white font-semibold text-sm hover:bg-(--color-accent2)">
          <LockKeyhole size={18} strokeWidth={2} />
          Voir le rapport complet
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Score global" value={String(score)} sub={`/100 — ${grade}`} pill={grade} pillIcon={<Circle size={10} fill="currentColor" />} valueColor={gradeColor} pillStyle="bg-[rgba(239,68,68,0.15)] text-(--color-red) inline-flex items-center gap-1" />
        <StatCard label="Vulnérabilités" value={String(total)} sub={`${result.vulnCritical || 0} critiques · ${result.vulnHigh || 0} hautes`} pill="Action requise" pillIcon={<AlertTriangle size={10} strokeWidth={2} />} pillStyle="bg-[rgba(249,115,22,0.15)] text-(--color-orange) inline-flex items-center gap-1" />
        <StatCard label="Secrets détectés" value={String(result.secretsCount || 0)} sub="Clés API, tokens" pill="Exposés" pillIcon={<Key size={10} strokeWidth={2} />} valueColor="var(--color-red)" pillStyle="bg-[rgba(239,68,68,0.15)] text-(--color-red) inline-flex items-center gap-1" />
        <StatCard label="Fichiers analysés" value={String(result.filesTotal || 0)} sub={`${result.filesImpacted || 0} impactés`} pill="Complet" pillIcon={<Check size={10} strokeWidth={2.5} />} valueColor="var(--color-green)" pillStyle="bg-[rgba(34,197,94,0.15)] text-(--color-green) inline-flex items-center gap-1" />
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-5 mb-6">
        <div className="bg-[rgba(17,19,24,0.92)] border border-(--color-border) rounded-xl p-7 flex flex-col items-center backdrop-blur">
          <div className="text-[11px] text-(--color-text2) uppercase tracking-widest mb-5">Score de sécurité</div>
          <div className="w-40 h-40 relative mb-5">
            <svg className="absolute top-0 left-0 -rotate-90" width="160" height="160" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="68" fill="none" stroke="#1a1d25" strokeWidth="14" />
              <circle cx="80" cy="80" r="68" fill="none" stroke={gradeColor} strokeWidth="14" strokeDasharray="427" strokeDashoffset={dashOffset} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold" style={{ color: gradeColor }}>{score}</div>
              <div className="text-xs text-(--color-text3) mt-1">/ 100</div>
            </div>
          </div>
          <div className="w-full space-y-1.5 border-t border-(--color-border) pt-1.5">
            {[
              { c: "red",    label: "Critique", val: result.vulnCritical },
              { c: "orange", label: "Haute",    val: result.vulnHigh },
              { c: "yellow", label: "Moyenne",  val: result.vulnMedium },
              { c: "green",  label: "Faible",   val: result.vulnLow },
            ].map((item) => (
              <div key={item.c} className="flex items-center gap-2 py-1.5 text-[13px] border-t border-(--color-border) first:border-t-0">
                <div className="w-2 h-2 rounded-full" style={{ background: `var(--color-${item.c})` }} />
                <div className="flex-1 text-(--color-text2)">{item.label}</div>
                <div className="font-bold" style={{ color: `var(--color-${item.c})` }}>{String(item.val || 0)}</div>
              </div>
            ))}
          </div>
        </div>

        <BlurSection title="Connectez-vous pour voir le détail" sub="Le mapping OWASP complet est réservé aux membres." />
      </div>

      <BlurSection
        title={`${total} vulnérabilités détectées`}
        sub="Créez un compte pour voir toutes les vulnérabilités."
        primaryLabel="Créer un compte gratuit"
        secondaryLabel="Se connecter"
      />
    </section>
  );
}

function StatCard({ label, value, sub, pill, pillIcon, valueColor, pillStyle }: {
  label: string; value: string; sub: string; pill: string;
  pillIcon?: React.ReactNode; valueColor?: string; pillStyle: string;
}) {
  return (
    <div className="bg-[rgba(17,19,24,0.92)] border border-(--color-border) rounded-xl p-5 px-6 backdrop-blur">
      <div className="text-xs text-(--color-text2) uppercase tracking-wider mb-2">{label}</div>
      <div className="text-3xl font-(--font-space-mono) leading-none" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="text-xs text-(--color-text3) mt-1.5">{sub}</div>
      <div className={`px-2 py-0.5 rounded text-[11px] font-semibold mt-2 ${pillStyle}`}>{pillIcon}{pill}</div>
    </div>
  );
}

function BlurSection({ title, sub, primaryLabel = "Se connecter", secondaryLabel = "Créer un compte" }: {
  children?: React.ReactNode; title: string; sub: string;
  primaryLabel?: string; secondaryLabel?: string;
}) {
  return (
    <div className="relative">
      <div className="bg-[rgba(17,19,24,0.92)] border border-(--color-border) rounded-xl p-6 backdrop-blur min-h-[200px]" />
      <div className="absolute inset-0 z-10 bg-[rgba(10,12,16,0.65)] backdrop-blur-md rounded-xl flex flex-col items-center justify-center gap-3.5">
        <Lock size={40} strokeWidth={2} className="text-(--color-text2)" />
        <div className="text-lg font-semibold text-center">{title}</div>
        <div className="text-sm text-(--color-text2) text-center max-w-[280px] leading-relaxed">{sub}</div>
        <div className="flex gap-2.5">
          <Link href="/login" className="inline-flex items-center gap-2 py-2.5 px-[18px] rounded-lg bg-(--color-accent) text-white font-semibold text-[13px] hover:bg-(--color-accent2)">
            {primaryLabel}
          </Link>
          <Link href="/login" className="inline-flex items-center gap-2 py-2.5 px-[18px] rounded-lg border border-(--color-border2) text-(--color-text) font-semibold text-[13px] hover:bg-(--color-surface2)">
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
