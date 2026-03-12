import type { Route } from "./+types/home";
import Navbar from "../../components/Navbar";
import Dropzone from "../../components/Dropzone";
import Toast, { useToast } from "../../components/ui/Toast";
import { ArrowRight, ArrowUpRight, Clock, ScanLine, Layers3, Box } from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { createProject, getProjects, type DesignItem } from "../../lib/db.action";
import { useOutletContext } from "react-router";
import type { AuthOutletContext } from "../../type.d";

export function meta({ }: Route.MetaArgs) {
    return [
        { title: "BetterView — AI Architectural Visualization" },
        { name: "description", content: "Convert 2D floor plans into photorealistic 3D renders in seconds. Free, powered by AI." },
    ];
}

const FEATURES = [
    { icon: ScanLine, title: "Precise Geometry", description: "Walls, doors, and windows are perfectly preserved from your original sketch." },
    { icon: Layers3, title: "AI-Powered", description: "Uses Llama 3.2 11B Vision, one of the world's most capable open-source vision AI models via Hugging Face." },
    { icon: Box, title: "3D Mesh Export", description: "Pro users can download a .gltf or .obj 3D model for use in any 3D software." },
];

export default function Home() {
    const navigate = useNavigate();
    const { toasts, addToast, dismiss } = useToast();
    const [projects, setProjects] = useState<DesignItem[]>([]);
    const isCreatingRef = useRef(false);
    const { isSignedIn, userName } = useOutletContext<AuthOutletContext>();

    const handleUploadComplete = async (base64: string, projectId: string) => {
        if (isCreatingRef.current) return;
        isCreatingRef.current = true;
        try {
            const name = `Residence ${projectId}`;
            const item: DesignItem = {
                id: projectId,
                name,
                sourceUrl: "",       // Will be set after hosting
                sourceImage: base64, // Base64 fallback
                timestamp: Date.now(),
            };

            const saved = await createProject(item);
            if (!saved) {
                addToast("Failed to save your project. Please try again.", "error");
                return;
            }

            setProjects(prev => [saved, ...prev]);
            addToast("Floor plan uploaded! Redirecting to visualizer...", "success");
            setTimeout(() => navigate(`/visualizer/${projectId}`), 800);
        } catch {
            addToast("An unexpected error occurred.", "error");
        } finally {
            isCreatingRef.current = false;
        }
    };

    useEffect(() => {
        getProjects().then(setProjects).catch(() => { });
    }, [isSignedIn]);

    return (
        <div className="home">
            <Navbar />
            <Toast toasts={toasts} onDismiss={dismiss} />

            {/* ── Hero ── */}
            <section className="hero">
                <div className="announce">
                    <div className="dot"><div className="pulse" /></div>
                    <p>Now powered by Llama 3.2 11B (Hugging Face)</p>
                </div>

                <h1>Turn 2D blueprints into<br /> photorealistic 3D renders</h1>

                <p className="subtitle">
                    Upload any floor plan and let our AI generate a fully furnished, top-down 3D architectural render — completely free.
                </p>

                <a href="#upload" className="cta">
                    Start for Free <ArrowRight className="icon" />
                </a>

                {/* Upload shell */}
                <div id="upload" className="upload-shell">
                    <div className="grid-overlay" />
                    <div className="upload-card">
                        <div className="upload-head">
                            <div className="upload-icon"><Layers3 className="icon" /></div>
                            <h3>Upload your floor plan</h3>
                            <p>PNG, JPG, WEBP — up to 10MB</p>
                        </div>
                        <Dropzone onUploadComplete={handleUploadComplete} onError={msg => addToast(msg, "error")} />
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="features">
                <div className="section-inner">
                    <h2 className="section-title">Why BetterView?</h2>
                    <div className="features-grid">
                        {FEATURES.map(({ icon: Icon, title, description }) => (
                            <div key={title} className="feature-card">
                                <div className="feature-icon"><Icon size={22} /></div>
                                <h3>{title}</h3>
                                <p>{description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Recent Projects ── */}
            {projects.length > 0 && (
                <section className="projects">
                    <div className="section-inner">
                        <div className="section-head">
                            <div className="copy">
                                <h2>{isSignedIn ? "Your Projects" : "Community Projects"}</h2>
                                <p>{isSignedIn ? `Welcome back, ${userName}!` : "Sign in to see your past projects."}</p>
                            </div>
                            {isSignedIn && (
                                <a href="/dashboard" className="btn-ghost">View All →</a>
                            )}
                        </div>
                        <div className="projects-grid">
                            {projects.slice(0, 6).map(({ id, name, renderedImage, renderedUrl, sourceImage, sourceUrl, timestamp }) => (
                                <div key={id} className="project-card group" onClick={() => navigate(`/visualizer/${id}`)}>
                                    <div className="preview">
                                        <img src={renderedUrl || renderedImage || sourceUrl || sourceImage} alt={name} />
                                        {(renderedImage || renderedUrl) && (
                                            <div className="badge"><span>3D Rendered</span></div>
                                        )}
                                    </div>
                                    <div className="card-body">
                                        <div>
                                            <h3>{name}</h3>
                                            <div className="meta">
                                                <Clock size={12} />
                                                <span>{new Date(timestamp).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="arrow"><ArrowUpRight size={18} /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}