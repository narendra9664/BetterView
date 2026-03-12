import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router";
import { Loader2, ArrowLeft, Lock, Wand2 } from "lucide-react";
import {
  getProject, updateProject, getUserProfile, setPremium,
  type DesignItem,
} from "../../lib/db.action";
import {
  analyzeFloorPlan, createFallbackFloorPlan,
  type FloorPlanData,
} from "../../lib/ai";
import FloorPlanMesh from "../../components/FloorPlanMesh";
import PaywallModal from "../../components/PaywallModal";
import Toast, { useToast } from "../../components/ui/Toast";
import Navbar from "../../components/Navbar";
import type { AuthOutletContext } from "../../type.d";

import { parseFloorPlan } from "../../lib/floorPlanParser";

export function meta() {
  return [
    { title: "3D Mesh — BetterView" },
    { name: "description", content: "Interactive procedural 3D architectural model. Rotate, customise, and export." },
  ];
}

type PageStatus = "loading" | "analyzing" | "ready" | "error";

export default function MeshViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSignedIn, signIn } = useOutletContext<AuthOutletContext>();
  const { toasts, addToast, dismiss } = useToast();

  const [project, setProject] = useState<DesignItem | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [status, setStatus] = useState<PageStatus>("loading");

  // ── Load project + profile ──
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [data, profile] = await Promise.all([getProject(id), getUserProfile()]);
        if (!data) { setStatus("error"); return; }

        setProject(data);
        const premium = profile?.isPremium ?? false;
        setIsPremium(premium);

        if (!premium) {
          setShowPaywall(true);
          setStatus("ready");
          return;
        }

        if (!data.floorPlanData) {
          await runAnalysis(data);
        } else {
          setStatus("ready");
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    })();
  }, [id]);

  const runAnalysis = async (data: DesignItem) => {
    setStatus("analyzing");
    const src = data.sourceImage || data.sourceUrl || "";
    if (!src) { setStatus("error"); return; }

    let parsed;
    try {
      parsed = await analyzeFloorPlan(src);
      if (!parsed) throw new Error("Empty result");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[BetterView] mesh.$id — Vision analysis failed, using fallback:", msg);
      addToast("Vision analysis failed — using smart fallback layout.", "info");
      parsed = createFallbackFloorPlan();
    }

    const updated = await updateProject(data.id, { floorPlanData: parsed });
    setProject(updated ?? { ...data, floorPlanData: parsed });
    setStatus("ready");
    addToast("3D model built from your floor plan!", "success");
  };

  const handleUpgrade = async () => {
    const ok = await setPremium(true);
    if (!ok) { addToast("Could not activate premium. Are you signed in?", "error"); return; }

    setIsPremium(true);
    setShowPaywall(false);
    addToast("Premium activated! Building your 3D model…", "success");

    if (project && !project.floorPlanData) {
      await runAnalysis(project);
    } else {
      setStatus("ready");
    }
  };

  if (status === "loading") {
    return (
      <div className="visualizer-loading">
        <Loader2 size={36} className="animate-spin text-orange-500" />
        <p>Loading project…</p>
      </div>
    );
  }

  if (status === "analyzing") {
    return (
      <div className="visualizer-loading">
        <div className="mesh-analyzing-icon">
          <Wand2 size={36} className="text-orange-500" />
        </div>
        <p className="font-semibold text-zinc-800 text-base mt-2">
          Analysing floor plan geometry…
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          AI is parsing room layout and building 3D model · 15–30 seconds
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="visualizer-loading">
        <p className="text-zinc-500 mb-4">Failed to build 3D model.</p>
        <button className="btn-primary" onClick={() => navigate(`/visualizer/${id}`)}>
          Back to Visualizer
        </button>
      </div>
    );
  }

  const floorPlanData: FloorPlanData | undefined = project?.floorPlanData;

  return (
    <div className="mesh-page">
      <Navbar />
      <Toast toasts={toasts} onDismiss={dismiss} />
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => { setShowPaywall(false); navigate(`/visualizer/${id}`); }}
        onUpgrade={handleUpgrade}
      />

      {/* ── Header ── */}
      <header className="visualizer__header mesh-page__header">
        <div className="visualizer__header-left">
          <button
            className="visualizer__back"
            onClick={() => navigate(`/visualizer/${id}`)}
            aria-label="Back to visualizer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="visualizer__eyebrow">3D MESH VIEWER · PREMIUM</p>
            <h1 className="visualizer__title">{project?.name ?? "Project"}</h1>
            <p className="visualizer__sub">
              Procedural architectural model · Rotate &amp; export GLTF
            </p>
          </div>
        </div>

        {!isPremium && (
          <button className="btn-primary" onClick={() => setShowPaywall(true)}>
            <Lock size={14} /> Unlock Premium
          </button>
        )}

        {isPremium && (
          <span className="badge-done">✓ Premium Active</span>
        )}
      </header>

      {/* ── Canvas / Locked state ── */}
      <main className="mesh-page__main">
        {isPremium && floorPlanData ? (
          <FloorPlanMesh
            data={parseFloorPlan(floorPlanData as any)}
            projectName={project?.name || "Premium Mesh"}
          />
        ) : (
          <div className="mesh-page__locked">
            <div className="mesh-page__lock-icon">
              <Lock size={32} className="text-zinc-400" />
            </div>
            <h2>Premium Feature</h2>
            <p>
              Upgrade to BetterView Pro to unlock the interactive 3D mesh viewer.
              Rotate your floor plan in 3D, customise wall colours, and export as GLTF.
            </p>
            <button className="btn-primary mt-6" onClick={() => setShowPaywall(true)}>
              Unlock 3D Mesh Viewer
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
