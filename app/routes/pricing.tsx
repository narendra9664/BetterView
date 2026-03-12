/**
 * app/routes/pricing.tsx
 * Clean SaaS pricing page — two tiers, feature table, FAQ
 */
import { Check, X, Crown, Zap, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import Navbar from "../../components/Navbar";

export function meta() {
  return [
    { title: "Pricing — BetterView" },
    { name: "description", content: "Simple, transparent pricing for AI architectural visualisation." },
  ];
}

const FREE_FEATURES = [
  { text: "3 renders per day",               included: true  },
  { text: "2D → 3D render generation",       included: true  },
  { text: "Side-by-side compare slider",     included: true  },
  { text: "PNG download (sign-in required)", included: true  },
  { text: "3D mesh viewer",                  included: true  },
  { text: "3D mesh export (.glb)",           included: false },
  { text: "Custom wall colours",             included: false },
  { text: "Priority AI queue",               included: false },
];

const PRO_FEATURES = [
  { text: "Unlimited renders",               included: true },
  { text: "2D → 3D render generation",       included: true },
  { text: "Side-by-side compare slider",     included: true },
  { text: "PNG download (no watermark)",     included: true },
  { text: "3D mesh viewer",                  included: true },
  { text: "3D mesh export (.glb)",           included: true },
  { text: "Custom wall & floor colours",     included: true },
  { text: "Priority AI queue",               included: true },
];

const FAQS = [
  {
    q: "Do I need a credit card to start?",
    a: "No. The Free tier requires only a Puter account — no payment info needed.",
  },
  {
    q: "What AI model powers the renders?",
    a: "BetterView uses a two-step pipeline: GPT-4o Vision analyses your floor plan layout, then DALL-E generates a photorealistic top-down render from that structured description.",
  },
  {
    q: "What can I do with the .glb export?",
    a: "GLB files work in Blender, Unity, Unreal Engine, three.js, and any other 3D software. They include full geometry, materials, and UV maps.",
  },
  {
    q: "Can I cancel my subscription at any time?",
    a: "Yes. Cancel with one click — no questions asked, no penalties.",
  },
  {
    q: "Is my floor plan data private?",
    a: "Your uploads are stored in your personal Puter account. BetterView cannot access your files — only you can.",
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <div className="pricing-page">
      <Navbar />

      <main className="pricing-main">
        {/* Hero */}
        <section className="pricing-hero">
          <div className="pricing-badge">
            <Crown size={12} />
            Simple Pricing
          </div>
          <h1 className="pricing-hero__title">
            Professional renders,<br />without the agency fees
          </h1>
          <p className="pricing-hero__sub">
            Start free. Upgrade when you need exports.
          </p>
        </section>

        {/* Cards */}
        <section className="pricing-cards">
          {/* Free */}
          <div className="pricing-card">
            <div className="pricing-card__head">
              <p className="pricing-card__tier">Free</p>
              <div className="pricing-card__price">
                <span className="pricing-card__amount">$0</span>
                <span className="pricing-card__period">forever</span>
              </div>
              <p className="pricing-card__desc">
                Perfect for exploring AI architectural visualisation.
              </p>
            </div>
            <ul className="pricing-card__features">
              {FREE_FEATURES.map(({ text, included }) => (
                <li key={text} className={`pricing-feature ${!included ? "pricing-feature--dim" : ""}`}>
                  {included
                    ? <Check size={14} className="pricing-feature__icon pricing-feature__icon--yes" />
                    : <X     size={14} className="pricing-feature__icon pricing-feature__icon--no"  />
                  }
                  {text}
                </li>
              ))}
            </ul>
            <button
              className="pricing-card__cta pricing-card__cta--secondary"
              onClick={() => navigate("/")}
            >
              Get Started Free <ArrowRight size={14} />
            </button>
          </div>

          {/* Pro */}
          <div className="pricing-card pricing-card--pro">
            <div className="pricing-card__badge">
              <Zap size={11} /> Most Popular
            </div>
            <div className="pricing-card__head">
              <p className="pricing-card__tier">Pro</p>
              <div className="pricing-card__price">
                <span className="pricing-card__amount">$19</span>
                <span className="pricing-card__period">/ month</span>
              </div>
              <p className="pricing-card__desc">
                Unlimited renders, 3D mesh exports, and full customisation.
              </p>
            </div>
            <ul className="pricing-card__features">
              {PRO_FEATURES.map(({ text, included }) => (
                <li key={text} className="pricing-feature">
                  {included
                    ? <Check size={14} className="pricing-feature__icon pricing-feature__icon--yes" />
                    : <X     size={14} className="pricing-feature__icon pricing-feature__icon--no"  />
                  }
                  {text}
                </li>
              ))}
            </ul>
            <button
              className="pricing-card__cta pricing-card__cta--primary"
              onClick={() => navigate("/")}
            >
              <Crown size={14} />
              Upgrade to Pro
            </button>
            <p className="pricing-card__note">Cancel anytime · No contracts</p>
          </div>
        </section>

        {/* FAQ */}
        <section className="pricing-faq">
          <h2 className="pricing-faq__title">Frequently asked questions</h2>
          <div className="pricing-faq__grid">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="pricing-faq__item">
                <p className="pricing-faq__q">{q}</p>
                <p className="pricing-faq__a">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
