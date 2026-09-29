"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  memo,
  type KeyboardEvent,
  type ComponentProps,
} from "react";
import { motion, AnimatePresence, type Variants } from "motion/react";
import type { Alert } from "@/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import {
  MessageCircle,
  AudioLines,
  ArrowUp,
  CircleStop,
  Loader2,
  Mic,
  Settings,
  Lock,
  Bell,
  Globe,
} from "lucide-react";

// Minimal local chat-message primitives used by this component.
// These replace the non-standard "message" / "bubble" / "marker"
// registry entries (not part of the official shadcn registry) with
// lightweight components that provide the same shape/props.

function MessageGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function Message({
  align = "start",
  className,
  ...props
}: ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      className={cn(
        "flex w-full",
        align === "end" ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("max-w-[85%]", className)} {...props} />;
}

function Bubble({
  variant = "default",
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "default" | "muted" | "ghost";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl",
        variant === "muted" && "bg-muted",
        variant === "ghost" && "bg-transparent",
        variant === "default" && "bg-primary text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BubbleContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={className} {...props} />;
}

function Marker({ className, ...props }: ComponentProps<"div">) {
  return <div className={className} {...props} />;
}

function MarkerContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={className} {...props} />;
}

const ANSWER = `It's a collection of ready-made shadcn/ui components and templates you can copy into your React or Next.js project.`;
const ANSWER_WORDS = ANSWER.split(" ");

const WAVE_BARS = [
  12, 8, 4, 20, 8, 20, 8, 8, 12, 8, 24, 8, 20, 28, 20, 32, 24, 8, 12, 8, 8, 20,
  8, 20, 8, 8, 12, 20, 12, 20, 28, 8, 28, 12, 20, 20, 12, 8, 4, 20, 8, 20, 8, 8,
  12, 12, 8, 4, 20, 8, 20, 8, 8, 12, 8, 24, 8, 28, 32, 24, 8, 12, 8, 8, 20, 8,
  20, 8, 12, 20, 12, 20, 28, 8, 28, 12, 20, 20, 12, 4, 20, 8, 20, 8, 8, 12,
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const wordVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: "easeOut",
    },
  },
};

