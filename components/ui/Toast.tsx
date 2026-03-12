import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
    id: string;
    variant: ToastVariant;
    message: string;
}

interface ToastProps {
    toasts: ToastMessage[];
    onDismiss: (id: string) => void;
}

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
    const Icon = ICONS[toast.variant];

    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 4000);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    return (
        <div className={`toast toast--${toast.variant}`} role="alert">
            <Icon size={18} className="toast__icon" />
            <p className="toast__message">{toast.message}</p>
            <button className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
                <X size={14} />
            </button>
        </div>
    );
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
    return (
        <div className="toast-container" aria-live="polite" aria-label="Notifications">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

// Hook to manage toast state
export function useToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = (message: string, variant: ToastVariant = "info") => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, variant, message }]);
    };

    const dismiss = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return { toasts, addToast, dismiss };
}
