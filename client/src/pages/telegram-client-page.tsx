import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Send, 
  MessageSquare, 
  LogOut, 
  Search, 
  Phone, 
  Key, 
  Lock, 
  Loader2, 
  MessageCircle, 
  User as UserIcon, 
  Users as UsersIcon, 
  Megaphone,
  Hash,
  X,
  Info,
  PhoneCall,
  AtSign,
  IdCard,
  CheckCircle,
  Crown,
  Users,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Bot
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Chat {
  id: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  date: number;
  type: string; // "user" | "group" | "channel"
  username: string | null;
  isBot?: boolean;
  isContact?: boolean;
}

interface Message {
  id: number;
  text: string;
  date: number;
  out: boolean;
  senderId: string | null;
  senderName: string;
  hasPhoto?: boolean;
}

export default function TelegramClientPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Connection and Authentication State
  const [phone, setPhone] = useState("");
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [is2FaRequired, setIs2FaRequired] = useState(false);
  const [hasRootAccess, setHasRootAccess] = useState(() => localStorage.getItem("tg_root_access") === "true");
  
  // Chat Interface State
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typedMessage, setTypedMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "groups" | "contacts" | "non-contacts" | "bots">("all");
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [photoErrors, setPhotoErrors] = useState<Record<string, boolean>>({});

  const handleAccessRoot = () => {
    const key = prompt("Enter your secret key:");
    if (key === "20101001") {
      localStorage.setItem("tg_root_access", "true");
      setHasRootAccess(true);
      toast({
        title: "Access Granted",
        description: "Root directory access successfully authorized.",
      });
    } else if (key !== null) {
      toast({
        title: "Access Denied",
        description: "Invalid secret key.",
        variant: "destructive",
      });
    }
  };

  const handleLockRoot = () => {
    localStorage.removeItem("tg_root_access");
    setHasRootAccess(false);
    toast({
      title: "Logged Out of Root",
      description: "Root access cleared successfully.",
    });
  };

  // 1. Fetch connection status
  const { data: statusData, isLoading: isStatusLoading } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/telegram-client/status"],
  });

  const isConnected = statusData?.connected || false;

  // 2. Fetch chats list (only if connected)
  const { data: chats = [], isLoading: isChatsLoading } = useQuery<Chat[]>({
    queryKey: ["/api/telegram-client/chats"],
    enabled: isConnected,
    refetchInterval: 30000, // Refresh chat list every 30s
  });

  // 2.5 Fetch detailed peer info
  const { data: peerDetails, isLoading: isDetailsLoading, error: detailsError } = useQuery<any>({
    queryKey: ["/api/telegram-client/peer-details", selectedChat?.id],
    queryFn: async () => {
      if (!selectedChat) return null;
      const response = await fetch(`/api/telegram-client/peer-details/${selectedChat.id}`);
      if (!response.ok) throw new Error("Failed to fetch peer details");
      return response.json();
    },
    enabled: !!selectedChat && showDetailsPanel,
  });

  // 3. Setup WebSocket listener for real-time messages
  useEffect(() => {
    if (!isConnected) return;

    const socket = io();
    
    socket.on("telegram_client_message", (msg: Message & { chatId: string }) => {
      // If the incoming message belongs to our selected chat, append it
      if (selectedChat && msg.chatId === selectedChat.id) {
        setMessages((prev) => {
          // Avoid duplicate messages just in case
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      
      // Invalidate the chat query so unread counts / last messages update
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-client/chats"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [isConnected, selectedChat, queryClient]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat messages when active chat changes
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const response = await fetch(`/api/telegram-client/messages/${selectedChat.id}`);
        if (!response.ok) throw new Error("Failed to fetch messages");
        const data = await response.json();
        setMessages(data);
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive",
        });
      }
    };

    fetchMessages();
  }, [selectedChat, toast]);

  // Mutations
  const sendCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telegram-client/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash, phoneNumber: phone }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send code.");
      }
      return res.json();
    },
    onSuccess: () => {
      setStep("otp");
      setIs2FaRequired(false);
      toast({
        title: "OTP Sent",
        description: "Please check your Telegram app for the verification code.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Connection Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telegram-client/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to verify code.");
      }
      return res.json();
    },
    onSuccess: () => {
      setIs2FaRequired(false);
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-client/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-client/chats"] });
      toast({
        title: "Logged In",
        description: "Telegram AI logged in successfully!",
      });
    },
    onError: (err: any) => {
      if (err.message && (err.message.includes("Two-step verification") || err.message.includes("2FA password") || err.message.includes("SESSION_PASSWORD_NEEDED"))) {
        setIs2FaRequired(true);
        toast({
          title: "2FA Password Required",
          description: "This account has 2FA enabled. Please enter your 2FA password.",
        });
      } else {
        toast({
          title: "Verification Failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/telegram-client/logout", { method: "POST" });
      if (!res.ok) throw new Error("Failed to logout");
      return res.json();
    },
    onSuccess: () => {
      setSelectedChat(null);
      setMessages([]);
      setStep("credentials");
      setIs2FaRequired(false);
      localStorage.removeItem("tg_root_access");
      setHasRootAccess(false);
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-client/status"] });
      toast({
        title: "Logged Out",
        description: "Telegram session closed.",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChat || !typedMessage.trim()) return;
      const text = typedMessage;
      setTypedMessage(""); // Clear early for better UX
      
      const res = await fetch("/api/telegram-client/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChat.id, text }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: (newMsg) => {
      if (newMsg) {
        setMessages((prev) => [...prev, newMsg]);
        queryClient.invalidateQueries({ queryKey: ["/api/telegram-client/chats"] });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Send Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const getAvatarInitials = (name: string) => {
    if (!name) return "?";
    return name.slice(0, 2).toUpperCase();
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      "from-pink-500 to-rose-500",
      "from-purple-500 to-indigo-500",
      "from-blue-500 to-cyan-500",
      "from-emerald-500 to-teal-500",
      "from-amber-500 to-orange-500",
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const renderAvatar = (id: string, name: string, sizeClass: string) => {
    const hasError = photoErrors[id];
    if (hasError) {
      return (
        <div
          className={`${sizeClass} rounded-full flex items-center justify-center font-bold bg-gradient-to-tr shadow-md shrink-0 ${getAvatarBg(
            name
          )}`}
        >
          {getAvatarInitials(name)}
        </div>
      );
    }
    return (
      <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold bg-slate-800 shadow-md shrink-0 overflow-hidden`}>
        <img
          src={`/api/telegram-client/profile-photo/${id}`}
          alt={name}
          className="w-full h-full object-cover rounded-full"
          onError={() => setPhotoErrors((prev) => ({ ...prev, [id]: true }))}
        />
      </div>
    );
  };

  const filteredChats = chats.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupsCount = chats.filter((c) => c.type === "group" || c.type === "channel").length;
  const contactsCount = chats.filter((c) => c.type === "user" && c.isContact && !c.isBot).length;
  const nonContactsCount = chats.filter((c) => c.type === "user" && !c.isContact && !c.isBot).length;
  const botsCount = chats.filter((c) => c.isBot).length;

  const displayedChats = filteredChats.filter((chat) => {
    if (activeTab === "all") return true;
    if (activeTab === "groups") return chat.type === "group" || chat.type === "channel";
    if (activeTab === "contacts") return chat.type === "user" && chat.isContact && !chat.isBot;
    if (activeTab === "non-contacts") return chat.type === "user" && !chat.isContact && !chat.isBot;
    if (activeTab === "bots") return !!chat.isBot;
    return true;
  });

  if (isStatusLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
      </div>
    );
  }

  // --- DISCONNECTED STATE: Auth UI ---
  if (!isConnected) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0c]">
        {/* Dynamic Background Elements */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 z-0">
          <motion.div 
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute top-[10%] left-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px]" 
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[440px] relative z-10"
        >
          <div className="glass-card p-10 rounded-[2.5rem] border border-white/10 relative overflow-hidden">
            {/* Top accent glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent blur-sm" />
            
            <div className="flex flex-col items-center space-y-8">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                className="relative"
              >
                <div className="w-20 h-20 rounded-[1.75rem] bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-600/40 relative z-10">
                  <Key className="w-10 h-10 text-white" />
                </div>
                <div className="absolute inset-0 bg-purple-600/30 blur-2xl rounded-full -z-10 animate-pulse" />
              </motion.div>

              <div className="text-center space-y-3">
                {step !== "credentials" && (
                  <motion.h1 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-3xl font-extrabold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
                  >
                    Verify Code
                  </motion.h1>
                )}
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground/80 font-medium text-sm"
                >
                  {step === "credentials" 
                    ? "Enter API credentials to initialize MTProto" 
                    : "Enter the code sent to your Telegram account"
                  }
                </motion.p>
              </div>

              {step === "credentials" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendCodeMutation.mutate();
                  }}
                  className="w-full space-y-5"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">API ID</label>
                    <div className="relative group">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-purple-500 transition-colors" />
                      <Input
                        type="number"
                        placeholder="e.g. 1234567"
                        value={apiId}
                        onChange={(e) => setApiId(e.target.value)}
                        className="h-14 pl-12 bg-white/[0.03] border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 rounded-2xl transition-all text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">API Hash</label>
                    <div className="relative group">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-purple-500 transition-colors" />
                      <Input
                        type="text"
                        placeholder="e.g. d2a24bb18..."
                        value={apiHash}
                        onChange={(e) => setApiHash(e.target.value)}
                        className="h-14 pl-12 bg-white/[0.03] border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 rounded-2xl transition-all text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Phone Number</label>
                    <div className="relative group">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-purple-500 transition-colors" />
                      <Input
                        type="tel"
                        placeholder="+94771234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-14 pl-12 bg-white/[0.03] border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 rounded-2xl transition-all text-white"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={sendCodeMutation.isPending}
                    className="w-full h-14 rounded-2xl font-bold text-base bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-650 hover:to-indigo-650 shadow-xl shadow-purple-600/20 transition-all active:scale-[0.98] mt-2"
                  >
                    {sendCodeMutation.isPending ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Initializing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Send Verification Code</span>
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    )}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loginMutation.mutate();
                  }}
                  className="w-full space-y-5"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Verification Code</label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-purple-500 transition-colors" />
                      <Input
                        type="text"
                        placeholder="Enter the Telegram code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="h-14 pl-12 bg-white/[0.03] border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 rounded-2xl transition-all text-white"
                        required
                      />
                    </div>
                  </div>

                  {/* ONLY show 2FA field if requires 2FA */}
                  {is2FaRequired && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">2FA Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-purple-500 transition-colors" />
                        <Input
                          type="password"
                          placeholder="Two-step verification password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-14 pl-12 bg-white/[0.03] border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 rounded-2xl transition-all text-white"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loginMutation.isPending}
                    className="w-full h-14 rounded-2xl font-bold text-base bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-650 hover:to-indigo-650 shadow-xl shadow-purple-600/20 transition-all active:scale-[0.98] mt-2"
                  >
                    {loginMutation.isPending ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Verifying...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <span>Verify & Connect</span>
                        <ArrowRight className="w-5 h-5" />
                      </div>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep("credentials");
                      setIs2FaRequired(false);
                    }}
                    className="w-full h-12 rounded-2xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Back to Credentials
                  </Button>
                </form>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Encrypted Session Active
                </p>
              </div>
            </div>
          </div>

          {/* Floating background particles */}
          <AnimatePresence>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0.1, 0.3, 0.1],
                  y: [0, -100, 0],
                  x: [0, (i % 2 === 0 ? 30 : -30), 0]
                }}
                transition={{ 
                  duration: 5 + i, 
                  repeat: Infinity,
                  delay: i * 0.5 
                }}
                className="absolute w-1 h-1 bg-purple-500 rounded-full blur-[1px]"
                style={{
                  left: `${15 + (i * 15)}%`,
                  top: `${80 + (i * 2)}%`
                }}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  // --- CONNECTED BUT ROOT LOCKED STATE: Success Screen ---
  if (isConnected && !hasRootAccess) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0c]">
        {/* Dynamic Background Elements */}
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
        <div className="absolute inset-0 z-0">
          <motion.div 
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className="absolute top-[10%] left-[10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute bottom-[10%] right-[10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[100px]" 
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[440px] relative z-10"
        >
          <div className="glass-card p-10 rounded-[2.5rem] border border-white/10 relative overflow-hidden text-center">
            {/* Top accent glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent blur-sm" />
            
            <div className="flex flex-col items-center space-y-8">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                className="relative"
              >
                <div className="w-20 h-20 rounded-[1.75rem] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/40 relative z-10">
                  <ShieldCheck className="w-10 h-10 text-white animate-pulse" />
                </div>
                <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full -z-10 animate-pulse" />
              </motion.div>

              <div className="text-center space-y-3">
                <motion.h1 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl font-extrabold tracking-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent"
                >
                  Linked Successfully
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-emerald-400 font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-1.5"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  AI Model is Working Now
                </motion.p>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed font-medium">
                Experience your super access now. The Telegram AI is connected, and automated shop messages, customer interaction, and AI processes are running smoothly in the background.
              </p>

              <div className="w-full pt-4 border-t border-white/5 flex flex-col items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAccessRoot}
                  className="text-xs text-white/40 hover:text-white/80 hover:bg-white/5 rounded-xl px-4 py-2 border border-white/5 transition-all"
                >
                  Access Root
                </Button>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                  Secure MTProto Link
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // --- CONNECTED STATE: Chat Messenger UI ---
  return (
    <div className="h-screen bg-slate-950 text-white flex overflow-hidden">
      {/* 1. Chat List Sidebar */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/40 backdrop-blur-xl">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <MessageCircle className="h-5 w-5 text-purple-400" />
            </div>
            <h1 className="font-bold text-lg bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              My Telegram
            </h1>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLockRoot}
              className="text-slate-400 hover:text-amber-400 hover:bg-slate-800 h-8 w-8"
              title="Lock Root Access"
            >
              <Lock className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm("Are you sure you want to disconnect Telegram?")) {
                  logoutMutation.mutate();
                }
              }}
              disabled={logoutMutation.isPending}
              className="text-slate-400 hover:text-red-400 hover:bg-slate-800 h-8 w-8"
              title="Log Out / Disconnect"
            >
              {logoutMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Sidebar Search */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-950/60 border-slate-800 focus:border-purple-500 text-white h-9 text-sm"
            />
          </div>
        </div>

        {/* Sidebar Tabs */}
        <div className="px-3 py-2.5 flex gap-1.5 overflow-x-auto scrollbar-none border-b border-slate-800/40 select-none shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
              activeTab === "all"
                ? "bg-purple-600 text-white shadow-md shadow-purple-950/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
              activeTab === "groups"
                ? "bg-purple-600 text-white shadow-md shadow-purple-950/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            Groups
            {groupsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === "groups" ? "bg-white/20 text-white" : "bg-slate-850 text-slate-400"}`}>
                {groupsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
              activeTab === "contacts"
                ? "bg-purple-600 text-white shadow-md shadow-purple-950/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            Contacts
            {contactsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === "contacts" ? "bg-white/20 text-white" : "bg-slate-855 text-slate-400"}`}>
                {contactsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("non-contacts")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
              activeTab === "non-contacts"
                ? "bg-purple-600 text-white shadow-md shadow-purple-950/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            Non-Contacts
            {nonContactsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === "non-contacts" ? "bg-white/20 text-white" : "bg-slate-860 text-slate-400"}`}>
                {nonContactsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("bots")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
              activeTab === "bots"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-950/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Bot className="h-3 w-3 shrink-0" />
            Bots
            {botsCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === "bots" ? "bg-white/20 text-white" : "bg-slate-800 text-cyan-400"}`}>
                {botsCount}
              </span>
            )}
          </button>
        </div>

        {/* Sidebar List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {isChatsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            </div>
          ) : displayedChats.length === 0 ? (
            <div className="text-center p-8 text-slate-500 text-sm">
              No chats found.
            </div>
          ) : (
            displayedChats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`w-full p-3.5 flex items-start gap-3 text-left transition-all ${
                  selectedChat?.id === chat.id
                    ? "bg-purple-950/20 border-l-4 border-purple-500"
                    : "hover:bg-slate-900/30 border-l-4 border-transparent"
                }`}
              >
                {/* Avatar */}
                {renderAvatar(chat.id, chat.name, "w-10 h-10 text-xs")}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-slate-200 text-sm truncate flex items-center gap-1">
                      {chat.type === "group" && <UsersIcon className="h-3 w-3 text-indigo-400 shrink-0" />}
                      {chat.type === "channel" && <Megaphone className="h-3 w-3 text-cyan-400 shrink-0" />}
                      {chat.isBot && <Bot className="h-3 w-3 text-cyan-400 shrink-0" />}
                      {chat.type === "user" && !chat.isBot && <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />}
                      {chat.name}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {chat.date ? new Date(chat.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate pr-2">
                    {chat.lastMessage || "No messages yet"}
                  </p>
                </div>

                {/* Badge */}
                {chat.unreadCount > 0 && (
                  <span className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full self-center">
                    {chat.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 2. Chat Conversation Pane */}
      <div className="flex-1 flex flex-col bg-slate-950 relative overflow-hidden">
        {/* Background ambient light */}
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-purple-900/5 rounded-full blur-3xl pointer-events-none" />

        {selectedChat ? (
          <>
            {/* Active Chat Header */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-900/20 backdrop-blur-md flex items-center justify-between z-10 shrink-0">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setShowDetailsPanel(!showDetailsPanel)}
              >
                {renderAvatar(selectedChat.id, selectedChat.name, "w-10 h-10 text-xs")}
                <div>
                  <h2 className="font-semibold text-slate-200 text-sm flex items-center gap-1.5">
                    {selectedChat.name}
                  </h2>
                  <p className="text-[11px] text-slate-500 capitalize flex items-center gap-1.5">
                    {selectedChat.type} {selectedChat.username ? `@${selectedChat.username}` : ""}
                    {selectedChat.type === "user" && selectedChat.isContact && (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1 rounded">Contact</span>
                    )}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDetailsPanel(!showDetailsPanel)}
                className={`h-9 w-9 hover:bg-slate-800 transition-colors ${showDetailsPanel ? "text-purple-400 bg-purple-950/20" : "text-slate-400 hover:text-slate-200"}`}
                title="Toggle Inspect Panel"
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 relative z-10">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  No messages in this chat.
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isOut = msg.out;
                  return (
                    <div
                      key={msg.id || index}
                      className={`flex flex-col max-w-[70%] ${
                        isOut ? "ml-auto items-end" : "mr-auto items-start"
                      }`}
                    >
                      {/* Sender Name for incoming group/channel messages */}
                      {!isOut && selectedChat.type !== "user" && (
                        <span className="text-[10px] text-slate-500 font-medium ml-2 mb-0.5">
                          {msg.senderName}
                        </span>
                      )}

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm shadow-md transition-all ${
                          isOut
                            ? "bg-purple-600 text-white rounded-br-none shadow-purple-950/20"
                            : "bg-slate-900/60 border border-slate-800/40 text-slate-200 rounded-bl-none shadow-slate-950/50 backdrop-blur-sm"
                        }`}
                      >
                        {msg.hasPhoto && (
                          <div className="mb-2 max-w-full overflow-hidden rounded-lg">
                            <img
                              src={`/api/telegram-client/message-media/${selectedChat.id}/${msg.id}`}
                              alt="Message media"
                              className="max-h-60 w-full object-contain rounded bg-slate-950/40 hover:scale-[1.02] transition-transform cursor-pointer"
                              onClick={() => window.open(`/api/telegram-client/message-media/${selectedChat.id}/${msg.id}`, '_blank')}
                            />
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>

                      {/* Date */}
                      <span className="text-[9px] text-slate-600 mt-1 mx-1.5">
                        {msg.date ? new Date(msg.date * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Box */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/20 backdrop-blur-md z-10 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessageMutation.mutate();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  type="text"
                  placeholder="Write a message..."
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  className="flex-1 bg-slate-950 border-slate-800 focus:border-purple-500 text-white h-11 px-4 text-sm"
                />
                <Button
                  type="submit"
                  disabled={!typedMessage.trim() || sendMessageMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-11 w-11 p-0 flex items-center justify-center shadow-lg shadow-purple-600/10 shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          /* Empty Chat View */
          <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-4 text-purple-400 shadow-xl shadow-slate-950/50">
              <MessageSquare className="h-8 w-8" />
            </div>
            <h3 className="font-bold text-lg text-slate-200">Start Messaging</h3>
            <p className="text-slate-500 text-sm max-w-sm mt-1">
              Select a conversation from the sidebar list to view the chat history and send messages in real-time.
            </p>
          </div>
        )}
      </div>

      {/* 3. Details Panel */}
      {selectedChat && showDetailsPanel && (
        <div className="w-80 border-l border-slate-800 bg-slate-900/40 backdrop-blur-xl flex flex-col h-full z-20 transition-all duration-300 relative shrink-0">
          {/* Panel Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-purple-400" />
              <span className="font-semibold text-sm text-slate-200">Inspect Details</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDetailsPanel(false)}
              className="h-7 w-7 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {isDetailsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : detailsError ? (
              <div className="text-red-400 text-xs p-4 text-center">
                Error loading details: {(detailsError as any).message}
              </div>
            ) : peerDetails ? (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Avatar and Badges */}
                <div className="flex flex-col items-center text-center space-y-3">
                  {renderAvatar(peerDetails.id, peerDetails.firstName || peerDetails.name || "", "w-20 h-20 text-2xl")}
                  
                  <div>
                    <h3 className="font-bold text-base text-slate-100">
                      {peerDetails.firstName ? `${peerDetails.firstName} ${peerDetails.lastName || ""}` : peerDetails.name}
                    </h3>
                    {peerDetails.username && (
                      <p className="text-xs text-purple-400">@{peerDetails.username}</p>
                    )}
                  </div>

                  {/* Badges row */}
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {peerDetails.isVerified && (
                      <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Verified
                      </span>
                    )}
                    {peerDetails.isPremium && (
                      <span className="bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Crown className="h-3 w-3 animate-pulse" /> Premium
                      </span>
                    )}
                    {peerDetails.type === "user" ? (
                      peerDetails.isContact ? (
                        <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full">
                          Contact
                        </span>
                      ) : (
                        <span className="bg-slate-500/20 text-slate-400 border border-slate-500/30 text-[10px] px-2 py-0.5 rounded-full">
                          Non-Contact
                        </span>
                      )
                    ) : (
                      <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] px-2 py-0.5 rounded-full capitalize">
                        {peerDetails.type}
                      </span>
                    )}
                  </div>
                </div>

                <hr className="border-slate-800/80" />

                {/* Details fields */}
                <div className="space-y-4">
                  {/* Bio / About */}
                  {(peerDetails.bio || peerDetails.about) && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Bio / Description</span>
                      <p className="text-sm text-slate-300 bg-slate-950/40 p-2.5 rounded-xl border border-slate-900 leading-relaxed whitespace-pre-wrap break-words">
                        {peerDetails.bio || peerDetails.about}
                      </p>
                    </div>
                  )}

                  {/* Info Cards */}
                  <div className="bg-slate-950/20 rounded-2xl border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
                    {/* ID */}
                    <div className="p-3 flex items-start gap-3">
                      <IdCard className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-medium text-slate-500 block">ID</span>
                        <span className="text-xs font-mono text-slate-300 select-all block truncate">{peerDetails.id}</span>
                      </div>
                    </div>

                    {/* Phone (Users only) */}
                    {peerDetails.type === "user" && peerDetails.phone && (
                      <div className="p-3 flex items-start gap-3">
                        <PhoneCall className="h-4 w-4 text-slate-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium text-slate-500 block">Phone</span>
                          <span className="text-xs text-slate-300 select-all block truncate">+{peerDetails.phone}</span>
                        </div>
                      </div>
                    )}

                    {/* Members Count (Channels/Groups only) */}
                    {peerDetails.type !== "user" && peerDetails.participantsCount !== undefined && (
                      <div className="p-3 flex items-start gap-3">
                        <Users className="h-4 w-4 text-slate-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium text-slate-500 block">Members</span>
                          <span className="text-xs text-slate-300 block font-semibold">{peerDetails.participantsCount}</span>
                        </div>
                      </div>
                    )}

                    {/* Username */}
                    {peerDetails.username && (
                      <div className="p-3 flex items-start gap-3">
                        <AtSign className="h-4 w-4 text-slate-400 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-medium text-slate-500 block">Username</span>
                          <span className="text-xs text-slate-300 select-all block truncate">@{peerDetails.username}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm text-center">No details available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
