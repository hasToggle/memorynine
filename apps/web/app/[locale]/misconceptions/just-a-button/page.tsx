"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { CheckCircle2, Database, Server, ShieldCheck, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useEffect, useMemo, useState } from "react";

// --- Constants & Types ---
const INITIAL_LATENCY = 0;
const DEFAULT_STEP_LATENCY = 200;
const LATENCY_VARIANCE = 100;
const LOG_HISTORY_LIMIT = 8;
const GRID_OPACITY = 0.03;
const PIPELINE_BG_OPACITY = 0.05;

type SystemCapability =
  | "validation"
  | "optimistic"
  | "network"
  | "server_action"
  | "persistence"
  | "revalidation";

type LabPreset = "minimal" | "modern" | "fragile" | "monolith";

interface CapabilityConfig {
  description: string;
  icon: React.ElementType;
  id: SystemCapability;
  impact: {
    latency: number;
    ux: string;
    dx: string;
  };
  label: string;
}

const CAPABILITIES: CapabilityConfig[] = [
  {
    description: "Zod pulse check before network",
    icon: ShieldCheck,
    id: "validation",
    impact: {
      dx: "Typed contracts",
      latency: -50,
      ux: "Instant error feedback",
    },
    label: "Client Validation",
  },
  {
    description: "Update state before server responds",
    icon: Zap,
    id: "optimistic",
    impact: {
      dx: "Complex rollback",
      latency: -800,
      ux: "Perceived zero latency",
    },
    label: "Optimistic UI",
  },
  {
    description: "Type-safe RPC over HTTP",
    icon: Server,
    id: "server_action",
    impact: {
      dx: "Zero-API boilerplate",
      latency: 150,
      ux: "No loading flash",
    },
    label: "Server Actions",
  },
  {
    description: "Guaranteed data integrity",
    icon: Database,
    id: "persistence",
    impact: {
      dx: "Transaction safety",
      latency: 300,
      ux: "Reliable data",
    },
    label: "ACID Persistence",
  },
  {
    description: "Incremental static regeneration",
    icon: CheckCircle2,
    id: "revalidation",
    impact: {
      dx: "Cache automated",
      latency: 100,
      ux: "Always fresh data",
    },
    label: "Smart Revalidation",
  },
];

// --- Sub-Components ---

