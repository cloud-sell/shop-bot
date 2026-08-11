import { useEffect, useRef, useState } from "react";
import { generateTOTP, getRemainingSeconds } from "@/lib/totp";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Product, TelegramUser, Order, Payment, SpecialOffer } from "@shared/schema";
import { getTelegramInitData, expandTelegramWebApp } from "@/lib/telegram";
import { queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  ShoppingCart, 
  User as UserIcon, 
  Package, 
  Wallet, 
  ChevronRight, 
  CreditCard,
  History as HistoryIcon,
  Store as StoreIcon,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Zap,
  ExternalLink,
  ChevronDown,
  MessageCircle,
  Send,
  X,
  Minimize2,
  Copy,
  PlayCircle,
  Database
} from "lucide-react";

import { format } from "date-fns";
import { FaAws } from "react-icons/fa";
import { SiDigitalocean, SiGooglecloud, SiVultr, SiHetzner, SiBinance } from "react-icons/si";
import { VscAzure } from "react-icons/vsc";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/components/theme-provider";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// Helper for MiniApp API requests
const miniApiRequest = async (method: string, path: string, body?: any) => {
  const initData = getTelegramInitData();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Request failed");
  }
  return res;
};

// Provider Theme Mapping (Icon + Color)
const getProviderTheme = (name: string, type: string) => {
  const n = (name + " " + type).toLowerCase();
  
  // Base themes for backgrounds
  const themes: Record<string, { logo: string, color: string, bg: string, hover: string }> = {
    aws: {
      logo: "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg",
      color: "text-[#FF9900]",
      bg: "bg-[#FF9900]/5",
      hover: "group-hover:bg-[#FF9900]"
    },
    digitalocean: {
      logo: "https://www.vectorlogo.zone/logos/digitalocean/digitalocean-icon.svg",
      color: "text-[#0080FF]",
      bg: "bg-[#0080FF]/5",
      hover: "group-hover:bg-[#0080FF]"
    },
    azure: {
      logo: "https://www.vectorlogo.zone/logos/microsoft_azure/microsoft_azure-icon.svg",
      color: "text-[#0089D6]",
      bg: "bg-[#0089D6]/5",
      hover: "group-hover:bg-[#0089D6]"
    },
    oracle: {
      logo: "https://www.vectorlogo.zone/logos/oracle/oracle-icon.svg",
      color: "text-[#F11010]",
      bg: "bg-[#F11010]/5",
      hover: "group-hover:bg-[#F11010]"
    },
    google: {
      logo: "https://www.vectorlogo.zone/logos/google_cloud/google_cloud-icon.svg",
      color: "text-[#4285F4]",
      bg: "bg-[#4285F4]/5",
      hover: "group-hover:bg-[#4285F4]"
    },
    vultr: {
      logo: "https://www.vectorlogo.zone/logos/vultr/vultr-icon.svg",
      color: "text-[#007BFF]",
      bg: "bg-[#007BFF]/5",
      hover: "group-hover:bg-[#007BFF]"
    },
    hetzner: {
      logo: "https://v1.hetzner.com/img/hetzner-logo.svg",
      color: "text-[#D50C2D]",
      bg: "bg-[#D50C2D]/5",
      hover: "group-hover:bg-[#D50C2D]"
    },
    binance: {
      logo: "https://www.vectorlogo.zone/logos/binance/binance-icon.svg",
      color: "text-[#F3BA2F]",
      bg: "bg-[#F3BA2F]/5",
      hover: "group-hover:bg-[#F3BA2F]"
    }
  };

  let target: any = null;
  if (n.includes("aws") || n.includes("amazon")) target = themes.aws;
  else if (n.includes("digitalocean") || n.includes("digital ocean")) target = themes.digitalocean;
  else if (n.includes("vultr")) target = themes.vultr;
  else if (n.includes("azure") || n.includes("microsoft")) target = themes.azure;
  else if (n.includes("oracle")) target = themes.oracle;
  else if (n.includes("hetzner")) target = themes.hetzner;
  else if (n.includes("google") || n.includes("gcp")) target = themes.google;
  else if (n.includes("binance")) target = themes.binance;

  if (target) {
    return {
      icon: <img src={target.logo} alt={name} className="w-7 h-7 object-contain group-hover:brightness-0 group-hover:invert transition-all duration-300" />,
      color: target.color,
      bg: target.bg,
      hover: target.hover
    };
  }
  
  return { 
    icon: <Package className="w-6 h-6" />, 
    color: "text-neutral-600", 
    bg: "bg-neutral-50", 
    hover: "group-hover:bg-neutral-600" 
  };
};

// Simple icon getter for historical orders
const getProviderIcon = (name: string, type: string) => {
  return getProviderTheme(name, type).icon;
};

// User Profile Photo Component
const UserAvatar = ({ fallback: Fallback, className }: { fallback: any, className?: string }) => {
  const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
  const photoUrl = tgUser?.photo_url;

  if (photoUrl) {
    return (
      <img 
        src={photoUrl} 
        alt="Profile" 
        className={`${className} object-cover rounded-[30%]`}
        onError={(e) => {
          (e.target as any).style.display = 'none';
        }}
      />
    );
  }

  return <Fallback className="w-5 h-5 text-white" />;
};

