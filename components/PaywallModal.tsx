/**
 * components/PaywallModal.tsx
 * Premium upgrade modal — supports simulated upgrade for portfolio demo mode.
 */
import { Crown, X, Zap, Download, Box, Sparkles } from "lucide-react";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  isPremium?: boolean;
}

const BENEFITS = [
  {
    icon: Box,
    title: "3D Mesh Export",
    description: "Download your floor plan as a .glb file — ready for Blender, Unity, or Unreal Engine.",
  },
  {
    icon: Download,
    title: "Unlimited PNG Downloads",
    description: "Export photorealistic renders at full quality with no watermarks.",
  },
  {
    icon: Zap,
    title: "Priority Generation",
    description: "Skip the queue with dedicated AI compute for faster renders.",
  },
  {
    icon: Sparkles,
    title: "Advanced Customisation",
    description: "Wall colours, floor materials, and furniture styles in the 3D mesh viewer.",
  },
];

export default function PaywallModal({
  isOpen,
  onClose,
  onUpgrade,
  isPremium = false,
}: PaywallModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Premium upgrade"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        {/* Header */}
        <div className="modal__header">
          <div className="modal__icon-wrap">
            <Crown size={28} className="text-orange-500" />
          </div>
          <h2 className="modal__title">Unlock BetterView Pro</h2>
          <p className="modal__subtitle">
            Everything you need for professional architectural visualisation.
          </p>
        </div>

        {/* Benefits */}
        <ul className="modal__benefits">
          {BENEFITS.map(({ icon: Icon, title, description }) => (
            <li key={title} className="modal__benefit">
              <div className="modal__benefit-icon">
                <Icon size={16} className="text-orange-500" />
              </div>
              <div>
                <p className="modal__benefit-title">{title}</p>
                <p className="modal__benefit-desc">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Pricing */}
        <div className="modal__pricing">
          <span className="modal__price">$19</span>
          <span className="modal__price-period">/ month</span>
          <span className="modal__price-tag">Cancel anytime</span>
        </div>

        {/* CTA */}
        <div className="modal__footer">
          <button className="btn-primary w-full" onClick={onUpgrade}>
            <Crown size={14} />
            Upgrade to Pro
          </button>
          {/* Demo note — remove in production */}
          <p className="modal__demo-note">
            🎭 Portfolio demo — clicking "Upgrade" simulates a premium account
          </p>
          <button className="modal__dismiss" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
