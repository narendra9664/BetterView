import type { Route } from "./+types/home";
import Navbar from "../../components/Navbar";
import Dropzone from "../../components/Dropzone";
import Toast, { useToast } from "../../components/ui/Toast";
import {
    ArrowRight, ArrowUpRight, Clock, ScanLine, Layers3, Box,
    Zap, Droplets, Flame, Building2, TrendingUp, Star, MapPin
} from "lucide-react";
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
    {
        icon: ScanLine,
        title: "Precise Geometry",
        description: "Walls, doors, and windows are perfectly preserved from your original sketch via OpenCV computer vision.",
        accent: "#4a7bff",
    },
    {
        icon: Zap,
        title: "Utility Overlays",
        description: "Visualise electrical circuits, gas lines, and water pipes directly on your 3D floor plan in real time.",
        accent: "#00ffb8",
    },
    {
        icon: Building2,
        title: "Property Analytics",
        description: "Live mortgage calculator, similar property comparisons, and valuation estimates built right in.",
        accent: "#F26B22",
    },
    {
        icon: Layers3,
        title: "3D Mesh Export",
        description: "Pro users can download a .gltf or .obj 3D model for use in any 3D software.",
        accent: "#a855f7",
    },
];

const STATS = [
    { value: "10K+", label: "Floor Plans Rendered" },
    { value: "98%", label: "AI Accuracy" },
    { value: "< 30s", label: "Avg. Render Time" },
    { value: "Free", label: "To Start" },
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
            const name = `Residence ${projectId.slice(-4)}`;
            const item: DesignItem = {
                id: projectId,
                name,
                sourceUrl: "",
                sourceImage: base64,
                timestamp: Date.now(),
            };
            const saved = await createProject(item);
            if (!saved) { addToast("Failed to save your project. Please try again.", "error"); return; }
            setProjects(prev => [saved, ...prev]);
            addToast("Floor plan uploaded! Redirecting…", "success");
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
        <div className="home-dark">
            <Navbar />
            <Toast toasts={toasts} onDismiss={dismiss} />

            {/* ── Hero ── */}
            <section className="hero-dark">
                <div className="hero-dark__bg" />

                <div className="hero-dark__inner">
                    <div className="hero-dark__badge">
                        <span className="hero-dark__badge-dot" />
                        AI-Powered Real Estate Visualization
                    </div>

                    <h1 className="hero-dark__title">
                        Turn 2D blueprints<br />
                        <span className="hero-dark__title-accent">into living spaces</span>
                    </h1>

                    <p className="hero-dark__subtitle">
                        Upload any floor plan and let our AI generate a fully furnished,
                        interactive 3D architectural render with utility overlays and
                        property analytics — free.
                    </p>

                    <div className="hero-dark__actions">
                        <a href="#upload" className="hero-dark__cta">
                            Start for Free <ArrowRight size={16} />
                        </a>
                        <a href="/dashboard" className="hero-dark__cta-ghost">
                            View Projects
                        </a>
                    </div>

                    {/* Stats strip */}
                    <div className="hero-dark__stats">
                        {STATS.map(({ value, label }) => (
                            <div key={label} className="hero-dark__stat">
                                <span className="hero-dark__stat-val">{value}</span>
                                <span className="hero-dark__stat-label">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Upload Card */}
                <div id="upload" className="upload-dark">
                    <div className="upload-dark__glow" />
                    <div className="upload-dark__card">
                        <div className="upload-dark__head">
                            <div className="upload-dark__icon-wrap">
                                <Layers3 size={24} className="text-orange-400" />
                            </div>
                            <h3 className="upload-dark__title">Upload your floor plan</h3>
                            <p className="upload-dark__sub">PNG, JPG, WEBP — up to 10MB</p>
                        </div>
                        <Dropzone onUploadComplete={handleUploadComplete} onError={msg => addToast(msg, "error")} />
                        <div className="upload-dark__tags">
                            {["Electrical", "Gas", "Water", "3D Model", "Analytics"].map(t => (
                                <span key={t} className="upload-dark__tag">{t}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="features-dark">
                <div className="features-dark__inner">
                    <p className="features-dark__eyebrow">Everything you need</p>
                    <h2 className="features-dark__title">Why BetterView?</h2>
                    <div className="features-dark__grid">
                        {FEATURES.map(({ icon: Icon, title, description, accent }) => (
                            <div key={title} className="feature-dark-card">
                                <div className="feature-dark-card__icon" style={{ background: `${accent}15`, color: accent }}>
                                    <Icon size={22} />
                                </div>
                                <h3 className="feature-dark-card__title">{title}</h3>
                                <p className="feature-dark-card__desc">{description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Recent Projects ── */}
            {projects.length > 0 && (
                <section className="projects-dark">
                    <div className="projects-dark__inner">
                        <div className="projects-dark__head">
                            <div>
                                <p className="features-dark__eyebrow">Your work</p>
                                <h2 className="features-dark__title" style={{ textAlign: "left" }}>
                                    {isSignedIn ? "Recent Projects" : "Community Projects"}
                                </h2>
                                <p className="projects-dark__sub">
                                    {isSignedIn ? `Welcome back, ${userName}!` : "Sign in to see your past projects."}
                                </p>
                            </div>
                            {isSignedIn && (
                                <a href="/dashboard" className="hero-dark__cta-ghost">View All →</a>
                            )}
                        </div>
                        <div className="projects-dark__grid">
                            {projects.slice(0, 6).map(({ id, name, renderedImage, renderedUrl, sourceImage, sourceUrl, timestamp }) => (
                                <div key={id} className="project-dark-card group" onClick={() => navigate(`/visualizer/${id}`)}>
                                    <div className="project-dark-card__preview">
                                        <img src={renderedUrl || renderedImage || sourceUrl || sourceImage} alt={name} />
                                        {(renderedImage || renderedUrl) && (
                                            <div className="project-dark-card__badge">
                                                <Star size={9} /> 3D Ready
                                            </div>
                                        )}
                                        <div className="project-dark-card__hover-overlay">
                                            <ArrowUpRight size={20} />
                                        </div>
                                    </div>
                                    <div className="project-dark-card__body">
                                        <div>
                                            <h3>{name}</h3>
                                            <div className="project-dark-card__meta">
                                                <Clock size={11} />
                                                <span>{new Date(timestamp).toLocaleDateString()}</span>
                                                <MapPin size={11} className="ml-2" />
                                                <span>Floor Plan</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── Footer CTA ── */}
            <section className="footer-cta-dark">
                <div className="footer-cta-dark__inner">
                    <h2>Ready to visualize?</h2>
                    <p>Join thousands of architects and real estate professionals.</p>
                    <a href="#upload" className="hero-dark__cta">
                        Upload Free <ArrowRight size={16} />
                    </a>
                </div>
            </section>
        </div>
    );
}
