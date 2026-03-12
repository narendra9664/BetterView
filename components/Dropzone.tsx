import { useRef, useState, useCallback } from "react";
import { CloudUpload, FileImage, Loader2 } from "lucide-react";
import { useOutletContext } from "react-router";

interface DropzoneProps {
    onUploadComplete: (base64: string, projectId: string) => void;
    onError: (message: string) => void;
}

type DropzoneState = "idle" | "dragging" | "uploading" | "done" | "error";

export default function Dropzone({ onUploadComplete, onError }: DropzoneProps) {
    const [state, setState] = useState<DropzoneState>("idle");
    const [progress, setProgress] = useState(0);
    const [fileName, setFileName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        if (!file) return;

        // Validate type
        const validTypes = ["image/png", "image/jpeg", "image/webp"];
        if (!validTypes.includes(file.type)) {
            onError("Please upload a PNG, JPG, or WEBP floor plan image.");
            setState("error");
            return;
        }

        // Validate size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            onError("File is too large. Maximum size is 10MB.");
            setState("error");
            return;
        }

        setState("uploading");
        setFileName(file.name);
        setProgress(10);

        try {
            // Convert to Base64
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
            });

            setProgress(40);

            // Generate a project ID
            const projectId = Date.now().toString();

            setProgress(70);

            setProgress(100);
            setState("done");

            onUploadComplete(base64, projectId);
        } catch (error: any) {
            console.error("Upload failed:", error);
            setState("error");
            onError("Upload failed. Please try again.");
        }
    }, [onUploadComplete, onError]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setState("idle");
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    return (
        <div
            className={`dropzone ${state === "dragging" ? "dropzone--dragging" : ""} ${state === "error" ? "dropzone--error" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setState("dragging"); }}
            onDragLeave={() => setState("idle")}
            onDrop={handleDrop}
            onClick={() => {
                if (state !== "uploading") inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload floor plan image"
        >
            <input
                ref={inputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={handleFileChange}
                id="floor-plan-input"
            />

            {state === "uploading" ? (
                <div className="dropzone__content">
                    <Loader2 size={40} className="dropzone__icon dropzone__icon--spin text-orange-500" />
                    <p className="dropzone__title">Uploading {fileName}...</p>
                    <div className="dropzone__progress-bar">
                        <div className="dropzone__progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="dropzone__hint">{progress}%</p>
                </div>
            ) : state === "done" ? (
                <div className="dropzone__content">
                    <FileImage size={40} className="dropzone__icon text-green-500" />
                    <p className="dropzone__title">Upload complete!</p>
                    <p className="dropzone__hint">Redirecting to visualizer...</p>
                </div>
            ) : (
                <div className="dropzone__content">
                    <CloudUpload size={48} className={`dropzone__icon ${state === "dragging" ? "text-orange-500" : "text-zinc-400"}`} />
                    <p className="dropzone__title">
                        {state === "dragging" ? "Drop your floor plan here" : "Upload your 2D floor plan"}
                    </p>
                    <p className="dropzone__hint">Drag & drop or click to browse — PNG, JPG, WEBP up to 10MB</p>
                    <span className="dropzone__badge">Free AI Render</span>
                </div>
            )}
        </div>
    );
}
