/**
 * app/routes/visualizer.$id.tsx
 * Premium Real Estate Visualizer — redesigned with property info panel.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useOutletContext, useFetcher } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import {
  getProject,
  updateProject,
  getUserProfile,
  setPremium,
  type DesignItem,
} from "../../lib/db.action";
import {
  createFallbackFloorPlan,
  resizeImage,
  type FloorPlanData,
} from "../../lib/ai";
import FloorPlanMesh from "../../components/FloorPlanMesh";
import { parseFloorPlan } from "../../lib/floorPlanParser";
import PaywallModal from "../../components/PaywallModal";
import Toast, { useToast } from "../../components/ui/Toast";
import {
  Loader2, Wand2, Share2, ArrowLeft, BedDouble, Bath,
  Maximize2, Star, PhoneCall, CalendarCheck, ChevronRight, Building2,
  BadgeDollarSign, Home, MapPin
} from "lucide-react";
import type { AuthOutletContext } from "../../type.d";

type GenerationStatus = "idle" | "analyzing" | "done" | "error";

// ─── Meta ─────────────────────────────────────────────────────────────────────

export function meta() {
  return [
    { title: "Visualizer — BetterView" },
    { name: "description", content: "AI-generated 3D architectural model from your 2D floor plan." },
  ];
}

// ─── SERVER ACTION ─────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const imageData = formData.get("imageData") as string | null;

  if (!imageData) {
    return Response.json({ error: "No image data provided" }, { status: 400 });
  }

  try {
    const mimeType: string =
      imageData.startsWith("data:image/png") ? "image/png" :
        imageData.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
    const base64Data = imageData.includes(",") ? imageData.split(",")[1] : imageData;
    const imageDataUrl = `data:${mimeType};base64,${base64Data}`;
    const fetchResponse = await fetch(imageDataUrl);
    const blob = await fetchResponse.blob();
    const pyFormData = new FormData();
    pyFormData.append("file", blob, "floorplan.jpg");

    const res = await fetch("http://127.0.0.1:8000/api/analyze-floorplan", {
      method: "POST",
      body: pyFormData,
    });

    if (!res.ok) throw new Error(`Python API error: ${res.statusText}`);
    const floorPlanData = await res.json();
    return Response.json({ floorPlanData, source: "python-opencv" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, source: "error" }, { status: 500 });
  }
}

// ─── Property Info Panel ───────────────────────────────────────────────────────

function ValuationCalculator() {
  const [downPct, setDownPct] = useState(32);
  const price = 276103;
  const downAmt = Math.round(price * downPct / 100);
  const loan = price - downAmt;
  const rate = 0.03 / 12;
  const n = 15 * 12;
  const monthly = loan > 0
    ? Math.round(loan * rate * Math.pow(1 + rate, n) / (Math.pow(1 + rate, n) - 1))
    : 0;

  return (
    <div className="prop-section">
      <h3 className="prop-section-title">[ VALUATION CALCULATOR ]</h3>

      <div className="prop-calc-grid">
        <div className="prop-calc-item">
          <span className="prop-calc-label">Term</span>
          <span className="prop-calc-val">15 years</span>
        </div>
        <div className="prop-calc-item">
          <span className="prop-calc-label">Mortgage Type</span>
          <span className="prop-calc-val">Fixed</span>
        </div>
        <div className="prop-calc-item">
          <span className="prop-calc-label">Interest rate</span>
          <span className="prop-calc-val">3%</span>
        </div>
      </div>

      <div className="prop-slider-wrap">
        <label className="prop-calc-label">Down Payment</label>
        <input
          type="range" min={5} max={80} value={downPct}
          onChange={(e) => setDownPct(Number(e.target.value))}
          className="prop-slider"
        />
        <div className="prop-slider-vals">
          <div>
            <p className="prop-calc-label">Down Payment</p>
            <p className="prop-price">${downAmt.toLocaleString()}</p>
          </div>
          <div>
            <p className="prop-calc-label">Est. per month:</p>
            <p className="prop-price">${monthly.toLocaleString()}.00</p>
          </div>
        </div>
      </div>

      <div className="prop-actions">
        <button className="prop-btn-primary">
          <CalendarCheck size={14} /> Request a tour
        </button>
        <button className="prop-btn-secondary">
          <PhoneCall size={14} /> Contact agent
        </button>
      </div>
      <p className="prop-tour-hint">
        🕐 as early as today at 11:00 am
      </p>
    </div>
  );
}

const SIMILAR = [
  { price: "$390,000", name: "1033 Bay St NE, St. Petersbur…", type: "Multifamily · 6 Units", ppu: "$116,667/unit", addr: "730 Monroe Ave Apopka, FL 32703" },
  { price: "$425,000", name: "Cherry Hill Apartments", type: "Multifamily · 6 Units", ppu: "$116,667/unit", addr: "730 Monroe Ave Apopka, FL 32703", badge: "VIRTUAL TOUR" },
  { price: "$360,000", name: "1033 Bay St NE, St. Petersbur…", type: "Multifamily · 4 Units", ppu: "$90,000/unit", addr: "730 Monroe Ave Apopka, FL 32703" },
];

function PropertyPanel({ projectName, data }: { projectName: string; data: FloorPlanData | null }) {
  const rooms = (data?.rooms || []) as any[];
  const bedCount = rooms.filter(r => r.name?.toLowerCase().includes("bed")).length || 2;
  const bathCount = rooms.filter(r => r.name?.toLowerCase().includes("bath") || r.name?.toLowerCase().includes("wc")).length || 2;

  return (
    <aside className="prop-panel">
      {/* Stats row */}
      <div className="prop-stats">
        {[
          { val: bedCount, label: "Beds" },
          { val: bathCount, label: "baths" },
          { val: "1,001", label: "sqft" },
          { val: "B", label: "Class" },
        ].map(({ val, label }) => (
          <div key={label} className="prop-stat">
            <span className="prop-stat-val">{val}</span>
            <span className="prop-stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Tags */}
      <div className="prop-tags">
        <span className="prop-tag"><Building2 size={12} /> Apartment Building</span>
        <span className="prop-tag"><BadgeDollarSign size={12} /> $276/sqft</span>
        <span className="prop-tag"><Home size={12} /> $550/mo HOA</span>
        <span className="prop-tag"><Star size={12} /> Built in 2009</span>
      </div>

      <ValuationCalculator />

      {/* Similar properties */}
      <div className="prop-section">
        <h3 className="prop-section-title">[ SIMILAR PROPERTIES ]</h3>
        <div className="prop-similar-list">
          {SIMILAR.map((p, i) => (
            <div key={i} className="prop-similar-item">
              <div className="prop-similar-img">
                <Building2 size={24} className="text-zinc-400" />
                {p.badge && <span className="prop-similar-badge">{p.badge}</span>}
              </div>
              <div className="prop-similar-info">
                <p className="prop-similar-price">{p.price}</p>
                <p className="prop-similar-name">{p.name}</p>
                <p className="prop-similar-meta">{p.type} · {p.ppu}</p>
                <p className="prop-similar-addr">{p.addr}</p>
              </div>
              <ChevronRight size={14} className="text-zinc-400 flex-shrink-0 mt-2" />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function Visualizer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, addToast, dismiss } = useToast();
  const { isSignedIn, signIn } = useOutletContext<AuthOutletContext>();

  const fetcher = useFetcher<{ floorPlanData?: FloorPlanData; error?: string; source?: string }>();

  const [project, setProject] = useState<DesignItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<GenerationStatus>("idle");
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [copied, setCopied] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [data, profile] = await Promise.all([getProject(id), getUserProfile()]);
      if (data) {
        setProject(data);
        if (data.floorPlanData) setGenStatus("done");
      }
      if (profile) setIsPremium(profile.isPremium);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !project) return;
    const result = fetcher.data;

    const persistAndShow = async (fpData: FloorPlanData, fromPython: boolean) => {
      const updated = await updateProject(project.id, { floorPlanData: fpData });
      if (updated) {
        setProject(updated);
        setGenStatus("done");
        addToast(fromPython ? "✓ 3D model built from your floor plan!" : "✓ 3D model ready (fallback)", "success");
      } else {
        setGenStatus("error");
        addToast("Failed to save 3D data. Try refreshing.", "error");
      }
    };

    if (result.floorPlanData) {
      setGeminiError(null);
      persistAndShow(result.floorPlanData, true);
    } else if (result.error) {
      setGeminiError(result.error);
      addToast(`AI error: ${result.error}. Showing fallback layout.`, "info");
      persistAndShow(createFallbackFloorPlan(), false);
    }
  }, [fetcher.state, fetcher.data]);

  const handleGenerate = useCallback(async () => {
    if (!project) return;
    const sourceImg = project.sourceImage || project.sourceUrl || "";
    if (!sourceImg) { addToast("No floor plan image found — re-upload.", "error"); return; }
    setGenStatus("analyzing");
    setGeminiError(null);
    addToast("Sending floor plan to OpenCV engine…", "info");
    try {
      const resized = await resizeImage(sourceImg, 1024, 0.85);
      const form = new FormData();
      form.append("imageData", resized);
      fetcher.submit(form, { method: "post" });
    } catch {
      addToast("Failed to process image. Try a smaller file.", "error");
      setGenStatus("error");
    }
  }, [project, fetcher, addToast]);

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => { });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast("Link copied!", "success");
  }, [addToast]);

  const handleUpgrade = useCallback(async () => {
    const ok = await setPremium(true);
    if (ok) { setIsPremium(true); setShowPaywall(false); addToast("🎉 Premium activated!", "success"); }
  }, [addToast]);

  if (loading) return (
    <div className="visualizer-loading">
      <Loader2 size={36} className="animate-spin text-orange-500" />
      <p>Loading project…</p>
    </div>
  );

  if (!project) return (
    <div className="visualizer-loading">
      <p>Project not found.</p>
      <button className="btn-primary mt-4" onClick={() => navigate("/")}>Go Home</button>
    </div>
  );

  const hasRender = !!project.floorPlanData;
  const isRunning = genStatus === "analyzing" || fetcher.state === "submitting" || fetcher.state === "loading";

  return (
    <div className="visualizer-page">
      <Toast toasts={toasts} onDismiss={dismiss} />
      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} onUpgrade={handleUpgrade} isPremium={isPremium} />

      {/* ── Header ── */}
      <header className="visualizer__header">
        <div className="visualizer__header-left">
          <button className="visualizer__back" onClick={() => navigate("/")} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="visualizer__eyebrow">PROJECT</p>
            <h1 className="visualizer__title">{project.name}</h1>
            <p className="visualizer__sub">AI Architectural Visualization</p>
          </div>
        </div>
        <div className="visualizer__header-right">
          {hasRender && !isRunning && (
            <button className="btn-ghost" onClick={() => { setGenStatus("idle"); setGeminiError(null); }} title="Re-run AI analysis">
              ↺ Regenerate
            </button>
          )}
          {hasRender && (
            <button
              className="btn-ghost"
              onClick={() => setShowPanel(p => !p)}
              title="Toggle property panel"
            >
              {showPanel ? "Hide Info" : "Show Info"}
            </button>
          )}
          <button className="btn-ghost" onClick={handleShare}>
            <Share2 size={13} />
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className={`visualizer-main ${hasRender && !isRunning ? "visualizer-main--split" : ""}`}>

        {/* Generating */}
        {isRunning && (
          <div className="visualizer__generating">
            <div className="gen-pulse">
              <img src={project.sourceImage || project.sourceUrl} alt="Floor plan" className="gen-pulse__image" />
              <div className="gen-pulse__overlay" />
            </div>
            <div className="gen-status">
              <Loader2 size={24} className="animate-spin text-orange-500" />
              <p className="gen-status__text">Analysing with Python & OpenCV…</p>
              <p className="gen-status__hint">Running server-side · Reading rooms, walls & doors</p>
              <div className="gen-steps">
                <div className="gen-step gen-step--active"><span className="gen-step__num">1</span> Server Vision Analysis</div>
                <div className="gen-step__arrow">→</div>
                <div className="gen-step"><span className="gen-step__num">2</span> 3D Construction</div>
              </div>
            </div>
          </div>
        )}

        {/* Idle / pre-generate */}
        {!isRunning && genStatus !== "done" && (
          <div className="visualizer__idle">
            <div className="visualizer__source-preview">
              <img src={project.sourceImage || project.sourceUrl} alt="Your 2D Floor Plan" className="visualizer__source-img" />
            </div>
            <div className="visualizer__generate-panel">
              <Wand2 size={36} className="text-orange-500 mb-4" />
              <h2>Ready to generate</h2>
              <p>Our server-side AI will analyse every room, wall, and door in your floor plan to build a 3D model that exactly matches your layout.</p>
              {geminiError && (
                <div className="visualizer__error-msg" style={{ marginTop: "1rem", textAlign: "left", fontSize: "0.8rem" }}>
                  <strong>⚠ Last AI Error:</strong> {geminiError}
                </div>
              )}
              {genStatus === "error" && !geminiError && (
                <div className="visualizer__error-msg">Generation failed. Please try again.</div>
              )}
              <button className="btn-primary btn-primary--lg mt-6" onClick={handleGenerate} disabled={isRunning}>
                Generate 3D Render
              </button>
              <p className="visualizer__powered">Powered by Python OpenCV · Local Backend Analysis</p>
            </div>
          </div>
        )}

        {/* Done — 3D + property panel */}
        {!isRunning && genStatus === "done" && hasRender && (
          <>
            {geminiError && (
              <div className="visualizer-error-banner">
                ⚠️ Showing fallback layout — AI error: <em>{geminiError}</em>. Click ↺ Regenerate with a clearer floor plan image.
              </div>
            )}

            {/* 3D Viewer */}
            <div className="visualizer-3d-area">
              {geminiError && (
                <div className="visualizer-error-banner">
                  ⚠️ Showing fallback layout — AI error: <em>{geminiError}</em>. Click ↺ Regenerate with a clearer floor plan image.
                </div>
              )}
              <FloorPlanMesh
                data={parseFloorPlan(project.floorPlanData as any)}
                projectName={project.name}
              />
            </div>

            {/* Property Panel */}
            {showPanel && (
              <PropertyPanel
                projectName={project.name}
                data={project.floorPlanData as FloorPlanData}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="visualizer__footer">
        <div className="visualizer__footer-info">
          {hasRender
            ? <span className="badge-done">✓ 3D Render Complete</span>
            : <span className="badge-pending">2D Blueprint Uploaded</span>
          }
        </div>
        <div className="visualizer__footer-right">
          <MapPin size={11} className="text-zinc-400" />
          <span className="text-xs text-zinc-400">730 Monroe Ave, FL 32703</span>
        </div>
      </footer>
    </div>
  );
}