function CapabilityButton({
  cap,
  isEnabled,
  onToggle,
}: {
  cap: CapabilityConfig;
  isEnabled: boolean;
  onToggle: (id: SystemCapability) => void;
}) {
  const statusColor = isEnabled
    ? "bg-green-500 shadow-[0_0_8px_#22c55e]"
    : "bg-white/10";
  const iconBgColor = isEnabled
    ? "bg-white/10 text-white"
    : "bg-white/5 text-white/20";
  const borderStyle = isEnabled
    ? "border-white/20 bg-white/5"
    : "border-white/5 bg-transparent hover:border-white/10";
  const labelColor = isEnabled ? "text-white" : "text-white/40";
  const toggle = useCallback(() => onToggle(cap.id), [cap.id, onToggle]);

  return (
    <button
      className={`group w-full rounded-xl border p-4 text-left transition-all duration-300 ${borderStyle}`}
      onClick={toggle}
      type="button"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 rounded-lg p-2 ${iconBgColor}`}>
          <cap.icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span
              className={`font-medium text-sm transition-colors ${labelColor}`}
            >
              {cap.label}
            </span>
            <div
              className={`h-1.5 w-1.5 rounded-full transition-all ${statusColor}`}
            />
          </div>
          <p className="mt-0.5 overflow-hidden truncate whitespace-nowrap text-white/30 text-xs">
            {cap.description}
          </p>
        </div>
      </div>
    </button>
  );
}

function PipelineVisualization({
  activeStep,
  enabledCaps,
}: {
  activeStep: SystemCapability | null;
  enabledCaps: Set<SystemCapability>;
}) {
  return (
    <div className="relative flex w-full items-center justify-between">
      <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/5" />
      {CAPABILITIES.map((cap) => {
        const isActive = activeStep === cap.id;
        const isEnabled = enabledCaps.has(cap.id);

        let nodeStyle = "border-white/5 bg-black/40 text-white/10";
        if (isActive) {
          nodeStyle = "scale-125 bg-white text-black shadow-[0_0_30px_#fff]";
        } else if (isEnabled) {
          nodeStyle = "border-white/20 bg-white/10 text-white";
        }

        return (
          <div
            className="relative z-10 flex flex-col items-center gap-4"
            key={cap.id}
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-500 ${nodeStyle}`}
            >
              <cap.icon size={20} />
            </div>
            <span
              className={`font-mono text-[10px] uppercase tracking-widest transition-colors ${isActive ? "text-white" : "text-white/20"}`}
            >
              {cap.label.split(" ")[0]}
            </span>
            {isActive && (
              <motion.div
                className="absolute -inset-2 -z-10 rounded-3xl bg-white/5 blur-md"
                layoutId="active-glow"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ImpactItem {
  id: string;
  label: string;
}

interface AggregateImpact {
  dx: ImpactItem[];
  latency: number;
  ux: ImpactItem[];
}

function TelemetryDisplay({
  latency,
  aggregateImpact,
  enabledCaps,
}: {
  latency: number;
  aggregateImpact: AggregateImpact;
  enabledCaps: Set<SystemCapability>;
}) {
  const driftColor =
    aggregateImpact.latency < 0 ? "text-green-400" : "text-red-400 opacity-40";
  const driftPrefix = aggregateImpact.latency >= 0 ? "+" : "";
  const integrityColor = enabledCaps.has("persistence")
    ? "text-cyan-400"
    : "text-yellow-500/50";
  const integrityStatus = enabledCaps.has("persistence") ? "ACID" : "Volatile";

  return (
    <div className="border-white/5 border-b p-6">
      <h2 className="mb-4 font-bold text-white/40 text-xs uppercase tracking-widest">
        Live Telemetry
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <div className="mb-1 text-[10px] text-white/40 uppercase">
            Latency
          </div>
          <div className="font-mono text-white text-xl">{latency}ms</div>
          <div className={`mt-1 text-[10px] ${driftColor}`}>
            {driftPrefix}
            {aggregateImpact.latency}ms drift
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <div className="mb-1 text-[10px] text-white/40 uppercase">
            Integrity
          </div>
          <div className={`font-mono text-xl ${integrityColor}`}>
            {integrityStatus}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Lab Component ---

export default function ToggleLab() {
  const [mode, setMode] = useQueryState(
    "preset",
    parseAsString.withDefault("modern").withOptions({ history: "replace" })
  );

  const [enabledCaps, setEnabledCaps] = useState<Set<SystemCapability>>(
    new Set()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [latency, setLatency] = useState(INITIAL_LATENCY);
  const [activeStep, setActiveStep] = useState<SystemCapability | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<
    { id: string; text: string }[]
  >([]);

  useEffect(() => {
    const presets: Record<LabPreset, SystemCapability[]> = {
      fragile: ["persistence"],
      minimal: [],
      modern: [
        "validation",
        "optimistic",
        "server_action",
        "persistence",
        "revalidation",
      ],
      monolith: ["validation", "persistence"],
    };
    setEnabledCaps(new Set(presets[mode as LabPreset] || presets.modern));
  }, [mode]);

  const aggregateImpact = useMemo<AggregateImpact>(
    () =>
      Array.from(enabledCaps).reduce(
        (acc, capId) => {
          const cap = CAPABILITIES.find((c) => c.id === capId);
          if (!cap) {
            return acc;
          }
          return {
            dx: [...acc.dx, { id: cap.id, label: cap.impact.dx }],
            latency: acc.latency + cap.impact.latency,
            ux: [...acc.ux, { id: cap.id, label: cap.impact.ux }],
          };
        },
        {
          dx: [],
          latency: 0,
          ux: [],
        } as AggregateImpact
      ),
    [enabledCaps]
  );

  const toggleCap = (id: SystemCapability) => {
    setEnabledCaps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setMode(null);
  };

  const addLog = (text: string) => {
    setTerminalOutput((prev) => [...prev, { id: crypto.randomUUID(), text }]);
  };

  const handleClick = async () => {
    if (isProcessing) {
      return;
    }

    setIsProcessing(true);
    setShowSuccess(false);
    setLatency(INITIAL_LATENCY);
    setTerminalOutput([
      { id: "start", text: "[system] starting request sequence..." },
    ]);

    const sequence: SystemCapability[] = [
      "validation",
      "optimistic",
      "network",
      "server_action",
      "persistence",
      "revalidation",
    ];

    let currentLatency = 0;

    for (const stepId of sequence) {
      const isNetwork = stepId === "network";
      const isEnabled = enabledCaps.has(stepId as SystemCapability);

      if (isNetwork || isEnabled) {
        setActiveStep(stepId as SystemCapability);
        const config = CAPABILITIES.find((c) => c.id === stepId);
        const baseLatency = config?.impact.latency || DEFAULT_STEP_LATENCY;
        const stepLatency = baseLatency + Math.random() * LATENCY_VARIANCE;

        addLog(`[exec] ${stepId} in progress...`);
        // Sequential on purpose: the point of the trace is that each stage
        // waits on the one before it, so its latency is additive.
        // biome-ignore lint/performance/noAwaitInLoops: the demo models a serial pipeline
        await new Promise((r) => setTimeout(r, stepLatency));

        currentLatency += stepLatency;
        setLatency(Math.floor(currentLatency));
      }
    }

    setActiveStep(null);
    addLog("[system] sequence complete.");
    setShowSuccess(true);
    setIsProcessing(false);
  };

  const buttonStateLabel = useMemo(() => {
    if (isProcessing) {
      return "Tracing...";
    }
    if (showSuccess) {
      return "Success";
    }
    return "Direct Action";
  }, [isProcessing, showSuccess]);

  const buttonStateKey = useMemo(() => {
    if (isProcessing) {
      return "tracing";
    }
    if (showSuccess) {
      return "success";
    }
    return "idle";
  }, [isProcessing, showSuccess]);

  return (
    <main className="relative flex min-h-screen flex-col bg-[#050505] font-sans text-white selection:bg-white/20">
      <div
        className="pointer-events-none absolute inset-0 text-white"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: GRID_OPACITY,
        }}
      />

      <header className="flex h-16 items-center justify-between border-white/5 border-b px-8 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white/10">
            <Zap className="h-4 w-4 text-yellow-400" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">
            Toggle Lab{" "}
            <span className="ml-2 font-normal text-white/40">v1.1.0</span>
          </h1>
        </div>
        <div className="flex gap-4">
          {(["minimal", "modern", "fragile", "monolith"] as const).map((p) => (
            <Link
              className={`rounded-full border px-3 py-1.5 text-xs transition-all ${
                mode === p
                  ? "border-white bg-white text-black"
                  : "border-white/10 text-white/40 hover:border-white/20"
              }`}
              href={`?preset=${p}`}
              key={p}
            >
              {p.toUpperCase()}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        <aside className="col-span-3 flex flex-col overflow-y-auto border-white/5 border-r bg-white/2 p-6">
          <h2 className="mb-4 font-bold text-white/40 text-xs uppercase tracking-widest">
            System Capabilities
          </h2>
          <div className="space-y-3">
            {CAPABILITIES.map((cap) => (
              <CapabilityButton
                cap={cap}
                isEnabled={enabledCaps.has(cap.id)}
                key={cap.id}
                onToggle={toggleCap}
              />
            ))}
          </div>
        </aside>

        <section className="relative col-span-6 flex flex-col items-center justify-center p-12">
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ opacity: PIPELINE_BG_OPACITY }}
          >
            <div className="h-[600px] w-[600px] rounded-full border border-white/10" />
          </div>

          <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-16">
            <PipelineVisualization
              activeStep={activeStep}
              enabledCaps={enabledCaps}
            />

            <Button
              className={`h-24 w-64 rounded-3xl font-bold text-2xl shadow-2xl transition-all duration-500 ${
                showSuccess
                  ? "bg-green-500 text-white shadow-[0_0_40px_rgba(34,197,94,0.3)] hover:bg-green-600"
                  : "bg-white text-black hover:scale-105 hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] active:scale-95"
              } ${isProcessing ? "pointer-events-none opacity-30 blur-sm" : ""}`}
              disabled={isProcessing}
              onClick={handleClick}
              type="button"
            >
              <AnimatePresence mode="wait">
                <motion.span
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  initial={{ opacity: 0, y: 10 }}
                  key={buttonStateKey}
                >
                  {buttonStateLabel}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>
        </section>

        <aside className="col-span-3 flex flex-col border-white/5 border-l bg-white/2">
          <TelemetryDisplay
            aggregateImpact={aggregateImpact}
            enabledCaps={enabledCaps}
            latency={latency}
          />

          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {activeStep ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                  exit={{ opacity: 0, x: -20 }}
                  initial={{ opacity: 0, x: 20 }}
                  key={activeStep}
                >
                  <h2 className="font-bold text-white/40 text-xs uppercase tracking-widest">
                    Active Process
                  </h2>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-2 font-mono text-cyan-400 text-xs">
                      [process] {activeStep.toUpperCase()}
                    </div>
                    <p className="text-white/60 text-xs leading-relaxed">
                      {
                        CAPABILITIES.find((c) => c.id === activeStep)
                          ?.description
                      }
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] text-white/20 uppercase tracking-widest">
                      Execution Trace
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                      <motion.div
                        animate={{ width: "100%" }}
                        className="h-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
                        initial={{ width: 0 }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                  initial={{ opacity: 0 }}
                  key="aggregate"
                >
                  <div>
                    <h2 className="mb-4 font-bold text-white/40 text-xs uppercase tracking-widest">
                      Aggregate Impact
                    </h2>
                    <div className="space-y-6">
                      <div>
                        <div className="mb-2 text-[10px] text-white/20 uppercase tracking-wider">
                          User Experience
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {aggregateImpact.ux.length > 0 ? (
                            aggregateImpact.ux.map((u) => (
                              <span
                                className="rounded-md border border-green-500/20 bg-green-500/10 px-2 py-1 text-[10px] text-green-400"
                                key={u.id}
                              >
                                {u.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-white/10">
                              No UX optimizations active
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 text-[10px] text-white/20 uppercase tracking-wider">
                          Dev Experience
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {aggregateImpact.dx.length > 0 ? (
                            aggregateImpact.dx.map((d) => (
                              <span
                                className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[10px] text-blue-400"
                                key={d.id}
                              >
                                {d.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-white/10">
                              Standard REST overhead
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-4 flex items-center gap-2 font-bold text-[10px] text-white/40 uppercase tracking-widest">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                      System Logs
                    </div>
                    <div className="space-y-1.5 font-mono text-[10px]">
                      {terminalOutput
                        .slice(-LOG_HISTORY_LIMIT)
                        .map((log, i) => (
                          <div className="text-white/60" key={log.id}>
                            <span className="mr-2 text-white/10">
                              [{i.toString().padStart(2, "0")}]
                            </span>
                            {log.text}
                          </div>
                        ))}
                      {!isProcessing && (
                        <div className="text-white/20 italic">
                          _ standby_ready
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </main>
  );
}
