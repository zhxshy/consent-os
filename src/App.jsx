import { useState, useMemo, useEffect } from "react";
import {
  grantConsent,
  subscribeAuth, signInWithGoogle, signOutUser,
  subscribePermissions, writePermission, revokePermission, panicRevokeAll, checkPermission,
  logActivity, subscribeHistory,
} from "./firebase-integration";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldCheck, ShieldAlert, X, Plus, Clock, CheckCircle,
  Trash2, Activity, MapPin, Mail, CreditCard, Phone, Camera,
  Users, Cpu, Database, ChevronRight, Lock, Unlock, Eye,
  AlertTriangle, GitBranch, Fingerprint, FileText, Home, Scan,
  Receipt, TrendingUp, BookOpen, ClipboardList, Calendar,
  Heart, Pill, Syringe, Timer, LogOut,
} from "lucide-react";

// ── Utility ───────────────────────────────────────────────────────────────────

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// ── DATA MODEL ────────────────────────────────────────────────────────────────

const SERVICES_DB = [
  { id: "google-maps", name: "Google Maps",  category: "Navigation",    desc: "Real-time routing & location",                 baseRisk: 2 },
  { id: "paypal",      name: "PayPal",        category: "Finance",       desc: "Payments & fund transfers",                    baseRisk: 4 },
  { id: "linkedin",    name: "LinkedIn",      category: "Professional",  desc: "Career & professional network",                baseRisk: 2 },
  { id: "amazon",      name: "Amazon",        category: "Shopping",      desc: "E-commerce & cloud services",                  baseRisk: 3 },
  { id: "spotify",     name: "Spotify",       category: "Entertainment", desc: "Music streaming & discovery",                  baseRisk: 1 },
  { id: "meta",        name: "Meta",          category: "Social",        desc: "Social graph & advertising",                   baseRisk: 5 },
  { id: "apple",       name: "Apple Health",  category: "Health",        desc: "Biometric & activity tracking",                baseRisk: 4 },
  { id: "egov-kz",     name: "eGov.kz",       category: "Government",    desc: "Central hub for state citizen services",       baseRisk: 5, flag: "🇰🇿" },
  { id: "kaspi-kz",    name: "Kaspi.kz",      category: "Finance",       desc: "Fintech ecosystem — payments, loans & marketplace", baseRisk: 5, flag: "🇰🇿" },
  { id: "nis-mektep",  name: "NIS Mektep",    category: "Education",     desc: "NIS academic portal — student records & assessments", baseRisk: 1, flag: "🇰🇿" },
  { id: "damumed",     name: "Damumed",       category: "Healthcare",    desc: "Unified healthcare platform for medical records", baseRisk: 4, flag: "🇰🇿" },
  { id: "TestApp",     name: "TestApp",       category: "Demo",          desc: "Middleware SDK demo — simulates third-party contact data request", baseRisk: 0 },
];

const DATA_TYPES = {
  location:     { label: "Location",        Icon: MapPin,        weight: 3, sensitive: true  },
  email:        { label: "Email",            Icon: Mail,          weight: 1, sensitive: false },
  financial:    { label: "Financial",        Icon: CreditCard,    weight: 5, sensitive: true  },
  phone:        { label: "Phone",            Icon: Phone,         weight: 2, sensitive: false },
  photos:       { label: "Photos",           Icon: Camera,        weight: 2, sensitive: true  },
  contacts:     { label: "Contacts",         Icon: Users,         weight: 3, sensitive: true  },
  device_id:    { label: "Device ID",        Icon: Cpu,           weight: 2, sensitive: false },
  national_id:  { label: "IIN / Nat. ID",   Icon: Fingerprint,   weight: 5, sensitive: true  },
  documents:    { label: "Digital Docs",    Icon: FileText,      weight: 3, sensitive: true  },
  property:     { label: "Property Rec.",   Icon: Home,          weight: 4, sensitive: true  },
  biometric:    { label: "Biometrics",      Icon: Scan,          weight: 5, sensitive: true  },
  transactions: { label: "Transactions",    Icon: Receipt,       weight: 4, sensitive: true  },
  credit_score: { label: "Credit Score",    Icon: TrendingUp,    weight: 4, sensitive: true  },
  academic:     { label: "Academic Rec.",   Icon: BookOpen,      weight: 1, sensitive: true  },
  assessments:  { label: "Assessments",     Icon: ClipboardList, weight: 1, sensitive: false },
  behavioral:   { label: "Behavioral Log",  Icon: Activity,      weight: 2, sensitive: true  },
  attendance:   { label: "Attendance",      Icon: Calendar,      weight: 1, sensitive: false },
  medical:      { label: "Medical History", Icon: Heart,         weight: 5, sensitive: true  },
  prescriptions:{ label: "Prescriptions",   Icon: Pill,          weight: 4, sensitive: true  },
  vaccination:  { label: "Vaccination",     Icon: Syringe,       weight: 3, sensitive: true  },
  appointments: { label: "Appointments",    Icon: Clock,         weight: 2, sensitive: false },
};


// ── RISK ENGINE ───────────────────────────────────────────────────────────────

function calcRisk(dataTypes, baseRisk = 0) {
  return Math.min(10, dataTypes.reduce((s, dt) => s + (DATA_TYPES[dt]?.weight ?? 1), 0) + baseRisk);
}

