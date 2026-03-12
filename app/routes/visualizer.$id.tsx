/**
 * app/routes/visualizer.$id.tsx
 * Server-side Gemini analysis via React Router action().
 * The action() export runs in Node.js — no CORS, API key never exposed to browser.
 */

import { useEffect, useState, useCallback } from "react";
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
import { Loader2, Wand2, Share2, ArrowLeft } from "lucide-react";
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
// Uses Groq API (OpenAI-compatible) — fast, reliable, server-side only.
// Model: llama-3.2-11b-vision-preview (native vision support on Groq)

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const imageData = formData.get("imageData") as string | null;

  if (!imageData) {
    return Response.json({ error: "No image data provided" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GROQ_API_KEY not set in .env file." },
      { status: 500 }
    );
  }

  try {
    const { ANALYSIS_PROMPT } = await import("../../lib/ai");

    // Rebuild a clean data URI so Groq receives a properly-prefixed base64 URL
    const mimeType: string =
      imageData.startsWith("data:image/png")  ? "image/png"  :
      imageData.startsWith("data:image/webp") ? "image/webp" :
      "image/jpeg";
    const base64Data   = imageData.includes(",") ? imageData.split(",")[1] : imageData;
    const imageDataUrl = `data:${mimeType};base64,${base64Data}`;

    console.log("[BetterView] Calling Groq Vision API (llama-3.2-11b-vision-preview)...");

    // ── Groq fetch ─────────────────────────────────────────────────────────────
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 60_000);

    let raw: string;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model:       "llama-3.2-11b-vision-preview",
          temperature: 0.1,
          max_tokens:  4096,
          messages: [
            {
              role: "user",
              content: [
                { type: "text",      text: ANALYSIS_PROMPT },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
        }),
      });

      // Log the full HTTP status so errors are immediately visible in server logs
      console.log(`[BetterView] Groq response status: ${res.status} ${res.statusText}`);

      const json = await res.json() as any;

      if (!res.ok || json.error) {
        // Surface the complete error object for easy debugging
        console.error("[BetterView] Groq error response:", JSON.stringify(json, null, 2));
        const msg = json.error?.message || json.error || `HTTP ${res.status} ${res.statusText}`;
        throw new Error(`Groq API error (${res.status}): ${msg}`);
      }

      raw = json.choices?.[0]?.message?.content ?? "";
      if (!raw) throw new Error("Groq returned an empty response — possible safety filter or quota issue");

    } finally {
      clearTimeout(timeout);
    }

    // ── Parse JSON from the model response ───────────────────────────────────────
    const cleaned   = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd   = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON object found in Groq response");
    }

    const floorPlanData = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1)) as FloorPlanData;
    if (!Array.isArray(floorPlanData.rooms) || floorPlanData.rooms.length === 0) {
      throw new Error("AI found no rooms — try a clearer floor plan image");
    }

    // Sanitise each room so downstream 3D code never crashes on missing fields
    floorPlanData.rooms = floorPlanData.rooms.map((r: any, i: number) => ({
      ...r,
      id:      r.id ?? `r${i + 1}`,
      doors:   Array.isArray(r.doors)   ? r.doors   : [],
      windows: Array.isArray(r.windows) ? r.windows : [],
    }));

    console.log(`[BetterView] Groq success — found ${floorPlanData.rooms.length} rooms`);
    return Response.json({ floorPlanData, source: "llama-3.2-11b-vision-preview" });

  } catch (err) {
    // Log the full error object (not just .message) so HTTP codes are visible
    console.error("[BetterView] Groq analysis failed — full error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg, source: "error" }, { status: 500 });
  }
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function Visualizer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, addToast, dismiss } = useToast();
  const { isSignedIn, signIn } = useOutletContext<AuthOutletContext>();

  // useFetcher calls our action() on the server
  const fetcher = useFetcher<{ floorPlanData?: FloorPlanData; error?: string; source?: string }>();

  const [project, setProject] = useState<DesignItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [genStatus, setGenStatus] = useState<GenerationStatus>("idle");
  const [showPaywall, setShowPaywall] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [copied, setCopied] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  // ── Load project on mount ───────────────────────────────────────────────────
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

  // ── React to the server action result ──────────────────────────────────────
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !project) return;
    const result = fetcher.data;

    const persistAndShow = async (fpData: FloorPlanData, fromGemini: boolean) => {
      const updated = await updateProject(project.id, { floorPlanData: fpData });
      if (updated) {
        setProject(updated);
        setGenStatus("done");
        addToast(
          fromGemini
            ? "✓ 3D model built from YOUR floor plan via AI Vision!"
            : "✓ 3D model ready (fallback — see banner for error details)",
          "success"
        );
      } else {
        setGenStatus("error");
        addToast("Failed to save 3D data. Try refreshing.", "error");
      }
    };

    if (result.floorPlanData) {
      // OpenRouter succeeded — use real AI floor plan data
      setGeminiError(null);
      persistAndShow(result.floorPlanData, true);
    } else if (result.error) {
      // OpenRouter failed — show exact error so user knows what happened
      setGeminiError(result.error);
      addToast(`AI error: ${result.error}. Showing fallback layout.`, "info");
      persistAndShow(createFallbackFloorPlan(), false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  // ── Trigger generation ─────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!project) return;
    const sourceImg = project.sourceImage || project.sourceUrl || "";
    if (!sourceImg) {
      addToast("No floor plan image found — re-upload.", "error");
      return;
    }
    setGenStatus("analyzing");
    setGeminiError(null);
    addToast("Sending floor plan to server for AI analysis…", "info");
    try {
      // Resize client-side first: reduces payload ~2-5MB → ~150-300KB
      const resized = await resizeImage(sourceImg, 1024, 0.85);
      const form = new FormData();
      form.append("imageData", resized);
      fetcher.submit(form, { method: "post" });
    } catch {
      addToast("Failed to process image. Try a smaller file.", "error");
      setGenStatus("error");
    }
  }, [project, fetcher, addToast]);

  // ── Share & Upgrade ────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).catch(() => { });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast("Link copied!", "success");
  }, [addToast]);

  const handleUpgrade = useCallback(async () => {
    const ok = await setPremium(true);
    if (ok) {
      setIsPremium(true);
      setShowPaywall(false);
      addToast("🎉 Premium activated!", "success");
    }
  }, [addToast]);

  // ── Render ─────────────────────────────────────────────────────────────────
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
  const isRunning = genStatus === "analyzing"
    || fetcher.state === "submitting"
    || fetcher.state === "loading";

  return (
    <div className="visualizer">
      <Toast toasts={toasts} onDismiss={dismiss} />
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUpgrade={handleUpgrade}
        isPremium={isPremium}
      />

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
            <button
              className="btn-ghost"
              onClick={() => { setGenStatus("idle"); setGeminiError(null); }}
              title="Re-run AI analysis on your floor plan"
            >
              ↺ Regenerate
            </button>
          )}
          <button className="btn-ghost" onClick={handleShare}>
            <Share2 size={13} />
            {copied ? "Copied!" : "Share"}
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="visualizer__main">

        {/* Generating */}
        {isRunning && (
          <div className="visualizer__generating">
            <div className="gen-pulse">
              <img src={project.sourceImage || project.sourceUrl} alt="Floor plan" className="gen-pulse__image" />
              <div className="gen-pulse__overlay" />
            </div>
            <div className="gen-status">
              <Loader2 size={24} className="animate-spin text-orange-500" />
              <p className="gen-status__text">Analysing floor plan with Llama 3.2 11B Vision…</p>
              <p className="gen-status__hint">Running server-side · Reading rooms, walls &amp; doors</p>
              <div className="gen-steps">
                <div className="gen-step gen-step--active">
                  <span className="gen-step__num">1</span> Server Vision Analysis
                </div>
                <div className="gen-step__arrow">→</div>
                <div className="gen-step">
                  <span className="gen-step__num">2</span> 3D Construction
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Idle / pre-generate */}
        {!isRunning && genStatus !== "done" && (
          <div className="visualizer__idle">
            <div className="visualizer__source-preview">
              <img
                src={project.sourceImage || project.sourceUrl}
                alt="Your 2D Floor Plan"
                className="visualizer__source-img"
              />
            </div>
            <div className="visualizer__generate-panel">
              <Wand2 size={36} className="text-orange-500 mb-4" />
              <h2>Ready to generate</h2>
              <p>
                Our server-side AI will analyse every room, wall, and door in your
                floor plan to build a 3D model that exactly matches your layout.
              </p>
              {geminiError && (
                <div className="visualizer__error-msg" style={{ marginTop: "1rem", textAlign: "left", fontSize: "0.8rem" }}>
                  <strong>⚠ Last AI Error:</strong> {geminiError}
                </div>
              )}
              {genStatus === "error" && !geminiError && (
                <div className="visualizer__error-msg">Generation failed. Please try again.</div>
              )}
              <button
                className="btn-primary btn-primary--lg mt-6"
                onClick={handleGenerate}
                disabled={isRunning}
              >
                Generate 3D Render
              </button>
              <p className="visualizer__powered">
                Powered by Llama 3.2 11B Vision · Groq · Vision Analysis
              </p>
            </div>
          </div>
        )}

        {/* Done — 3D model */}
        {!isRunning && genStatus === "done" && hasRender && (
          <div className="visualizer__content-area" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {geminiError && (
              <div style={{
                background: "#451a03", color: "#fed7aa", fontSize: "0.75rem",
                padding: "0.5rem 1rem", display: "flex", gap: "0.5rem", alignItems: "center",
              }}>
                ⚠️ Showing fallback layout — AI error: <em>{geminiError}</em>.
                Click ↺ Regenerate with a clearer floor plan image.
              </div>
            )}
            <div className="visualizer__3d-wrapper" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <FloorPlanMesh
                data={parseFloorPlan(project.floorPlanData as any)}
                projectName={project.name}
              />
            </div>
          </div>
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
      </footer>
    </div>
  );
}