type Tab = "store" | "orders" | "payments" | "profile";

function LiveTOTP({ secret, onCopy }: { secret: string, onCopy: (text: string) => void }) {
  const [code, setCode] = useState("000000");
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const updateCode = async () => {
      const newCode = await generateTOTP(secret);
      setCode(newCode);
    };

    updateCode();
    const timer = setInterval(() => {
      const remaining = getRemainingSeconds();
      setTimeLeft(remaining);
      if (remaining === 30) {
        updateCode();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [secret]);

  return (
    <div className="bg-gradient-to-br from-purple-600 to-indigo-700 p-4 rounded-2xl text-white shadow-lg relative overflow-hidden group mb-4">
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-2xl rounded-full translate-x-8 -translate-y-8" />
      <div className="relative z-10 flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-[9px] font-black uppercase tracking-widest text-purple-100/60 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
            Live 2FA
          </div>
          <div className="text-2xl font-black tracking-widest font-mono tabular-nums">
            {code.slice(0, 3)} {code.slice(3)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-11 h-11 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r="19"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-white/20"
              />
              <circle
                cx="24"
                cy="24"
                r="19"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={119.38}
                strokeDashoffset={119.38 - (119.38 * timeLeft) / 30}
                strokeLinecap="round"
                className="text-white transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute text-[9px] font-black tabular-nums">{timeLeft}s</span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white shadow-sm transition-all active:scale-90"
            onClick={() => onCopy(code)}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MiniAppShop() {
  const { theme } = useTheme();
  const { toast } = useToast();

  // Immediately set body background on first render (before useEffect) to avoid flash
  const isDarkMode = theme === "dark" || (theme === "system" && typeof window !== 'undefined' && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (typeof window !== 'undefined') {
    const bg = isDarkMode ? '#121212' : '#f8f7ff';
    document.body.style.background = bg;
    document.body.style.backgroundColor = bg;
  }


  const [activeTab, setActiveTab] = useState<Tab>("store");
  const [selectedProduct, setSelectedProduct] = useState<(Product & { stockCount?: number }) | null>(null);
  const [viewingOrder, setViewingOrder] = useState<(Order & { product: Product, credential: any }) | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const autoSwapRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [selectedOffer, setSelectedOffer] = useState<SpecialOffer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeTutorial, setActiveTutorial] = useState<"buy" | "deposit" | null>(null);

  // AI Support Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'bot', content: string }[]>([
    { role: 'bot', content: "Hello! 👋 I'm your AI Support Concierge. How can I help you today?" }
  ]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isChatOpen) scrollToBottom();
  }, [chatHistory, isChatOpen]);

  const handleSendChat = async () => {
    if (!chatMessage.trim() || isSendingChat) return;
    
    const userMsg = chatMessage.trim();
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatMessage("");
    setIsSendingChat(true);

    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: 'bot', content: data.answer || "I'm offline right now." }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'bot', content: "Sorry, I'm having trouble connecting. Reach out to @rochana_imesh." }]);
    } finally {
      setIsSendingChat(false);
    }
  };

  useEffect(() => {
    expandTelegramWebApp();
    const webApp = (window as any).Telegram?.WebApp;
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const bgLight = '#f8f7ff';
    const bgDark = '#121212';
    const bg = isDark ? bgDark : bgLight;

    // Force body background via inline style — reliable across all browsers & WebViews
    document.body.style.background = bg;
    document.body.style.backgroundColor = bg;

    if (webApp) {
      webApp.setHeaderColor(isDark ? '#1a1a1a' : '#ffffff');
      webApp.setBackgroundColor(bg);
    }

    if (isDark) {
      document.body.classList.add('tg-body');
    } else {
      document.body.classList.remove('tg-body');
    }

    return () => {
      document.body.classList.remove('tg-body');
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
    };
  }, [theme]);


  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({ 
      title: "Copied to Clipboard", 
      description: "Credential details have been copied successfully.",
      duration: 2000 
    });
  };

  const { data: user, isLoading: userLoading } = useQuery<TelegramUser>({
    queryKey: ["/api/mini/user"],
    queryFn: async () => {
      const res = await miniApiRequest("GET", "/api/mini/user");
      return res.json();
    }
  });

  // Branding Settings
  const { data: storeNameSetting } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/STORE_NAME"],
  });

  const { data: supportUsernameSetting } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/SUPPORT_USERNAME"],
  });

  const { data: supportBtnTextSetting } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/SUPPORT_BTN_TEXT"],
  });

  const { data: loadingTextSetting } = useQuery<{ value: string }>({
    queryKey: ["/api/settings/LOADING_TEXT"],
  });

  const storeName = storeNameSetting?.value || "Shopeefy";
  const supportUsername = supportUsernameSetting?.value || "@rochana_imesh";
  const supportBtnText = supportBtnTextSetting?.value || "Write to Support";
  const loadingText = loadingTextSetting?.value || "Shopeefy...";

  const { data: products, isLoading: productsLoading } = useQuery<(Product & { stockCount?: number })[]>({
    queryKey: ["/api/mini/products"],
    queryFn: async () => {
      const res = await miniApiRequest("GET", "/api/mini/products");
      return res.json();
    }
  });

  const { data: offers, isLoading: offersLoading } = useQuery<SpecialOffer[]>({
    queryKey: ["/api/mini/offers"],
    queryFn: async () => {
      const res = await miniApiRequest("GET", "/api/mini/offers");
      return res.json();
    },
    enabled: activeTab === "store"
  });

  // Auto-swap carousel every 3 seconds
  useEffect(() => {
    const activeOffers = offers?.filter(o => o.status === 'active') ?? [];
    const totalSlides = 1 + activeOffers.length; // slide 0 = hero, 1..N = offers
    if (totalSlides <= 1) return;
    autoSwapRef.current = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % totalSlides);
    }, 3000);
    return () => {
      if (autoSwapRef.current) clearInterval(autoSwapRef.current);
    };
  }, [offers]);

  const { data: orders, isLoading: ordersLoading } = useQuery<(Order & { product: Product, credential: any })[]>({
    queryKey: ["/api/mini/orders"],
    queryFn: async () => {
      const res = await miniApiRequest("GET", "/api/mini/orders");
      return res.json();
    },
    enabled: activeTab === "orders" || activeTab === "store"
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({
    queryKey: ["/api/mini/payments"],
    queryFn: async () => {
      const res = await miniApiRequest("GET", "/api/mini/payments");
      return res.json();
    },
    enabled: activeTab === "payments"
  });

  const purchaseMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number, quantity: number }) => {
      const res = await miniApiRequest("POST", "/api/mini/purchase", { productId, quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mini/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mini/orders"] });
      setPurchaseSuccess(true);
      setSelectedProduct(null);
      toast({ title: "Purchase Successful!", description: "Account credentials sent to your DM." });
    },
    onError: (error: any) => {
      toast({ title: "Purchase Failed", description: error.message, variant: "destructive" });
    }
  });

  const purchaseOfferMutation = useMutation({
    mutationFn: async (offerId: number) => {
      const res = await miniApiRequest("POST", "/api/mini/purchase-offer", { offerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mini/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/mini/orders"] });
      setPurchaseSuccess(true);
      setSelectedOffer(null);
      toast({ title: "Bundle Claimed!", description: "Your premium bundle credentials have been sent to your DM." });
    },
    onError: (error: any) => {
      toast({ title: "Claim Failed", description: error.message, variant: "destructive" });
    }
  });

  // Views for different tabs
  const renderStore = () => {
    const activeOffers = offers?.filter(o => o.status === 'active') ?? [];
    const totalSlides = 1 + activeOffers.length;

    // Offer slide gradient palettes
    const offerGradients = [
      "from-amber-500 via-orange-500 to-red-600",
      "from-emerald-500 via-teal-500 to-cyan-600",
      "from-pink-500 via-rose-500 to-red-500",
      "from-violet-600 via-purple-500 to-pink-500",
      "from-sky-500 via-blue-500 to-indigo-600",
    ];
    const offerShadows = [
      "shadow-orange-200",
      "shadow-teal-200",
      "shadow-rose-200",
      "shadow-purple-200",
      "shadow-blue-200",
    ];
    const offerIndicatorColors = [
      "bg-orange-500",
      "bg-teal-500",
      "bg-rose-500",
      "bg-purple-500",
      "bg-blue-500",
    ];

    const handleDragEnd = (_: any, info: any, goTo: number) => {
      if (info.offset.x < -50 && goTo < totalSlides - 1) setCurrentSlide(goTo + 1);
      if (info.offset.x > 50 && goTo > 0) setCurrentSlide(goTo - 1);
      // restart auto-swap timer
      if (autoSwapRef.current) clearInterval(autoSwapRef.current);
      autoSwapRef.current = setInterval(() => {
        setCurrentSlide(prev => (prev + 1) % totalSlides);
      }, 3000);
    };

    return (
    <div className="space-y-6">
      <div className="relative overflow-hidden group">
        <AnimatePresence mode="wait">
          {currentSlide === 0 && (
            <motion.section 
              key="hero-main"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(e, info) => handleDragEnd(e, info, 0)}
              className="relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-700 p-8 text-white cursor-grab active:cursor-grabbing"
            >
              <div className="relative z-10">
                <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 px-3 py-1 mb-4 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md">
                  Elite Cloud Services
                </Badge>
                <h2 className="text-3xl font-black tracking-tighter leading-none mb-2">Instant<br/>Deployment</h2>
                <p className="text-purple-100/80 text-[11px] font-medium max-w-[200px] leading-relaxed">High-tier verified accounts for AWS, DigitalOcean & more.</p>
              </div>
              {/* Removed blue glow blur */}
              <Zap className="absolute bottom-6 right-8 w-12 h-12 text-white/10" />
            </motion.section>
          )}

          {activeOffers.map((offer, idx) => (
            currentSlide === idx + 1 && (
              <motion.section 
                key={`offer-${offer.id}`}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(e, info) => handleDragEnd(e, info, idx + 1)}
                className={`relative rounded-[2.5rem] overflow-hidden bg-gradient-to-br ${offerGradients[idx % offerGradients.length]} p-8 text-white cursor-grab active:cursor-grabbing`}
              >
                <div className="relative z-10">
                  <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 px-3 py-1 mb-4 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-md">
                    Hot Bundle 🔥
                  </Badge>
                  <h2 className="text-2xl font-black tracking-tighter leading-tight mb-1">{offer.name}</h2>
                  {offer.description && (
                    <p className="text-white/75 text-[11px] font-medium max-w-[210px] leading-relaxed mb-4">{offer.description}</p>
                  )}
                  <div className="flex items-end gap-3 mt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-0.5">Bundle × {offer.bundleQuantity}</span>
                      <span className="text-4xl font-black tracking-tighter leading-none">${(offer.price / 100).toFixed(2)}</span>
                    </div>
                    <Button 
                      size="sm" 
                      className="mb-1 h-10 px-5 rounded-full bg-white/95 hover:bg-white text-neutral-900 font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                      onClick={() => setSelectedOffer(offer)}
                    >
                      Claim Now
                    </Button>
                  </div>
                  {offer.expiresAt && (
                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest mt-3">
                      ⏰ Expires {new Date(offer.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {/* Removed white glow blur */}
                <StoreIcon className="absolute bottom-6 right-8 w-12 h-12 text-white/10" />
              </motion.section>
            )
          ))}
        </AnimatePresence>
        
        {/* Dynamic dot indicators */}
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentSlide(i);
                if (autoSwapRef.current) clearInterval(autoSwapRef.current);
                autoSwapRef.current = setInterval(() => {
                  setCurrentSlide(prev => (prev + 1) % totalSlides);
                }, 3000);
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentSlide === i 
                  ? `w-5 ${i === 0 ? 'bg-purple-600' : offerIndicatorColors[(i - 1) % offerIndicatorColors.length]}` 
                  : 'w-1.5 bg-neutral-200'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-black tracking-tighter flex items-center gap-2 text-neutral-800 dark:text-foreground uppercase italic">
            <StoreIcon className="w-5 h-5 text-purple-600" /> {storeName}
          </h3>
           <Badge variant="outline" className="text-[10px] border-purple-100 text-purple-600 font-black px-3 py-1 rounded-full uppercase">
            {products?.length || 0} Products
          </Badge>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 px-1 scrollbar-hide no-scrollbar">
          {[
            { id: 'all', label: 'All', icon: <Package className="w-4 h-4" /> },
            { id: 'aws', label: 'AWS', icon: <FaAws className="w-4 h-4" /> },
            { id: 'digitalocean', label: 'DO', icon: <SiDigitalocean className="w-4 h-4" /> },
            { id: 'azure', label: 'Azure', icon: <VscAzure className="w-4 h-4" /> },
            { id: 'google', label: 'GCP', icon: <SiGooglecloud className="w-4 h-4" /> },
            { id: 'vultr', label: 'Vultr', icon: <SiVultr className="w-4 h-4" /> },
            { id: 'hetzner', label: 'Hetzner', icon: <SiHetzner className="w-4 h-4" /> },
            { id: 'oracle', label: 'Oracle', icon: <Database className="w-4 h-4" /> },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl whitespace-nowrap text-[11px] font-black uppercase tracking-widest transition-all ${
                selectedCategory === cat.id 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-white dark:bg-card text-neutral-400 border border-purple-50/50 dark:border-white/5'
              }`}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3.5">
          <AnimatePresence mode="popLayout">
            {products?.filter(p => {
              if (selectedCategory === 'all') return true;
              const n = (p.name + " " + p.type).toLowerCase();
              if (selectedCategory === 'aws') return n.includes('aws') || n.includes('amazon');
              if (selectedCategory === 'digitalocean') return n.includes('digitalocean') || n.includes('digital ocean');
              return n.includes(selectedCategory);
            }).map((product, index) => {
              const theme = getProviderTheme(product.name, product.type);
              return (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => {
                    setPurchaseQuantity(1);
                    setSelectedProduct(product);
                  }}
                  className={`group relative bg-white dark:bg-card p-5 rounded-[2rem] border border-purple-50/50 dark:border-white/10 shadow-sm hover:shadow-xl hover:border-purple-200 dark:hover:border-purple-500 hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-between active:scale-[0.97]`}
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-inner ${theme.bg} ${theme.color} ${theme.hover} group-hover:text-white`}>
                      {theme.icon}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-neutral-900 dark:text-card-foreground tracking-tight text-base leading-tight">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{product.type}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-neutral-100" />
                        <Badge className="bg-green-50 text-green-600 border-0 hover:bg-green-50 text-[9px] font-black px-2 py-0.5 uppercase">
                          {product.stockCount} Stock
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-xl text-neutral-900 dark:text-card-foreground tracking-tighter">
                      ${(product.price / 100).toFixed(2)}
                    </span>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm ${theme.bg} ${theme.color} ${theme.hover} group-hover:text-white`}>
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
    );
  };

  const renderOrders = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 px-2">
        <h3 className="text-2xl font-black tracking-tighter text-neutral-900 uppercase italic">Your Orders</h3>
        <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">History of your success</p>
      </div>

      <div className="space-y-4">
        {ordersLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
        ) : orders?.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto text-purple-200">
              <Package className="w-10 h-10" />
            </div>
            <p className="text-neutral-300 font-black uppercase tracking-widest text-xs">No orders found yet</p>
          </div>
        ) : (
          orders?.map((order, i) => (
            <motion.div 
              key={order.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setViewingOrder(order)}
              className="group bg-white p-6 rounded-[2.5rem] border border-neutral-100 shadow-sm space-y-4 relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
            >
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                  <h5 className="font-black text-neutral-900 tracking-tight text-lg leading-tight uppercase italic group-hover:text-purple-600 transition-colors">{order.product?.name}</h5>
                  <div className="flex items-center gap-2 text-neutral-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black uppercase tracking-tight">
                      {format(new Date(order.createdAt || Date.now()), "MMM dd, yyyy • hh:mm a")}
                    </span>
                  </div>
                </div>
                <Badge className="bg-green-500 text-white border-0 rounded-full text-[9px] font-black uppercase tracking-widest px-3 py-1 shadow-lg">
                  Delivered
                </Badge>
              </div>
              
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 font-mono text-[11px] text-neutral-600 break-all select-all flex items-center justify-between group/code relative">
                <code className="line-clamp-1 pr-8">{order.credential?.content || "Check your Telegram DM"}</code>
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(order.credential?.content || "");
                  }}
                  className="absolute right-3 p-2 bg-white rounded-xl border border-neutral-100 shadow-sm opacity-0 group-hover/code:opacity-100 transition-opacity active:scale-90"
                >
                  <CreditCard className="w-3.5 h-3.5 text-purple-600" />
                </div>
              </div>
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/30 rounded-full translate-x-12 -translate-y-12" />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );

  const renderPayments = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 px-2">
        <h3 className="text-2xl font-black tracking-tighter text-neutral-900 uppercase italic">Payments</h3>
        <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">Full account financial history</p>
      </div>

      <div className="space-y-3">
        {paymentsLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-purple-600" /></div>
        ) : payments?.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mx-auto text-purple-200">
              <CreditCard className="w-10 h-10" />
            </div>
            <p className="text-neutral-300 font-black uppercase tracking-widest text-xs">No payments found</p>
          </div>
        ) : (
          payments?.map((payment, i) => (
            <motion.div 
              key={payment.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white p-5 rounded-3xl border border-neutral-100 flex items-center justify-between shadow-sm relative overflow-hidden group"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                  payment.paymentMethod.toLowerCase().includes('binance') 
                    ? 'bg-amber-50 text-amber-500 group-hover:bg-amber-500 group-hover:text-white' 
                    : 'bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white'
                }`}>
                  {payment.paymentMethod.toLowerCase().includes('binance') ? (
                    <SiBinance className="w-6 h-6" />
                  ) : (
                    <Wallet className="w-6 h-6" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{payment.paymentMethod}</span>
                  <div className="text-[12px] font-black text-neutral-900 italic">
                    {format(new Date(payment.createdAt || Date.now()), "MMMM dd, HH:mm")}
                  </div>
                </div>
              </div>
              <div className="text-right relative z-10">
                <div className="text-lg font-black text-neutral-900 tracking-tighter">
                  +${(payment.amount / 100).toFixed(2)}
                </div>
                <Badge className={`bg-transparent p-0 text-[10px] font-black uppercase tracking-[0.2em] ${payment.status === 'completed' ? 'text-green-500' : 'text-amber-500'}`}>
                  ● {payment.status}
                </Badge>
              </div>
              <div className="absolute left-0 bottom-0 w-full h-[3px] bg-green-500/10 group-hover:bg-green-500/50 transition-all" />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-8">
      <div className="flex flex-col gap-1 px-2">
        <h3 className="text-2xl font-black tracking-tighter text-neutral-900 uppercase italic">Profile</h3>
        <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">Account & Settings</p>
      </div>

      <div className="bg-white rounded-[3rem] p-10 border border-purple-50 relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-[30%] bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center text-white shadow-xl rotate-12 group hover:rotate-0 transition-transform duration-500 overflow-hidden">
              <UserAvatar fallback={UserIcon} className="w-full h-full -rotate-12 group-hover:rotate-0 transition-transform duration-500" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 border-4 border-white flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
          </div>
          
          <div className="space-y-1">
            <h4 className="text-2xl font-black text-neutral-900 tracking-tighter italic">
              {user?.firstName} {user?.lastName}
            </h4>
            <div className="flex items-center gap-2 justify-center">
              <Badge className="bg-purple-50 text-purple-600 border-0 text-[10px] font-black px-3 py-0.5 rounded-full uppercase tracking-tighter">
                ID: {user?.telegramId}
              </Badge>
            </div>
          </div>

          <div className="w-full h-px bg-neutral-50" />

          <div className="grid grid-cols-2 gap-4 w-full">
            <div className="bg-neutral-50/50 p-6 rounded-[2rem] border border-neutral-100 flex flex-col items-center gap-2">
              <Wallet className="w-6 h-6 text-purple-600" />
              <div className="text-xs font-black text-neutral-400 uppercase tracking-widest">Balance</div>
              <div className="text-xl font-black text-neutral-900">${((user?.balance || 0) / 100).toFixed(2)}</div>
            </div>
            <div className="bg-neutral-50/50 p-6 rounded-[2rem] border border-neutral-100 flex flex-col items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              <div className="text-xs font-black text-neutral-400 uppercase tracking-widest">Orders</div>
              <div className="text-xl font-black text-neutral-900">{orders?.length || 0}</div>
            </div>
          </div>

          <Button 
            className="w-full h-16 rounded-[2rem] bg-neutral-900 hover:bg-black text-white font-black uppercase tracking-[0.2em] shadow-xl group transition-all"
            onClick={() => setActiveTab("store")}
          >
            Start Shopping <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
        
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-600 to-blue-500" />
        {/* Removed profile tab glow blur */}
      </div>

      <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100/50 flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h5 className="text-sm font-black text-amber-900 tracking-tight uppercase">Support Security</h5>
          <p className="text-[11px] font-bold text-amber-700/70 leading-relaxed uppercase">Your credentials are encrypted end-to-end. Contact {supportUsername} for bulk inquiries.</p>
        </div>
      </div>
    </div>
  );

  if (userLoading || productsLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 overflow-hidden" style={{ background: '#f8f7ff' }}>
        <div className="relative w-16 h-16">
          <motion.div
            className="w-full h-full relative"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <motion.div 
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-0 left-1/2 -ml-2.5 w-5 h-5 rounded-full bg-purple-600 shadow-lg" 
            />
            <motion.div 
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              className="absolute bottom-0 left-0 w-5 h-5 rounded-full bg-blue-600 shadow-lg" 
            />
            <motion.div 
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
              className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-pink-600 shadow-lg" 
            />
          </motion.div>
        </div>
        
        <div className="mt-16 text-center space-y-2">
          <h3 className="text-xl font-black italic tracking-tighter text-neutral-800 uppercase">
            {storeName}
          </h3>
          <p className="font-black text-[9px] text-purple-600/40 tracking-[0.5em] uppercase animate-pulse">
            {loadingText}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="tg-mini-app min-h-screen text-neutral-900 dark:text-foreground font-sans selection:bg-purple-200 pb-32" style={{ background: 'inherit' }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-background/80 backdrop-blur-2xl border-b border-purple-50/50 dark:border-white/10 px-6 py-5">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex items-center gap-3.5">
            <motion.div 
              whileHover={{ rotate: 10 }}
              className="w-11 h-11 rounded-2xl bg-neutral-900 flex items-center justify-center shadow-lg transition-all overflow-hidden"
            >
              <UserAvatar fallback={UserIcon} className="w-full h-full" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.25em] leading-none mb-1">Authenticated</span>
              <span className="text-base font-black tracking-tighter text-neutral-900 dark:text-white leading-none italic">
                {user?.firstName?.toUpperCase() || "ACCESS_DENIED"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.div 
              whileTap={{ scale: 0.95 }}
              className="px-5 py-2.5 bg-neutral-50 dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 flex items-center gap-3 shadow-inner"
            >
              <Wallet className="w-4 h-4 text-purple-600" />
              <span className="text-lg font-black tracking-tighter text-neutral-900 dark:text-white leading-none italic">
                ${((user?.balance || 0) / 100).toFixed(2)}
              </span>
            </motion.div>
            <ThemeToggle className="bg-neutral-50 dark:bg-neutral-900 border-neutral-100 dark:border-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 shadow-inner" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-md mx-auto p-6 min-h-[60vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {activeTab === "store" && renderStore()}
            {activeTab === "orders" && renderOrders()}
            {activeTab === "payments" && renderPayments()}
            {activeTab === "profile" && renderProfile()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Fixed Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-sm z-[100]">
        <div className="bg-neutral-900/95 backdrop-blur-xl rounded-[2.5rem] p-2 flex items-center justify-between shadow-2xl border border-white/10 relative overflow-hidden">
          <TabButton 
            active={activeTab === "store"} 
            onClick={() => setActiveTab("store")} 
            icon={<StoreIcon className="w-5 h-5" />} 
            label="Shop"
          />
          <TabButton 
            active={activeTab === "orders"} 
            onClick={() => setActiveTab("orders")} 
            icon={<HistoryIcon className="w-5 h-5" />} 
            label="Stock"
          />
          <TabButton 
            active={activeTab === "payments"} 
            onClick={() => setActiveTab("payments")} 
            icon={<CreditCard className="w-5 h-5" />} 
            label="Funds"
          />
          <TabButton 
            active={activeTab === "profile"} 
            onClick={() => setActiveTab("profile")} 
            icon={<UserIcon className="w-5 h-5" />} 
            label="ID"
          />
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      </nav>

      {/* Regular Purchase Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="rounded-[2.5rem] border-0 bg-white/95 backdrop-blur-xl p-8 shadow-2xl max-w-[90vw] mx-auto">
          <DialogHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-3xl bg-purple-50 flex items-center justify-center text-purple-600 shadow-inner">
                {selectedProduct && getProviderIcon(selectedProduct.name, selectedProduct.type)}
              </div>
            </div>
            <div className="text-center">
              <DialogTitle className="text-2xl font-black tracking-tighter text-neutral-900 uppercase italic">
                {selectedProduct?.name}
              </DialogTitle>
              <DialogDescription className="text-xs font-bold uppercase tracking-widest text-neutral-400 mt-1">
                Select quantity and confirm
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="py-6 space-y-6">
            {/* Quantity Selector */}
            <div className="flex flex-col items-center gap-4">
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Select Quantity</span>
              <div className="flex items-center gap-6 bg-purple-50/50 p-2 rounded-[2rem] border border-purple-100">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-12 h-12 rounded-[1.25rem] bg-white shadow-md hover:bg-purple-600 hover:text-white text-purple-600 transition-all disabled:opacity-30 border border-purple-50"
                  disabled={purchaseQuantity <= 1}
                  onClick={() => setPurchaseQuantity(q => q - 1)}
                >
                  <Minimize2 className="w-5 h-5" />
                </Button>
                <div className="flex flex-col items-center min-w-[3rem]">
                  <span className="text-3xl font-black text-neutral-900 tabular-nums leading-none">{purchaseQuantity}</span>
                  <span className="text-[9px] font-black text-purple-400 uppercase tracking-tighter mt-1">Items</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-12 h-12 rounded-[1.25rem] bg-white shadow-md hover:bg-purple-600 hover:text-white text-purple-600 transition-all disabled:opacity-30 border border-purple-50"
                  disabled={selectedProduct && purchaseQuantity >= (selectedProduct.stockCount || 0)}
                  onClick={() => setPurchaseQuantity(q => q + 1)}
                >
                  <X className="w-5 h-5 rotate-45" />
                </Button>
              </div>
            </div>

            <div className="bg-purple-50/50 p-5 rounded-3xl border border-purple-100 flex justify-between items-center">
              <span className="text-xs font-black text-purple-900/40 uppercase tracking-widest">Total Price</span>
              <span className="text-2xl font-black text-purple-900 tracking-tighter">
                ${selectedProduct ? ((selectedProduct.price * purchaseQuantity) / 100).toFixed(2) : "0.00"}
              </span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-3">
            <Button 
              variant="ghost" 
              className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-neutral-400 hover:bg-neutral-50"
              onClick={() => setSelectedProduct(null)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-1 h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
              disabled={purchaseMutation.isPending || !selectedProduct || (selectedProduct.stockCount || 0) < purchaseQuantity}
              onClick={() => {
                if (selectedProduct) {
                  purchaseMutation.mutate({ productId: selectedProduct.id, quantity: purchaseQuantity });
                }
              }}
            >
              {purchaseMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Buy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Special Offer Dialog */}
      <Dialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <DialogContent className="rounded-[3rem] border-0 bg-gradient-to-br from-neutral-900 to-neutral-800 p-0 shadow-2xl max-w-[90vw] mx-auto overflow-hidden">
          <div className="p-8 space-y-6 relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 blur-3xl rounded-full translate-x-12 -translate-y-12" />
            
            <div className="flex justify-center relative z-10">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-400 to-orange-600 flex items-center justify-center text-white shadow-2xl shadow-orange-500/20">
                <Zap className="w-10 h-10 fill-white/20" />
              </div>
            </div>

            <div className="text-center space-y-2 relative z-10">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-2">
                Exclusive Bundle Deal
              </Badge>
              <DialogTitle className="text-3xl font-black tracking-tighter text-white uppercase italic">
                {selectedOffer?.name}
              </DialogTitle>
              <p className="text-neutral-400 text-[11px] font-medium max-w-[250px] mx-auto leading-relaxed">
                {selectedOffer?.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex flex-col items-center gap-1">
                <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Quantity</span>
                <span className="text-xl font-black text-white">{selectedOffer?.bundleQuantity} Units</span>
              </div>
              <div className="bg-white/5 p-4 rounded-3xl border border-white/5 flex flex-col items-center gap-1">
                <span className="text-[8px] font-black text-neutral-500 uppercase tracking-widest">Bundle Price</span>
                <span className="text-xl font-black text-amber-400">${selectedOffer ? (selectedOffer.price / 100).toFixed(2) : "0.00"}</span>
              </div>
            </div>

            <Button 
              className="w-full h-16 rounded-3xl bg-amber-500 hover:bg-amber-400 text-neutral-900 font-black uppercase tracking-[0.2em] shadow-2xl shadow-amber-500/20 group relative z-10"
              disabled={purchaseOfferMutation.isPending}
              onClick={() => {
                if (selectedOffer) {
                  purchaseOfferMutation.mutate(selectedOffer.id);
                }
              }}
            >
              {purchaseOfferMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>Claim Offer <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" /></>
              )}
            </Button>

            <button 
              onClick={() => setSelectedOffer(null)}
              className="w-full text-center text-neutral-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors py-2"
            >
              Maybe later
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Animation Overlay */}
      <AnimatePresence>
        {purchaseSuccess && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-white/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-32 h-32 rounded-[2.5rem] bg-green-500 text-white flex items-center justify-center mb-8"
            >
              <CheckCircle2 className="w-16 h-16" />
            </motion.div>
            <h2 className="text-3xl font-black tracking-tighter text-neutral-900 uppercase italic mb-2">Order Confirmed!</h2>
            <p className="text-neutral-500 text-[11px] font-bold uppercase tracking-widest mb-8">Your credentials have been sent to your Telegram DM</p>
            <Button 
              className="h-14 px-10 rounded-2xl bg-neutral-900 hover:bg-black text-white font-black uppercase tracking-widest shadow-xl"
              onClick={() => setPurchaseSuccess(false)}
            >
              Return to Store
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Order Detail Dialog */}
      <Dialog open={viewingOrder !== null} onOpenChange={(open) => !open && setViewingOrder(null)}>
        <DialogContent className="bg-white/95 backdrop-blur-2xl rounded-[2.5rem] p-6 border-0 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.15)] max-w-[90%] sm:max-w-md overflow-hidden">
          {viewingOrder && (
            <>
              <DialogHeader className="space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-neutral-50 flex items-center justify-center mb-1 mx-auto shadow-inner group">
                   {getProviderIcon(viewingOrder.product?.name || "", viewingOrder.product?.type || "")}
                </div>
                <DialogTitle className="text-xl font-black text-center text-neutral-900 tracking-tighter uppercase italic leading-none">Order Details</DialogTitle>
                <DialogDescription className="text-center text-neutral-400 font-bold text-[10px] px-4 uppercase tracking-[0.1em] leading-relaxed">
                  {format(new Date(viewingOrder.createdAt || Date.now()), "MMMM dd, yyyy • hh:mm a")}
                </DialogDescription>
              </DialogHeader>

              <div className="my-3 space-y-3">
                <div className="bg-neutral-50/80 p-4 rounded-3xl border border-neutral-100 flex flex-col gap-2 relative group">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Credentials</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-7 rounded-full bg-white text-purple-600 hover:bg-purple-600 hover:text-white border border-purple-100 shadow-sm font-black text-[8px] uppercase px-3"
                      onClick={() => copyToClipboard(viewingOrder.credential?.content || "")}
                    >
                      Copy All
                    </Button>
                  </div>
                  <div className="bg-white p-3.5 rounded-2xl border border-neutral-100 font-mono text-[11px] text-neutral-700 break-all leading-relaxed shadow-inner max-h-[120px] overflow-y-auto scrollbar-hide">
                    {viewingOrder.credential?.content || "Credentials not found"}
                  </div>
                </div>

                {/* 2FA Section Detection */}
                {(() => {
                  const content = viewingOrder.credential?.content || "";
                  const secretMatch = content.match(/[A-Z2-7]{16,32}/);
                  if (secretMatch) {
                    return <LiveTOTP secret={secretMatch[0]} onCopy={(text) => {
                      navigator.clipboard.writeText(text);
                      toast({ title: "2FA Code Copied", description: "The live verification code is now in your clipboard." });
                    }} />;
                  }
                  return null;
                })()}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-neutral-50/50 p-3.5 rounded-[1.25rem] border border-neutral-100/50 text-center">
                    <div className="text-[8px] font-black text-neutral-400 uppercase tracking-widest mb-0.5">Status</div>
                    <div className="text-[10px] font-black text-green-600 uppercase">Delivered</div>
                  </div>
                  <div className="bg-neutral-50/50 p-3.5 rounded-[1.25rem] border border-neutral-100/50 text-center">
                    <div className="text-[8px] font-black text-neutral-400 uppercase tracking-widest mb-0.5">Stock ID</div>
                    <div className="text-[10px] font-black text-neutral-900 italic">#{viewingOrder.id.toString().padStart(4, '0')}</div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button 
                  onClick={() => setViewingOrder(null)}
                  className="w-full h-12 rounded-[1.25rem] bg-neutral-900 hover:bg-black text-white font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95 text-[10px]"
                >
                  Close Record
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating AI Chat Widget */}
      <div className="fixed bottom-24 right-4 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="absolute bottom-16 right-0 w-[320px] max-h-[450px] bg-[#1a1625]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                    <SiDigitalocean className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black text-white uppercase tracking-widest">AI Concierge</div>
                    <div className="text-[8px] text-green-400 flex items-center gap-1">
                      <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" /> 
                      Online Support
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-white/40 hover:text-white transition-colors">
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide min-h-[300px]">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-primary text-white rounded-tr-none shadow-lg' 
                        : 'bg-white/5 text-white/90 border border-white/10 rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isSendingChat && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/10">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white/5 border-t border-white/10 flex gap-2">
                <input 
                  type="text"
                  placeholder="Ask anything..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white focus:outline-none focus:border-primary/50"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                />
                <button 
                  onClick={handleSendChat}
                  disabled={!chatMessage.trim() || isSendingChat}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center transition-transform active:scale-90 disabled:opacity-50"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
            isChatOpen ? 'bg-white text-black rotate-90' : 'bg-primary text-white shadow-primary/30'
          }`}
        >
          {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-7 h-7" />}
        </motion.button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center flex-1 py-1 transition-all duration-500 overflow-hidden ${active ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
    >
      <motion.div
        animate={{ 
          y: active ? -2 : 0,
          scale: active ? 1.1 : 1
        }}
        className="z-10"
      >
        {icon}
      </motion.div>
      <span className={`text-[8px] font-black uppercase tracking-widest mt-1 transition-all duration-500 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute inset-0 bg-white/5 rounded-2xl"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </button>
  );
}
