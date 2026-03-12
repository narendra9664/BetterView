import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import Navbar from "../../components/Navbar";
import Toast, { useToast } from "../../components/ui/Toast";
import { getProjects, deleteProject, type DesignItem } from "../../lib/db.action";
import { ArrowUpRight, Clock, LayoutGrid, Plus, Loader2 } from "lucide-react";
import type { AuthOutletContext } from "../../type.d";

export function meta() {
    return [
        { title: "Dashboard — BetterView" },
        { name: "description", content: "View and manage all your AI floor plan projects." },
    ];
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { isSignedIn, signIn } = useOutletContext<AuthOutletContext>();
    const { toasts, addToast, dismiss } = useToast();
    const [projects, setProjects] = useState<DesignItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isSignedIn) {
            setLoading(false);
            return;
        }
        getProjects()
            .then(setProjects)
            .catch(() => addToast("Failed to load projects.", "error"))
            .finally(() => setLoading(false));
    }, [isSignedIn]);

    return (
        <div className="dashboard">
            <Navbar />
            <Toast toasts={toasts} onDismiss={dismiss} />

            <main className="dashboard__main">
                {/* Header */}
                <div className="dashboard__header">
                    <div>
                        <h1 className="dashboard__title"><LayoutGrid size={28} className="inline mr-2 text-orange-500" />My Projects</h1>
                        <p className="dashboard__subtitle">All your past floor plan renders in one place.</p>
                    </div>
                    <button className="btn-primary" onClick={() => navigate("/")}>
                        <Plus size={16} /> New Project
                    </button>
                </div>

                {/* Auth gate */}
                {!isSignedIn ? (
                    <div className="dashboard__empty">
                        <p className="dashboard__empty-text">Please sign in to view your projects.</p>
                        <button className="btn-primary" onClick={signIn}>Sign In with Puter</button>
                    </div>
                ) : loading ? (
                    <div className="dashboard__loading">
                        <Loader2 size={32} className="animate-spin text-orange-500" />
                        <p>Loading your projects...</p>
                    </div>
                ) : projects.length === 0 ? (
                    <div className="dashboard__empty">
                        <p className="dashboard__empty-text">No projects yet. Upload your first floor plan to get started!</p>
                        <button className="btn-primary" onClick={() => navigate("/")}>Upload a floor plan</button>
                    </div>
                ) : (
                    <div className="projects-grid">
                        {projects.map(({ id, name, renderedImage, renderedUrl, sourceImage, sourceUrl, timestamp }) => (
                            <div key={id} className="project-card group" onClick={() => navigate(`/visualizer/${id}`)}>
                                <div className="preview">
                                    <img src={renderedUrl || renderedImage || sourceUrl || sourceImage} alt={name} />
                                    {(renderedImage || renderedUrl) && (
                                        <div className="badge"><span>3D Ready</span></div>
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
                )}
            </main>
        </div>
    );
}