const waveBarVariants: Variants = {
  recording: (index: number) => ({
    scaleY: [0.55, 1, 0.55],
    transition: {
      duration: 1.1,
      repeat: Infinity,
      ease: "easeInOut",
      delay: index * 0.015,
    },
  }),
  idle: {
    scaleY: 0.3,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

type ChatStatus = "idle" | "thinking" | "answered";

interface ChatInputProps {
  onSend: (value: string) => void;
  disabled: boolean;
}

const ChatInput = memo(({ onSend, disabled }: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <InputGroup className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 h-auto shadow-xs">
      <InputGroupInput
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask about thermal inversion, fire plumes, or GRAP mandates..."
        className="w-full bg-transparent dark:bg-transparent border-0 h-auto p-0 shadow-none outline-none focus-visible:ring-0 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-60 focus-visible:border-0"
      />
      <Button
        type="button"
        onClick={handleSend}
        disabled={!input.trim() || disabled}
        size="icon-xs"
        className="rounded-full size-5 p-0 hover:bg-primary/80 cursor-pointer"
        aria-label="Send message"
      >
        {disabled ? (
          <Loader2 className="size-3 animate-spin text-primary-foreground" />
        ) : (
          <ArrowUp className="size-3 text-primary-foreground" />
        )}
      </Button>
    </InputGroup>
  );
});

ChatInput.displayName = "ChatInput";

interface MessageItem {
  id: string;
  sender: "user" | "assistant";
  text: string;
  words?: string[];
}

function getCausalAnswer(question: string, alert?: Alert | null): string {
  if (!alert) {
    return "Aeris AI Causal Agent active. All 56 CPCB telemetry feeds and NASA FIRMS fire radiance streams are synchronized.";
  }
  const lower = question.toLowerCase();
  const { causal_drivers } = alert;

  if (lower.includes('why') || lower.includes('stage iv') || lower.includes('cause') || lower.includes('trigger')) {
    return `Physical & GNN Causal Drivers: Planetary boundary layer collapsed by -${causal_drivers.pblh_drop}m into a shallow 200m particulate trap. Surface winds dropped to ${causal_drivers.wind_speed} m/s, dropping ventilation capacity below the 2,000 m²/s stagnation limit. NASA FIRMS satellite telemetry registers active stubble fire influence of ${causal_drivers.fire_influence}/100 transporting dense plumes into the Yamuna basin.`;
  }
  if (lower.includes('station') || lower.includes('anand vihar') || lower.includes('entrapment') || lower.includes('vulnerable')) {
    return `Critical Entrapment Stations: The Graph Neural Network identifies ${causal_drivers.accumulation_stations.join(', ')} as having the highest node entrapment centrality. Anand Vihar faces acute inter-state transport pooling combined with shallow evening inversion.`;
  }
  if (lower.includes('grap') || lower.includes('measure') || lower.includes('action') || lower.includes('mandate')) {
    return `Statutory CAQM Stage IV Interventions: Prohibit non-electric/non-CNG commercial trucks into Delhi, halt stone crushers and hot-mix plants, deploy round-the-clock mist-cannon wetting along Ring Road, and scale metro frequencies 4-fold.`;
  }
  if (lower.includes('cams') || lower.includes('physics') || lower.includes('gnn') || lower.includes('error')) {
    return `Numerical Physics vs GNN Residual: Global Eulerian models (CAMS) underpredict Day-2 and Day-3 AQI by ~68 µg/m³ due to coarse 40km grid plume dilution. Aeris GNN corrects this residual using NASA FIRMS boundary nodes and station wind adjacency.`;
  }
  return `Based on latest spatiotemporal graph inference: Atmospheric inversion score is ${causal_drivers.inversion_index}/100 and upwind stubble fire flux is ${causal_drivers.fire_influence}/100. Severe stagnation will pool over East & North Delhi within ${alert.lead_time_hours} hours. Pre-emptive execution of Stage IV measures is strongly advised.`;
}

function ChatPanel({ alert }: { alert?: Alert | null }) {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "init",
      sender: "assistant",
      text: "Hello Officer. I am Aeris, your atmospheric intelligence agent. I have synthesized the spatiotemporal graph, NASA FIRMS satellite fire telemetry, and planetary boundary layer physics for this event. Ask me anything about the causal drivers, station entrapment, or GRAP emergency mandates.",
      words: "Hello Officer. I am Aeris, your atmospheric intelligence agent. I have synthesized the spatiotemporal graph, NASA FIRMS satellite fire telemetry, and planetary boundary layer physics for this event. Ask me anything about the causal drivers, station entrapment, or GRAP emergency mandates.".split(" "),
    },
  ]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const handleSend = (question: string) => {
    if (status === "thinking") return;

    const userMsg: MessageItem = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: question,
    };

    setMessages((prev) => [...prev, userMsg]);
    setStatus("thinking");

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const answer = getCausalAnswer(question, alert);
      const assistantMsg: MessageItem = {
        id: `a-${Date.now()}`,
        sender: "assistant",
        text: answer,
        words: answer.split(" "),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStatus("answered");
    }, 750);
  };

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex w-full flex-col gap-4 p-5"
    >
      <div className="flex max-h-72 w-full flex-col overflow-y-auto pr-1 space-y-3.5">
        {messages.map((msg, index) => {
          const isLatest = index === messages.length - 1 && msg.sender === "assistant" && status === "answered";
          return (
            <Message
              key={msg.id}
              align={msg.sender === "user" ? "end" : "start"}
              className="w-full flex items-start gap-2.5"
            >
              {msg.sender === "assistant" && (
                <div className="shrink-0 mt-0.5" title="Aeris">
                  <AgentAvatar name="aeris" size={24} />
                </div>
              )}
              <MessageContent className={msg.sender === "user" ? "max-w-[80%]" : "max-w-[90%]"}>
                <Bubble
                  variant={msg.sender === "user" ? "muted" : "ghost"}
                  className={msg.sender === "user" ? "rounded-2xl bg-emerald-600 text-white" : "max-w-full"}
                >
                  <BubbleContent
                    className={
                      msg.sender === "user"
                        ? "text-xs text-white px-3.5 py-2 rounded-2xl"
                        : "text-xs leading-relaxed text-foreground p-0"
                    }
                  >
                    {isLatest && msg.words ? (
                      <motion.span
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="inline"
                      >
                        {msg.words.map((word, wIdx) => (
                          <Fragment key={wIdx}>
                            <motion.span
                              variants={wordVariants}
                              className="inline-block"
                            >
                              {word}
                            </motion.span>{" "}
                          </Fragment>
                        ))}
                      </motion.span>
                    ) : (
                      <span>{msg.text}</span>
                    )}
                  </BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          );
        })}

        {status === "thinking" && (
          <div className="py-1 px-2">
            <Marker className="flex items-center gap-2.5">
              <AgentAvatar name="aeris" size={20} pulse />
              <MarkerContent>
                <motion.span
                  className="bg-clip-text text-sm font-vt323 tracking-wider text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%)",
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                  }}
                  animate={{ backgroundPosition: ["150% 0", "-50% 0"] }}
                  transition={{
                    duration: 1.3,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  AERIS AI Researcher synthesizing causal telemetry...
                </motion.span>
              </MarkerContent>
            </Marker>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={status === "thinking"} />
    </motion.div>
  );
}