// Hex values — used by SVG DataFlowViz
function riskMeta(score) {
  if (score <= 3) return { label: "Low",    color: "#10b981", glow: "rgba(16,185,129,0.25)", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" };
  if (score <= 6) return { label: "Medium", color: "#f59e0b", glow: "rgba(245,158,11,0.25)",  bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)"  };
  return               { label: "High",   color: "#ef4444", glow: "rgba(239,68,68,0.25)",   bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)"   };
}

// Tailwind classes — used by all HTML components
function riskTw(score) {
  if (score <= 3) return { label: "Low",    text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", dot: "bg-emerald-400" };
  if (score <= 6) return { label: "Medium", text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25",   dot: "bg-amber-400"   };
  return               { label: "High",   text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/25",     dot: "bg-red-400"     };
}

function timeAgo(date) {
  const d = Math.floor((Date.now() - new Date(date)) / 864e5);
  return d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
}

function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return Math.floor(hrs / 24) === 1 ? "Yesterday" : `${Math.floor(hrs / 24)}d ago`;
}

// ── CATEGORY COLOURS ──────────────────────────────────────────────────────────

const CATEGORY_COLORS = {
  Finance: "#f59e0b", Navigation: "#10b981", Professional: "#3b82f6",
  Shopping: "#8b5cf6", Entertainment: "#ec4899", Social: "#ef4444",
  Health: "#06b6d4", Government: "#0ea5e9", Education: "#a855f7", Healthcare: "#14b8a6",
  Demo: "#8b5cf6",
};

const CATEGORY_TW = {
  Finance:      { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25"  },
  Navigation:   { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25" },
  Professional: { text: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/25"   },
  Shopping:     { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/25"  },
  Entertainment:{ text: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-pink-500/25"   },
  Social:       { text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/25"    },
  Health:       { text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/25"   },
  Government:   { text: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/25"    },
  Education:    { text: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/25"  },
  Healthcare:   { text: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/25"   },
  Demo:         { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/25" },
};
const DFLT_CAT = { text: "text-slate-400", bg: "bg-slate-800/60", border: "border-slate-700/50" };

const PARTICLE_OFFSETS = [0, 0.6, 1.2];

// ── RISK BADGE ────────────────────────────────────────────────────────────────

function RiskBadge({ score, size = "sm" }) {
  const r      = riskTw(score);
  const isHigh = score > 6;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full font-bold border uppercase tracking-widest",
      r.text, r.bg, r.border,
      size === "lg" ? "text-[12px] px-3 py-1" : "text-[10px] px-2.5 py-0.5",
      isHigh && "animate-pulse"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", r.dot)} />
      {r.label} · {score}/10
    </span>
  );
}

// ── DATA TYPE PILL ────────────────────────────────────────────────────────────

function DataTypePill({ type, removable, onRemove }) {
  const dt = DATA_TYPES[type];
  if (!dt) return null;
  const { Icon } = dt;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-800/60 border border-slate-700/50 text-slate-400 whitespace-nowrap">
      <Icon size={10} />
      {dt.label}
      {removable && (
        <button onClick={onRemove} className="ml-0.5 flex text-slate-600 hover:text-slate-300 transition-colors">
          <X size={9} />
        </button>
      )}
    </span>
  );
}

// ── DATA FLOW VISUALISATION (SVG — internal styles kept as-is) ────────────────

function DataFlowViz({ consents, revoking }) {
  const W = 380, H = 280, cx = W / 2, cy = H / 2, R = 105;

  const nodes = consents.map((c, i) => {
    const angle = (2 * Math.PI * i) / consents.length - Math.PI / 2;
    const svc   = SERVICES_DB.find((s) => s.id === c.serviceId);
    const score = calcRisk(c.dataTypes, svc?.baseRisk ?? 0);
    const m     = riskMeta(score);
    return { ...c, svc, score, m, isRevoking: revoking === c.id,
      x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });

  return (
    <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <GitBranch size={12} /> Live Data Flow
        </span>
        <span className="text-[11px] text-slate-600">
          {consents.length} active link{consents.length !== 1 ? "s" : ""}
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <defs>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
          </radialGradient>
          <filter id="particleGlow">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Connection lines */}
        <AnimatePresence>
          {nodes.map((n) => (
            <motion.line key={n.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: n.isRevoking ? 0.15 : 0.45 }}
              exit={{ opacity: 0 }}
              x1={cx} y1={cy} x2={n.x} y2={n.y}
              stroke={n.isRevoking ? "#334155" : n.m.color}
              strokeWidth={n.isRevoking ? 1 : n.score > 6 ? 2 : 1.5}
              strokeDasharray={n.isRevoking ? "3 9" : "4 4"}
              style={{ transition: "stroke 0.4s, stroke-dasharray 0.4s" }}
            />
          ))}
        </AnimatePresence>

        {/* Data particles */}
        <AnimatePresence>
          {nodes.filter((n) => !n.isRevoking).map((n) =>
            PARTICLE_OFFSETS.map((delay, i) => (
              <motion.circle key={`p-${n.id}-${i}`}
                cx={cx} cy={cy} r={2.2} fill={n.m.color}
                filter="url(#particleGlow)"
                initial={{ x: 0, y: 0, opacity: 0 }}
                animate={{ x: [0, n.x - cx], y: [0, n.y - cy], opacity: [0, 1, 1, 0] }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ duration: 1.8, delay, repeat: Infinity, ease: "linear", times: [0, 0.1, 0.85, 1] }}
              />
            ))
          )}
        </AnimatePresence>

        {/* High-risk pulse rings */}
        {nodes.filter((n) => n.score > 6 && !n.isRevoking).map((n) => (
          <motion.circle key={`pulse-${n.id}`}
            cx={n.x} cy={n.y} r={14} fill="none"
            stroke={n.m.color} strokeWidth={1}
            initial={{ r: 14, opacity: 0.5 }}
            animate={{ r: [14, 22, 14], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        ))}

        {/* Central YOU node */}
        <circle cx={cx} cy={cy} r={26} fill="url(#coreGrad)" />
        <circle cx={cx} cy={cy} r={26} fill="none" stroke="#06b6d4" strokeWidth={1.5} strokeOpacity={0.6} />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#06b6d4" fontSize={11} fontWeight={700}>YOU</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fill="#0891b2" fontSize={9}>user@os</text>

        {/* Service nodes */}
        <AnimatePresence>
          {nodes.map((n) => (
            <motion.g key={n.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: n.isRevoking ? 0.3 : 1, scale: n.isRevoking ? 0.85 : 1 }}
              exit={{ opacity: 0, scale: 0.3 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            >
              <circle cx={n.x} cy={n.y} r={20}
                fill={n.isRevoking ? "rgba(51,65,85,0.3)" : n.m.bg}
                stroke={n.isRevoking ? "#334155" : n.m.border} strokeWidth={1.5}
              />
              <text x={n.x} y={n.y - 3} textAnchor="middle"
                fill={n.isRevoking ? "#475569" : n.m.color} fontSize={9} fontWeight={700}>
                {n.svc?.name.slice(0, 6).toUpperCase()}
              </text>
              <text x={n.x} y={n.y + 7} textAnchor="middle"
                fill={n.isRevoking ? "#475569" : n.m.color} fontSize={8} opacity={0.7}>
                {n.isRevoking ? "···" : `${n.score}/10`}
              </text>
            </motion.g>
          ))}
        </AnimatePresence>

        {consents.length === 0 && (
          <text x={cx} y={cy + 50} textAnchor="middle" fill="#334155" fontSize={12}>
            No active connections
          </text>
        )}
      </svg>
    </div>
  );
}

// ── HISTORY LOG ───────────────────────────────────────────────────────────────

function HistoryLog({ history }) {
  const entries = history.slice(0, 10);
  return (
    <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Activity size={12} /> Recent Activity
        </span>
        <span className="text-[11px] text-slate-700">last {entries.length} actions</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-center text-slate-700 text-xs py-5">No activity yet</p>
      ) : (
        <div className="flex flex-col">
          <AnimatePresence initial={false}>
            {entries.map((h, i) => {
              const svc     = SERVICES_DB.find((s) => s.id === h.serviceId);
              const granted = h.action === "GRANTED";
              const catHex  = CATEGORY_COLORS[svc?.category] || "#94a3b8";
              const isLast  = i === entries.length - 1;
              return (
                <motion.div key={h.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="flex items-stretch gap-0"
                >
                  {/* Timeline column */}
                  <div className="flex flex-col items-center w-8 flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                      style={{ background: `${catHex}15`, border: `1.5px solid ${catHex}40`, color: catHex }}>
                      {svc?.name.slice(0, 2).toUpperCase() ?? "??"}
                    </div>
                    {!isLast && <div className="w-px flex-1 min-h-[12px] bg-slate-800/80 my-1" />}
                  </div>

                  {/* Content */}
                  <div className={cn("flex-1 pl-3 pt-0.5", !isLast && "pb-3.5")}>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-slate-200 leading-tight">
                        {svc?.name ?? h.serviceId}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border flex-shrink-0",
                        granted
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                          : "text-red-400 bg-red-500/10 border-red-500/25"
                      )}>
                        {granted ? <Unlock size={9} /> : <Lock size={9} />}
                        {granted ? "Granted" : "Revoked"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-slate-600 truncate min-w-0 flex-1">
                        {(() => {
                          const labels = h.dataTypes
                            .map((dt) => DATA_TYPES[dt]?.label)
                            .filter(Boolean);
                          const visible = labels.slice(0, 3);
                          const overflow = labels.length - 3;
                          return (
                            <>
                              {visible.join(" · ")}
                              {overflow > 0 && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/50 text-slate-500 whitespace-nowrap flex-shrink-0 inline-flex">
                                  +{overflow} more
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                      <span className="text-[11px] text-slate-700 flex items-center gap-1 flex-shrink-0">
                        <Clock size={9} /> {relativeTime(h.timestamp)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── CONSENT CARD ──────────────────────────────────────────────────────────────

function ConsentCard({ consent, isRevoking, onRevoke, isPanicking }) {
  const svc    = SERVICES_DB.find((s) => s.id === consent.serviceId);
  const score  = calcRisk(consent.dataTypes, svc?.baseRisk ?? 0);
  const rm     = riskMeta(score);
  const catTw  = CATEGORY_TW[svc?.category] ?? DFLT_CAT;

  // Live countdown for ephemeral grants
  const [msLeft, setMsLeft] = useState(
    consent.expiresAt ? consent.expiresAt - Date.now() : null
  );
  useEffect(() => {
    if (!consent.expiresAt) return;
    const tick = () => setMsLeft(consent.expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [consent.expiresAt]);

  const isEphemeral = consent.expiresAt != null;
  const isExpired   = isEphemeral && msLeft !== null && msLeft <= 0;
  const minsLeft    = msLeft !== null ? Math.ceil(msLeft / 60000) : null;

  return (
    <motion.div layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={isPanicking
        ? { opacity: 0, scale: 0.72, y: -24, filter: "blur(6px)", transition: { duration: 0.22, ease: "easeIn" } }
        : { opacity: 0, x: -24, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="relative bg-slate-900/50 border border-slate-800/60 rounded-xl p-5 mb-2.5
                 backdrop-blur-sm hover:bg-slate-900/70 hover:border-slate-700/60
                 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]
                 transition-all duration-200 overflow-hidden"
    >
      {/* Risk accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
        style={{ background: rm.color, opacity: 0.8 }} />

      {/* Vertical stack — three independent rows */}
      <div className="flex flex-col gap-2.5 pl-4">

        {/* Row 1: Service identity + Revoke button */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[15px] font-bold text-slate-100 leading-tight">{svc?.name}</span>
              {svc?.flag && <span className="text-sm leading-none">{svc.flag}</span>}
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border",
                catTw.text, catTw.bg, catTw.border
              )}>{svc?.category}</span>
            </div>
            <p className="text-[12px] text-slate-500 leading-snug">{svc?.desc}</p>
          </div>

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onRevoke(consent)}
            disabled={isRevoking}
            className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg
                       border border-red-500/25 bg-red-500/10 text-red-400 text-xs font-semibold
                       hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRevoking ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="flex">
                  <Trash2 size={12} />
                </motion.span>
                Revoking…
              </>
            ) : (
              <><Trash2 size={12} /> Revoke</>
            )}
          </motion.button>
        </div>

        {/* Row 2: Data type pills — wraps freely, never overflows */}
        {consent.dataTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {consent.dataTypes.map((dt) => <DataTypePill key={dt} type={dt} />)}
          </div>
        )}

        {/* Row 3: Status row — always last, always visible */}
        <div className="flex items-center gap-3 flex-wrap">
          <RiskBadge score={score} />
          <span className="text-[11px] text-slate-600 flex items-center gap-1">
            <Clock size={10} /> {timeAgo(consent.grantedAt)}
          </span>
          {isEphemeral && (
            <motion.span
              animate={!isExpired && minsLeft <= 5 ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ duration: 1.2, repeat: Infinity }}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider",
                isExpired
                  ? "text-red-400 bg-red-500/10 border-red-500/25"
                  : minsLeft <= 5
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/25"
                  : "text-sky-400 bg-sky-500/10 border-sky-500/25"
              )}
            >
              <Timer size={9} />
              {isExpired
                ? "Expired"
                : minsLeft <= 60
                ? `${minsLeft}m left`
                : `${Math.ceil(minsLeft / 60)}h left`}
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── GRANT MODAL ───────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: "Always",     value: null, Icon: Unlock },
  { label: "15 Minutes", value: 15,   Icon: Timer  },
];

function GrantModal({ available, onGrant, onClose }) {
  const [step, setStep]               = useState(0);
  const [selectedSvc, setSelectedSvc] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [duration, setDuration]       = useState(null);

  const previewScore = selectedSvc
    ? calcRisk(selectedTypes, SERVICES_DB.find((s) => s.id === selectedSvc)?.baseRisk ?? 0)
    : 0;
  const canNext  = !!selectedSvc;
  const canGrant = selectedTypes.length > 0;

  const toggleType = (t) =>
    setSelectedTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  function doGrant() {
    if (!canNext || !canGrant) return;
    onGrant({ serviceId: selectedSvc, dataTypes: selectedTypes, durationMinutes: duration });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 16 }}
        style={{ width: "min(95vw, 520px)", maxHeight: "85vh" }}
        className="flex flex-col bg-slate-950 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl shadow-black/60"
      >
        {/* Sticky header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-0">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-[17px] font-bold text-slate-100">Grant Access</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Step {step + 1} of 2 — {step === 0 ? "Select a service" : "Choose data permissions"}
              </p>
            </div>
            <button onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400
                         hover:text-slate-200 hover:bg-slate-700/60 transition-colors flex-shrink-0">
              <X size={15} />
            </button>
          </div>
          {/* Progress bars */}
          <div className="flex gap-1.5 mb-5">
            {[0, 1].map((i) => (
              <div key={i} className={cn(
                "h-0.5 flex-1 rounded-full transition-all duration-300",
                i <= step ? "bg-cyan-500" : "bg-slate-800"
              )} />
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-1">
          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.div key="step0"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.17 }}>
                <p className="text-[11px] text-slate-600 mb-3 uppercase tracking-wider font-medium">Available services</p>
                <div className="flex flex-col gap-2">
                  {available.length === 0 ? (
                    <p className="text-center text-slate-600 text-sm py-8">All services are already connected</p>
                  ) : available.map((svc) => {
                    const catTw = CATEGORY_TW[svc.category] ?? DFLT_CAT;
                    const sel   = selectedSvc === svc.id;
                    return (
                      <motion.div key={svc.id} whileHover={{ scale: 1.005 }}
                        onClick={() => setSelectedSvc(svc.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 p-3.5 rounded-xl cursor-pointer border transition-all duration-150",
                          sel
                            ? "bg-cyan-500/10 border-cyan-500/35"
                            : "bg-slate-900/50 border-slate-800/60 hover:border-slate-700/60"
                        )}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[13px] font-semibold text-slate-100">{svc.name}</span>
                            {svc.flag && <span className="text-xs">{svc.flag}</span>}
                            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider border", catTw.text, catTw.bg, catTw.border)}>
                              {svc.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">{svc.desc}</p>
                        </div>
                        {sel && <CheckCircle size={16} className="text-cyan-400 flex-shrink-0" />}
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div key="step1"
                initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.17 }}>
                <p className="text-[11px] text-slate-600 mb-3">
                  Sharing with{" "}
                  <span className="text-slate-200 font-semibold">
                    {SERVICES_DB.find((s) => s.id === selectedSvc)?.name}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {Object.entries(DATA_TYPES).map(([key, dt]) => {
                    const { Icon } = dt;
                    const active = selectedTypes.includes(key);
                    return (
                      <motion.div key={key} whileHover={{ scale: 1.02 }}
                        onClick={() => toggleType(key)}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-all duration-150",
                          active
                            ? "bg-cyan-500/8 border-cyan-500/30"
                            : "bg-slate-900/50 border-slate-800/60 hover:border-slate-700/60"
                        )}>
                        <div className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
                          active ? "bg-cyan-500/15" : "bg-slate-800/60"
                        )}>
                          <Icon size={12} className={active ? "text-cyan-400" : "text-slate-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-[11px] font-semibold truncate", active ? "text-slate-100" : "text-slate-400")}>
                            {dt.label}
                          </p>
                          <p className="text-[9px] text-slate-600">+{dt.weight} risk</p>
                        </div>
                        {dt.sensitive && <AlertTriangle size={9} className="text-amber-500 flex-shrink-0" />}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Access Duration selector */}
                <div className="mb-3">
                  <p className="text-[11px] text-slate-600 mb-2 uppercase tracking-wider font-medium">Access Duration</p>
                  <div className="flex gap-2">
                    {DURATION_OPTIONS.map(({ label, value, Icon }) => {
                      const sel = duration === value;
                      return (
                        <motion.button key={label}
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          onClick={() => setDuration(value)}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[12px] font-semibold border transition-all duration-150 flex items-center justify-center gap-1.5",
                            sel
                              ? value === null
                                ? "bg-cyan-500/10 border-cyan-500/35 text-cyan-400"
                                : "bg-amber-500/10 border-amber-500/35 text-amber-400"
                              : "bg-slate-900/50 border-slate-800/60 text-slate-500 hover:border-slate-700/60 hover:text-slate-400"
                          )}>
                          <Icon size={11} /> {label}
                        </motion.button>
                      );
                    })}
                  </div>
                  {duration != null && (
                    <p className="text-[10px] text-amber-500/70 mt-1.5 flex items-center gap-1">
                      <Timer size={9} /> Permission auto-expires after {duration} minutes.
                    </p>
                  )}
                </div>

                {/* Risk preview */}
                {canGrant && (() => {
                  const r = riskTw(previewScore);
                  return (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className={cn("flex items-center justify-between p-3 rounded-xl border mb-1", r.bg, r.border)}>
                      <span className={cn("text-[11px] font-medium", r.text)}>Risk Preview</span>
                      <RiskBadge score={previewScore} size="lg" />
                    </motion.div>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-slate-800/60 bg-slate-950/90">
          {step === 0 ? (
            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={() => canNext && setStep(1)} disabled={!canNext}
              className={cn(
                "w-full py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 border transition-all duration-200",
                canNext
                  ? "bg-cyan-500/10 border-cyan-500/35 text-cyan-400 hover:bg-cyan-500/20"
                  : "bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed"
              )}>
              Next <ChevronRight size={13} />
            </motion.button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setStep(0)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-700/50 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-all duration-200">
                ← Back
              </button>
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={doGrant} disabled={!canGrant}
                className={cn(
                  "flex-[2] py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 border transition-all duration-200",
                  canGrant
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed"
                )}>
                <CheckCircle size={13} /> Grant Access
              </motion.button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── PANIC MODAL ──────────────────────────────────────────────────────────────

function PanicModal({ count, onConfirm, onCancel }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.88, y: 12 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="w-[min(95vw,420px)] bg-slate-950 border border-red-500/40 rounded-2xl p-7 shadow-2xl shadow-red-500/10"
      >
        {/* Pulsing icon */}
        <div className="flex justify-center mb-5">
          <motion.div
            animate={{ scale: [1, 1.12, 1], boxShadow: ["0 0 0px rgba(239,68,68,0)", "0 0 22px rgba(239,68,68,0.35)", "0 0 0px rgba(239,68,68,0)"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/35 flex items-center justify-center"
          >
            <ShieldAlert size={30} className="text-red-400" />
          </motion.div>
        </div>

        <h2 className="text-[18px] font-black text-slate-100 text-center mb-2 tracking-tight">
          Emergency Lockdown
        </h2>
        <p className="text-[13px] text-slate-400 text-center leading-relaxed mb-5">
          Are you sure you want to revoke{" "}
          <span className="text-red-400 font-bold">ALL {count} active data permission{count !== 1 ? "s" : ""}</span>{" "}
          immediately? This action cannot be undone.
        </p>

        {/* Warning bullets */}
        <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3.5 mb-6 space-y-1.5">
          {["All connected services will be cut off instantly",
            "A full revocation audit log will be written",
            "You can re-grant permissions manually afterward"].map((t) => (
            <div key={t} className="flex items-start gap-2 text-[12px] text-red-300/80">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              {t}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-700/60 bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-all duration-200"
          >
            Cancel
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={onConfirm}
            className="flex-[2] py-2.5 rounded-xl text-[13px] font-bold border border-red-500/60 bg-red-600/20 text-red-400 hover:bg-red-600/35 hover:border-red-500/80 flex items-center justify-center gap-2 transition-all duration-200"
          >
            <ShieldAlert size={14} /> Confirm Lockdown
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── LOGIN SCREEN ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await onLogin();
    } catch (err) {
      setError("Sign-in was cancelled or failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4"
         style={{ fontFamily: '"DM Sans", Inter, system-ui, sans-serif' }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-1/3 -left-1/4 w-2/3 h-2/3 rounded-full bg-cyan-500/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/3 -right-1/4 w-2/3 h-2/3 rounded-full bg-violet-500/[0.04] blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 w-[min(90vw,380px)] bg-slate-900/70 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-md shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center flex-shrink-0">
            <Shield size={24} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-[22px] font-black text-slate-100 tracking-tight leading-none">
              Consent<span className="text-cyan-400">OS</span>
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5">Personal Data Control Center</p>
          </div>
        </div>

        <h2 className="text-[16px] font-bold text-slate-200 mb-1.5">Sign in to continue</h2>
        <p className="text-[12px] text-slate-500 mb-7 leading-relaxed">
          Your consent settings are tied to your account and persist across sessions and page refreshes.
        </p>

        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={handleSignIn}
          disabled={busy}
          className="w-full py-3 rounded-xl border border-slate-700/60 bg-slate-800/60 text-slate-200 text-[14px] font-semibold flex items-center justify-center gap-3 hover:bg-slate-800/80 hover:border-slate-600/80 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mb-3"
        >
          {busy ? (
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} className="flex">
              <Activity size={16} />
            </motion.span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {busy ? "Signing in…" : "Continue with Google"}
        </motion.button>

        {error && (
          <p className="text-[11px] text-red-400 text-center mb-3">{error}</p>
        )}

        <p className="text-[10px] text-slate-700 text-center">
          Your data stays in your own Firestore sub-collection. Nothing is shared across accounts.
        </p>
      </motion.div>
    </div>
  );
}

// ── PROOF-OF-REVOKE SECTION ───────────────────────────────────────────────────

function ProofOfRevokeSection({ proofs }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
          <Lock size={11} /> Proof-of-Revoke
        </span>
        <span className="text-[11px] text-slate-700">
          {proofs.length} token{proofs.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {proofs.map((proof) => {
            const svc = SERVICES_DB.find((s) => s.id === proof.serviceId);
            return (
              <motion.div
                key={proof.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-slate-900/30 border border-slate-800/40 rounded-lg px-4 py-2.5"
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-500">
                      {svc?.name ?? proof.serviceId}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/8 border border-red-500/15 text-red-500/60 font-bold uppercase tracking-wider">
                      REVOKED
                    </span>
                  </div>
                  {proof.revokedAt && (
                    <span className="text-[10px] text-slate-700 flex-shrink-0">
                      {relativeTime(proof.revokedAt)}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-slate-600 break-all leading-relaxed">
                  Proof-of-Revoke: {proof.revokeToken}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── TEST APP PANEL ────────────────────────────────────────────────────────────

const SHADOW_DATA = {
  name:  "Anonymous User",
  phone: "+7 700 000 00 00",
};

function TestAppPanel({ userId }) {
  const [checking,  setChecking]  = useState(false);
  const [result,    setResult]    = useState(null); // null | doc data | false
  const [shadowing, setShadowing] = useState(true); // Data Shadowing toggle

  async function requestAccess() {
    setChecking(true);
    setResult(null);
    try {
      const perm = await checkPermission(userId, "TestApp");
      setResult(perm ?? false);
    } catch (err) {
      console.error("checkPermission failed:", err);
      setResult(false);
    } finally {
      setChecking(false);
    }
  }

  // Determine state: approved / expired / denied
  const queried     = result !== null;
  const expiresAtMs = result?.expiresAt?.toDate
    ? result.expiresAt.toDate().getTime()
    : (result?.expiresAt ? Number(result.expiresAt) : null);
  const expired  = result?.status === true && expiresAtMs != null && Date.now() > expiresAtMs;
  const approved = result?.status === true && !expired;

  return (
    <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl p-5 backdrop-blur-md">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Cpu size={12} /> Middleware Tester
        </span>
        <div className="flex items-center gap-2">
          {/* Shadow Mode toggle */}
          <motion.button
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            onClick={() => setShadowing((p) => !p)}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border transition-all duration-200 flex items-center gap-1",
              shadowing
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "bg-slate-800/60 border-slate-700/50 text-slate-500 hover:border-slate-600/60 hover:text-slate-400"
            )}
          >
            <Eye size={9} />
            Shadow {shadowing ? "ON" : "OFF"}
          </motion.button>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-400 font-bold uppercase tracking-wider">
            DEMO
          </span>
        </div>
      </div>

      {/* Code block */}
      <div className="bg-slate-950/80 border border-slate-800/40 rounded-lg p-3 mb-4 font-mono text-[10px] leading-relaxed">
        <span className="text-slate-600">{"// SDK.checkPermission('TestApp')"}</span><br />
        <span className="text-slate-600">{"// → getDoc(permissions/TestApp)"}</span><br />
        <span className="text-slate-600">{"//   .status === true  → ✅ allow"}</span><br />
        <span className={shadowing ? "text-amber-500/60" : "text-slate-600"}>
          {"//   .status === false → " + (shadowing ? "🌫️ shadow" : "❌ deny")}
        </span><br />
        <span className={shadowing ? "text-amber-500/60" : "text-slate-600"}>
          {"//   expiresAt < now   → " + (shadowing ? "🌫️ shadow" : "⏰ expired")}
        </span>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
        onClick={requestAccess}
        disabled={checking}
        className="w-full py-2.5 rounded-xl text-[13px] font-semibold border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-all duration-200 flex items-center justify-center gap-2 mb-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {checking ? (
          <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="flex">
            <Activity size={13} />
          </motion.span>
        ) : <Database size={13} />}
        Request Contact Data
      </motion.button>

      <AnimatePresence mode="wait">
        {queried ? (
          approved ? (
            /* ── Approved ── */
            <motion.div
              key="approved"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/25"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-emerald-400">✅  Access Approved</span>
                <span className="text-[10px] text-slate-600">
                  {(result?.dataTypes ?? []).length} type(s) shared
                </span>
              </div>
            </motion.div>
          ) : shadowing ? (
            /* ── Blocked + Shadow Mode ON → show noise data ── */
            <motion.div
              key="shadowed"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}
              className="rounded-xl border border-amber-500/30 bg-amber-500/8 overflow-hidden"
            >
              {/* Status row */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <span className="text-[12px] font-bold text-amber-400 flex items-center gap-1.5">
                  <motion.span
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="flex"
                  >
                    <Eye size={12} />
                  </motion.span>
                  ⚠️ Data Access: Shadowed
                </span>
                <span className="text-[10px] text-amber-500/60 font-semibold uppercase tracking-wider">
                  Privacy Filter Active
                </span>
              </div>

              {/* Noise data card */}
              <div className="mx-3 mb-2 bg-slate-950/70 border border-slate-800/50 rounded-lg px-3 py-2.5 font-mono text-[11px]">
                <span className="text-slate-600 text-[9px] uppercase tracking-wider block mb-1.5">
                  App receives (noise):
                </span>
                <span className="text-slate-400">
                  Name:{" "}
                  <span className="text-slate-200">{SHADOW_DATA.name}</span>
                  {"  |  "}
                  Phone:{" "}
                  <span className="text-slate-200">{SHADOW_DATA.phone}</span>
                </span>
              </div>

              {/* Footer label */}
              <div className="px-3 pb-3">
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  Middleware replaced real data with noise to protect your identity.
                </p>
                {expired && (
                  <p className="text-[10px] text-amber-500/50 mt-1">
                    Reason: time-limited grant ended.
                  </p>
                )}
                {!expired && result?.revokeToken && (
                  <p className="text-[10px] font-mono text-slate-700 break-all mt-1">
                    Token: {result.revokeToken}
                  </p>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Blocked + Shadow Mode OFF → raw error ── */
            <motion.div
              key={expired ? "expired" : "denied"}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className={cn(
                "p-3 rounded-xl border",
                expired ? "bg-amber-500/10 border-amber-500/25" : "bg-red-500/10 border-red-500/25"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-[13px] font-bold", expired ? "text-amber-400" : "text-red-400")}>
                  {expired ? "⏰  Access Expired" : "❌  Access Denied"}
                </span>
                <span className="text-[10px] text-slate-600">
                  {expired ? "Permission auto-revoked by policy" : "revocation verified"}
                </span>
              </div>
              {expired && (
                <p className="text-[11px] text-amber-500/70 mt-1">Time-limited grant ended.</p>
              )}
              {!expired && result?.revokeToken && (
                <p className="text-[10px] font-mono text-slate-600 break-all mt-1">
                  Token: {result.revokeToken}
                </p>
              )}
            </motion.div>
          )
        ) : (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[11px] text-slate-700 text-center"
          >
            Grant access to <span className="text-violet-400/70 font-medium">TestApp</span> above, then click to verify.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function ConsentOS() {
  // undefined = auth resolving, null = logged out, object = logged in
  const [user,          setUser]          = useState(undefined);
  const [consents,      setConsents]      = useState([]);
  const [revokedProofs, setRevokedProofs] = useState([]);
  const [history,       setHistory]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [revoking,   setRevoking]  = useState(null);
  const [showGrant,  setShowGrant] = useState(false);
  const [pulse,      setPulse]     = useState(false);
  const [filter,     setFilter]    = useState(null);
  const [showPanic,  setShowPanic] = useState(false);
  const [panicking,  setPanicking] = useState(false);

  // Auth state — persists across page refreshes via onAuthStateChanged
  useEffect(() => {
    const unsub = subscribeAuth((u) => setUser(u ?? null));
    return unsub;
  }, []);

  // History listener — 10 most-recent events, persisted in Firestore
  useEffect(() => {
    if (!user) return;
    return subscribeHistory(user.uid, setHistory);
  }, [user?.uid]);

  // Permissions listener — scoped to the signed-in user's sub-collection
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const unsub = subscribePermissions(user.uid, (docs) => {
      const active = docs
        .filter((d) => d.status === true)
        .map((d) => ({
          id: d.id,
          serviceId: d.serviceId ?? d.id,
          dataTypes: Array.isArray(d.dataTypes) ? d.dataTypes : [],
          grantedAt: d.grantedAt?.toDate ? d.grantedAt.toDate() : new Date(d.grantedAt ?? Date.now()),
          expiresAt: d.expiresAt?.toDate ? d.expiresAt.toDate().getTime() : null,
        }));
      setConsents(active);

      const proofs = docs
        .filter((d) => d.status === false && d.revokeToken)
        .map((d) => ({
          id: d.id,
          serviceId: d.serviceId ?? d.id,
          revokeToken: d.revokeToken,
          revokedAt: d.revokedAt?.toDate ? d.revokedAt.toDate() : null,
        }));
      setRevokedProofs(proofs);

      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const FILTERS = [
    { label: "All",     value: null           },
    { label: "Gov",     value: "Government"   },
    { label: "Edu",     value: "Education"    },
    { label: "Finance", value: "Finance"      },
    { label: "Health",  value: "Healthcare"   },
  ];

  const available = SERVICES_DB.filter((s) => !consents.some((c) => c.serviceId === s.id));

  const stats = useMemo(() => {
    const scores    = consents.map((c) => {
      const svc = SERVICES_DB.find((s) => s.id === c.serviceId);
      return calcRisk(c.dataTypes, svc?.baseRisk ?? 0);
    });
    const avg       = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const high      = scores.filter((s) => s > 6).length;
    const totalTypes = [...new Set(consents.flatMap((c) => c.dataTypes))].length;
    return { avg, high, totalTypes };
  }, [consents]);

  async function handleRevoke(consent) {
    setRevoking(consent.id);
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
    revokePermission(user.uid, consent.serviceId)
      .then(() => {
        setRevoking(null);
        return logActivity(user.uid, { serviceId: consent.serviceId, action: "REVOKED", dataTypes: consent.dataTypes });
      })
      .catch((err) => { console.error("Failed to revoke:", err); setRevoking(null); });
  }

  async function handlePanic() {
    setShowPanic(false);
    setPanicking(true);
    const toRevoke = [...consents];
    // Brief pause so cards register the panicking prop before exit fires
    await new Promise((r) => setTimeout(r, 60));
    // Optimistic clear — onSnapshot will confirm after writeBatch resolves
    setConsents([]);
    setPulse(true);
    setTimeout(() => { setPanicking(false); setPulse(false); }, 600);
    // Batch-revoke all permissions atomically, then log each event
    panicRevokeAll(user.uid, toRevoke.map((c) => c.serviceId))
      .then(() =>
        Promise.all(
          toRevoke.map((c) =>
            logActivity(user.uid, { serviceId: c.serviceId, action: "REVOKED", dataTypes: c.dataTypes })
          )
        )
      )
      .catch((err) => console.error("Panic batch revoke failed:", err));
  }

  function handleGrant({ serviceId, dataTypes, durationMinutes }) {
    const svc = SERVICES_DB.find((s) => s.id === serviceId);
    setShowGrant(false);
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
    writePermission(serviceId, {
      userId: user.uid,
      name: svc?.name ?? serviceId,
      category: svc?.category ?? "Unknown",
      dataTypes,
      durationInMinutes: durationMinutes,
    })
      .then(() => Promise.all([
        grantConsent({ userId: user.uid, serviceId, dataTypes, baseRisk: svc?.baseRisk ?? 0 }),
        logActivity(user.uid, { serviceId, action: "GRANTED", dataTypes }),
      ]))
      .catch((err) => console.error("Failed to grant access:", err));
  }

  // Auth guards — must come after all hooks
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center"
           style={{ fontFamily: '"DM Sans", Inter, system-ui, sans-serif' }}>
        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="flex text-cyan-500">
          <Activity size={28} />
        </motion.span>
      </div>
    );
  }
  if (!user) return <LoginScreen onLogin={signInWithGoogle} />;

  const overallR = riskTw(stats.avg);

  const STAT_CARDS = [
    { label: "Active Consents",    value: consents.length,    Icon: ShieldCheck, color: "text-cyan-400"    },
    { label: "High Risk Links",    value: stats.high,          Icon: ShieldAlert, color: "text-red-400"     },
    { label: "Data Types Shared",  value: stats.totalTypes,    Icon: Database,    color: "text-violet-400"  },
    { label: "Events Logged",      value: history.length,      Icon: Activity,    color: "text-emerald-400" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300" style={{ fontFamily: '"DM Sans", Inter, system-ui, sans-serif' }}>

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-1/3 -left-1/4 w-2/3 h-2/3 rounded-full bg-cyan-500/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/3 -right-1/4 w-2/3 h-2/3 rounded-full bg-violet-500/[0.04] blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-1/2 rounded-full bg-emerald-500/[0.02] blur-3xl" />
      </div>

      <div className="relative z-10 max-w-[1320px] mx-auto px-5 py-7">

        {/* ── Header ── */}
        <header className="flex justify-between items-center mb-7 flex-wrap gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center flex-shrink-0">
              <Shield size={22} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-[22px] font-black text-slate-100 tracking-tight leading-none">
                Consent<span className="text-cyan-400">OS</span>
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">Personal Data Control Center</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* LIVE */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/8 border border-emerald-500/20">
              <motion.span
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"
              />
              <span className="text-[11px] text-emerald-400 font-bold tracking-widest">LIVE</span>
            </div>

            {/* Overall risk */}
            <span className={cn(
              "text-[12px] font-bold px-3.5 py-1.5 rounded-full border flex items-center gap-1.5",
              overallR.text, overallR.bg, overallR.border
            )}>
              <ShieldAlert size={12} /> Risk: {overallR.label}
            </span>

            {/* Grant button */}
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => setShowGrant(true)}
              disabled={available.length === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all duration-200",
                available.length > 0
                  ? "bg-cyan-500/10 border-cyan-500/35 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50"
                  : "bg-slate-800/40 border-slate-700/40 text-slate-600 cursor-not-allowed"
              )}>
              <Plus size={14} /> Grant Access
            </motion.button>

            {/* User avatar + sign out */}
            <div className="flex items-center gap-2 pl-1 border-l border-slate-800/60">
              {user.photoURL && (
                <img src={user.photoURL} alt={user.displayName ?? "user"}
                  className="w-7 h-7 rounded-full border border-slate-700/60 flex-shrink-0" />
              )}
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={signOutUser}
                title="Sign out"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-500 hover:text-slate-300 hover:border-slate-600/60 transition-all duration-200 text-[11px] font-medium"
              >
                <LogOut size={12} /> Sign out
              </motion.button>
            </div>
          </div>
        </header>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {STAT_CARDS.map(({ label, value, Icon, color }) => (
            <motion.div key={label}
              animate={pulse ? { scale: [1, 1.03, 1] } : {}}
              transition={{ duration: 0.4 }}
              className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2.5">
                <Icon size={14} className={color} />
                <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest leading-none">
                  {label}
                </span>
              </div>
              <div className="text-[28px] font-black text-slate-100 tracking-tight leading-none">{value}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-5 items-start">

          {/* Left — Active permissions */}
          <section>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Eye size={13} /> Active Permissions
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-slate-700">
                  {consents.length} service{consents.length !== 1 ? "s" : ""} with access
                </span>
                <motion.button
                  onClick={() => setShowPanic(true)}
                  disabled={consents.length === 0}
                  animate={consents.length > 0 ? {
                    boxShadow: [
                      "0 0 0px 0px rgba(239,68,68,0)",
                      "0 0 10px 2px rgba(239,68,68,0.3)",
                      "0 0 0px 0px rgba(239,68,68,0)",
                    ],
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/50 text-red-400 text-[11px] font-bold uppercase tracking-wider hover:bg-red-600/30 hover:border-red-500/70 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                >
                  <ShieldAlert size={12} /> Panic
                </motion.button>
              </div>
            </div>

            {/* Quick filters */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {FILTERS.map(({ label, value }) => {
                const active = filter === value;
                return (
                  <motion.button
                    key={label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setFilter(value)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150",
                      active
                        ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-400"
                        : "bg-slate-900/50 border-slate-800/60 text-slate-500 hover:border-slate-700/60 hover:text-slate-400"
                    )}
                  >
                    {label}
                  </motion.button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-700 text-sm gap-2">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="flex">
                  <Activity size={18} />
                </motion.span>
                Connecting to middleware…
              </div>
            ) : (
              <AnimatePresence>
                {consents
                  .filter((c) => {
                    if (!filter) return true;
                    return SERVICES_DB.find((s) => s.id === c.serviceId)?.category === filter;
                  })
                  .map((c) => (
                    <ConsentCard key={c.id} consent={c}
                      isRevoking={revoking === c.id} onRevoke={handleRevoke}
                      isPanicking={panicking} />
                  ))}
              </AnimatePresence>
            )}

            <AnimatePresence>
              {!loading && consents.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800/60 rounded-2xl bg-slate-900/20"
                >
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5"
                  >
                    <Shield size={30} className="text-emerald-400" />
                  </motion.div>
                  <p className="text-[16px] font-bold text-slate-300 mb-1.5">Privacy Secured.</p>
                  <p className="text-[13px] text-slate-600">No active data flows.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {revokedProofs.length > 0 && (
                <ProofOfRevokeSection proofs={revokedProofs} />
              )}
            </AnimatePresence>
          </section>

          {/* Right — Viz + Activity */}
          <aside className="flex flex-col gap-4">
            <DataFlowViz consents={consents} revoking={revoking} />
            <HistoryLog history={history} />
            <TestAppPanel userId={user.uid} />
          </aside>
        </div>
      </div>

      {/* Grant modal */}
      <AnimatePresence>
        {showGrant && (
          <GrantModal available={available} onGrant={handleGrant} onClose={() => setShowGrant(false)} />
        )}
      </AnimatePresence>

      {/* Panic modal */}
      <AnimatePresence>
        {showPanic && (
          <PanicModal
            count={consents.length}
            onConfirm={handlePanic}
            onCancel={() => setShowPanic(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
