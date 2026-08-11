import { useState, useRef, useEffect } from "react";
import { X, Maximize2, Minimize2, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}


export function AIChatbot({ isOpen, onClose }: AIChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello! 👋 I'm your AI Support Concierge. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.answer || "Sorry, I couldn't process that request.";
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } else {
        throw new Error("API error");
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Sorry, I'm having trouble connecting right now. Please try again in a moment. 🙏",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };


  if (!isOpen) return null;

  const chatHeight = isExpanded ? "h-[28rem]" : "h-72";

  return (
    <>
      {/* Backdrop blur overlay */}
      <div
        className="fixed inset-0 z-[9997] bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Chat Card */}
      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9998] w-full max-w-sm px-4"
        style={{ animation: "slideUpFade 0.3s ease-out" }}
      >
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: "#16172a",
            border: "1px solid rgba(139, 92, 246, 0.25)",
            boxShadow:
              "0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* ─── Header ─── */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ background: "#1c1d30" }}
          >
            <div className="flex items-center gap-3">
              {/* Animated avatar */}
              <div className="relative">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-lg"
                  style={{
                    background:
                      "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                    boxShadow: "0 0 20px rgba(124,58,237,0.4)",
                    animation: "pulseGlow 2s ease-in-out infinite",
                  }}
                >
                  🤖
                </div>
                {/* Online dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                  style={{
                    background: "#22c55e",
                    borderColor: "#1c1d30",
                    boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
              </div>

              <div>
                <p
                  className="text-white font-extrabold text-sm tracking-[0.12em] uppercase"
                  style={{ letterSpacing: "0.12em" }}
                >
                  AI Concierge
                </p>
                <p className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: "#22c55e" }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block"
                    style={{
                      background: "#22c55e",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  Online Support
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsExpanded((p) => !p)}
              className="text-white/40 hover:text-white/80 transition-colors p-1"
            >
              {isExpanded ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* ─── Messages ─── */}
          <div
            className={`${chatHeight} overflow-y-auto px-4 py-3 space-y-3 transition-all duration-300`}
            style={{ background: "#10111e" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[82%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                        : "#1e2035",
                    color: msg.role === "user" ? "#fff" : "#d1d5db",
                    boxShadow:
                      msg.role === "user"
                        ? "0 4px 15px rgba(124,58,237,0.3)"
                        : "none",
                    borderRadius:
                      msg.role === "user"
                        ? "1rem 1rem 0.25rem 1rem"
                        : "1rem 1rem 1rem 0.25rem",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
                  style={{
                    background: "#1e2035",
                    borderRadius: "1rem 1rem 1rem 0.25rem",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-violet-400"
                      style={{
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        display: "inline-block",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ─── Input ─── */}
          <div className="px-4 py-4" style={{ background: "#16172a" }}>
            <div
              className="flex items-center gap-3 rounded-full px-4 py-2.5"
              style={{
                background: "#10111e",
                border: "1px solid rgba(139, 92, 246, 0.2)",
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Ask anything..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-gray-600 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 disabled:opacity-40 hover:scale-110"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  boxShadow: "0 0 12px rgba(124,58,237,0.4)",
                }}
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Close button ─── */}
        <div className="flex justify-center mt-4">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(124,58,237,0.4); }
          50%       { box-shadow: 0 0 30px rgba(124,58,237,0.7); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-6px); }
        }
      `}</style>
    </>
  );
}