function VoicePanel() {
  const [recording, setRecording] = useState(true);

  return (
    <motion.div
      key="voice"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full p-5 flex flex-col items-center gap-3"
    >
      <div className="flex h-10 w-full items-center justify-center rounded-lg bg-muted px-3">
        <div className="flex items-center justify-center gap-px w-full overflow-hidden">
          {WAVE_BARS.map((height, index) => (
            <motion.span
              key={index}
              custom={index}
              variants={waveBarVariants}
              animate={recording ? "recording" : "idle"}
              className="w-0.5 shrink-0 rounded-full bg-muted-foreground/80"
              style={{
                height,
                originY: 0.5,
              }}
            />
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={() => setRecording((prev) => !prev)}
        size="sm"
        className="rounded-full h-7 px-3 text-xs gap-1.5 flex items-center justify-center hover:bg-primary/80 cursor-pointer"
        aria-label={recording ? "Stop voice input" : "Start voice input"}
      >
        {recording ? (
          <CircleStop className="size-3 text-primary-foreground" />
        ) : (
          <Mic className="size-3 text-primary-foreground" />
        )}
        <span>{recording ? "Stop" : "Start"}</span>
      </Button>
    </motion.div>
  );
}

function SettingsPanel() {
  const [notifications, setNotifications] = useState(true);
  const [developerMode, setDeveloperMode] = useState(false);

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">
            Notifications
          </span>
        </div>
        <Switch
          size="sm"
          checked={notifications}
          onCheckedChange={setNotifications}
          className="cursor-pointer"
        />
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">
            Secure Mode
          </span>
        </div>
        <Switch
          size="sm"
          checked={developerMode}
          onCheckedChange={setDeveloperMode}
          className="cursor-pointer"
        />
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Language</span>
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">
          English
        </span>
      </div>
    </motion.div>
  );
}

const TABS_CONFIG = [
  { value: "chat", label: "Chat", icon: MessageCircle },
  { value: "voice", label: "Voice", icon: AudioLines },
  { value: "settings", label: "Settings", icon: Settings },
];

export interface TabsDemoProps {
  alert?: Alert | null;
  className?: string;
}

const TabsDemo = ({ alert, className }: TabsDemoProps) => {
  const [tab, setTab] = useState("chat");

  return (
    <div className={cn("flex w-full flex-col items-center gap-4", className)}>
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="w-full max-w-xl flex flex-col items-center gap-4"
      >
        <TabsList className="h-auto! gap-1 rounded-full bg-muted p-1 flex w-full max-w-md items-center justify-between">
          {TABS_CONFIG.map(({ value: itemValue, label, icon: Icon }) => {
            const isActive = tab === itemValue;
            return (
              <TabsTrigger
                key={itemValue}
                value={itemValue}
                className={cn(
                  "rounded-full border-none py-1.5 text-xs font-medium text-muted-foreground dark:data-active:bg-background data-active:bg-background data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-xs cursor-pointer transition-all duration-300 flex items-center justify-center flex-1",
                  isActive ? "px-4" : "px-3",
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.span
                      initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                      animate={{ width: "auto", opacity: 1, marginLeft: 6 }}
                      exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden whitespace-nowrap text-xs font-medium inline-block"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="relative w-full overflow-hidden">
          <TabsContent
            value={tab}
            className="border border-border bg-card rounded-2xl shadow-xs outline-none p-0 mt-0"
          >
            <AnimatePresence mode="wait" initial={false}>
              {tab === "chat" && <ChatPanel key="chat" alert={alert} />}
              {tab === "voice" && <VoicePanel key="voice" />}
              {tab === "settings" && <SettingsPanel key="settings" />}
            </AnimatePresence>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default TabsDemo;
export { TabsDemo };

