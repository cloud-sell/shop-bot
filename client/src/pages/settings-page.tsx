import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bot, Save, Loader2, Sparkles, Lock, Megaphone } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [extraInstructionsText, setExtraInstructionsText] = useState("");
  const [broadcastToken, setBroadcastToken] = useState("");
  const [supportContact, setSupportContact] = useState("");
  const [cryptomusApiKey, setCryptomusApiKey] = useState("");
  const [cryptomusMerchantId, setCryptomusMerchantId] = useState("");
  const [binanceApiKey, setBinanceApiKey] = useState("");
  const [binanceSecretKey, setBinanceSecretKey] = useState("");
  const [binancePayId, setBinancePayId] = useState("");
  const [faqText, setFaqText] = useState("");
  const [howToBuyVideo, setHowToBuyVideo] = useState("");
  const [howToDepositVideo, setHowToDepositVideo] = useState("");
  const [storeName, setStoreName] = useState("");
  const [supportUsername, setSupportUsername] = useState("");
  const [supportBtnText, setSupportBtnText] = useState("");
  const [loadingText, setLoadingText] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [vapidPublicKey, setVapidPublicKey] = useState("");
  const [vapidPrivateKey, setVapidPrivateKey] = useState("");
  const [vapidSubject, setVapidSubject] = useState("");

  const { data: setting, isLoading: isTokenLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/TELEGRAM_BOT_TOKEN"],
  });

  const { data: geminiSetting, isLoading: isGeminiLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/GEMINI_API_KEY"],
  });

  const { data: extraInstructionsSetting, isLoading: isExtraInstructionsLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/EXTRA_INSTRUCTIONS"],
  });

  const { data: broadcastSetting, isLoading: isBroadcastLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/BROADCAST_BOT_TOKEN"],
  });

  const { data: supportSetting, isLoading: isSupportLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/SUPPORT_CONTACT"],
  });

  const { data: cryptomusSetting, isLoading: isCryptomusLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/CRYPTOMUS_API_KEY"],
  });

  const { data: merchantSetting, isLoading: isMerchantLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/CRYPTOMUS_MERCHANT_ID"],
  });

  const { data: binanceSetting, isLoading: isBinanceLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/BINANCE_PAY_ID"],
  });

  const { data: binanceApiSetting, isLoading: isBinanceApiLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/BINANCE_API_KEY"],
  });

  const { data: binanceSecretSetting, isLoading: isBinanceSecretLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/BINANCE_SECRET_KEY"],
  });

  const { data: faqSetting, isLoading: isFaqLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/faq_content"],
  });

  const { data: howToBuySetting, isLoading: isHowToBuyLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/TUTORIAL_BUY_VIDEO"],
  });

  const { data: howToDepositSetting, isLoading: isHowToDepositLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/TUTORIAL_DEPOSIT_VIDEO"],
  });

  const { data: binanceEnabledSetting, isLoading: isBinanceEnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/PAYMENT_BINANCE_ENABLED"],
  });

  const { data: cryptomusEnabledSetting, isLoading: isCryptomusEnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/PAYMENT_CRYPTOMUS_ENABLED"],
  });

  const { data: trc20EnabledSetting, isLoading: isTrc20EnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/PAYMENT_TRC20_ENABLED"],
  });

  const { data: aptosEnabledSetting, isLoading: isAptosEnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/PAYMENT_APTOS_ENABLED"],
  });

  const { data: trc20WalletSetting, isLoading: isTrc20WalletLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/TRC20_WALLET_ADDRESS"],
  });

  const { data: aptosWalletSetting, isLoading: isAptosWalletLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/APTOS_WALLET_ADDRESS"],
  });

  const { data: trc20VerificationModeSetting, isLoading: isTrc20VerificationModeLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/TRC20_VERIFICATION_MODE"],
  });

  const { data: aptosVerificationModeSetting, isLoading: isAptosVerificationModeLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/APTOS_VERIFICATION_MODE"],
  });

  const { data: automationEnabledSetting, isLoading: isAutomationEnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/AUTOMATION_ENABLED"],
  });

  const { data: specialOffersEnabledSetting, isLoading: isSpecialOffersEnabledLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/SPECIAL_OFFERS_ENABLED"],
  });

  const { data: storeNameSetting, isLoading: isStoreNameLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/STORE_NAME"],
  });

  const { data: supportUsernameSetting, isLoading: isSupportUsernameLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/SUPPORT_USERNAME"],
  });

  const { data: supportBtnTextSetting, isLoading: isSupportBtnTextLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/SUPPORT_BTN_TEXT"],
  });

  const { data: loadingTextSetting, isLoading: isLoadingTextLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/LOADING_TEXT"],
  });

  const { data: vapidPublicSetting, isLoading: isVapidPublicLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/VAPID_PUBLIC_KEY"],
  });

  const { data: vapidPrivateSetting, isLoading: isVapidPrivateLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/VAPID_PRIVATE_KEY"],
  });

  const { data: vapidSubjectSetting, isLoading: isVapidSubjectLoading } = useQuery<{ key: string, value: string }>({
    queryKey: ["/api/settings/VAPID_SUBJECT"],
  });

  const isLoading = isTokenLoading || isBroadcastLoading || isSupportLoading || isCryptomusLoading ||
    isMerchantLoading || isBinanceLoading || isBinanceApiLoading || isBinanceSecretLoading ||
    isFaqLoading || isHowToBuyLoading || isHowToDepositLoading || isBinanceEnabledLoading ||
    isCryptomusEnabledLoading || isAutomationEnabledLoading ||
    isSpecialOffersEnabledLoading || isStoreNameLoading || isSupportUsernameLoading ||
    isSupportBtnTextLoading || isLoadingTextLoading ||
    isTrc20EnabledLoading || isAptosEnabledLoading || isTrc20WalletLoading || isAptosWalletLoading ||
    isTrc20VerificationModeLoading || isAptosVerificationModeLoading || isGeminiLoading ||
    isExtraInstructionsLoading || isVapidPublicLoading || isVapidPrivateLoading || isVapidSubjectLoading;

  const [binanceEnabled, setBinanceEnabled] = useState(true);
  const [cryptomusEnabled, setCryptomusEnabled] = useState(true);
  const [trc20Enabled, setTrc20Enabled] = useState(false);
  const [aptosEnabled, setAptosEnabled] = useState(false);
  const [trc20Wallet, setTrc20Wallet] = useState("");
  const [aptosWallet, setAptosWallet] = useState("");
  const [trc20VerificationMode, setTrc20VerificationMode] = useState("binance");
  const [aptosVerificationMode, setAptosVerificationMode] = useState("binance");
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [specialOffersEnabled, setSpecialOffersEnabled] = useState(true);

  useEffect(() => {
    if (binanceEnabledSetting?.value !== undefined) setBinanceEnabled(binanceEnabledSetting.value === "true");
  }, [binanceEnabledSetting]);

  useEffect(() => {
    if (cryptomusEnabledSetting?.value !== undefined) setCryptomusEnabled(cryptomusEnabledSetting.value === "true");
  }, [cryptomusEnabledSetting]);

  useEffect(() => {
    if (trc20EnabledSetting?.value !== undefined) setTrc20Enabled(trc20EnabledSetting.value === "true");
  }, [trc20EnabledSetting]);

  useEffect(() => {
    if (aptosEnabledSetting?.value !== undefined) setAptosEnabled(aptosEnabledSetting.value === "true");
  }, [aptosEnabledSetting]);

  useEffect(() => {
    if (trc20WalletSetting?.value !== undefined) setTrc20Wallet(trc20WalletSetting.value);
  }, [trc20WalletSetting]);

  useEffect(() => {
    if (aptosWalletSetting?.value !== undefined) setAptosWallet(aptosWalletSetting.value);
  }, [aptosWalletSetting]);

  useEffect(() => {
    if (trc20VerificationModeSetting?.value !== undefined) setTrc20VerificationMode(trc20VerificationModeSetting.value || "binance");
  }, [trc20VerificationModeSetting]);

  useEffect(() => {
    if (aptosVerificationModeSetting?.value !== undefined) setAptosVerificationMode(aptosVerificationModeSetting.value || "binance");
  }, [aptosVerificationModeSetting]);

  useEffect(() => {
    if (automationEnabledSetting?.value !== undefined) setAutomationEnabled(automationEnabledSetting.value === "true");
  }, [automationEnabledSetting]);

  useEffect(() => {
    if (specialOffersEnabledSetting?.value !== undefined) setSpecialOffersEnabled(specialOffersEnabledSetting.value !== "false");
  }, [specialOffersEnabledSetting]);

  useEffect(() => {
    if (setting?.value !== undefined) setToken(setting.value);
  }, [setting]);

  useEffect(() => {
    if (geminiSetting?.value !== undefined) setGeminiApiKey(geminiSetting.value);
  }, [geminiSetting]);

  useEffect(() => {
    if (extraInstructionsSetting?.value !== undefined) setExtraInstructionsText(extraInstructionsSetting.value);
  }, [extraInstructionsSetting]);

  useEffect(() => {
    if (broadcastSetting?.value !== undefined) setBroadcastToken(broadcastSetting.value);
  }, [broadcastSetting]);

  useEffect(() => {
    if (supportSetting?.value !== undefined) setSupportContact(supportSetting.value);
  }, [supportSetting]);

  useEffect(() => {
    if (cryptomusSetting?.value !== undefined) setCryptomusApiKey(cryptomusSetting.value);
  }, [cryptomusSetting]);

  useEffect(() => {
    if (merchantSetting?.value !== undefined) setCryptomusMerchantId(merchantSetting.value);
  }, [merchantSetting]);

  useEffect(() => {
    if (binanceSetting?.value !== undefined) setBinancePayId(binanceSetting.value);
  }, [binanceSetting]);

  useEffect(() => {
    if (binanceApiSetting?.value !== undefined) setBinanceApiKey(binanceApiSetting.value);
  }, [binanceApiSetting]);

  useEffect(() => {
    if (binanceSecretSetting?.value !== undefined) setBinanceSecretKey(binanceSecretSetting.value);
  }, [binanceSecretSetting]);

  useEffect(() => {
    if (faqSetting?.value !== undefined) setFaqText(faqSetting.value);
  }, [faqSetting]);

  useEffect(() => {
    if (howToBuySetting?.value !== undefined) setHowToBuyVideo(howToBuySetting.value);
  }, [howToBuySetting]);

  useEffect(() => {
    if (howToDepositSetting?.value !== undefined) setHowToDepositVideo(howToDepositSetting.value);
  }, [howToDepositSetting]);

  useEffect(() => {
    if (storeNameSetting?.value !== undefined) setStoreName(storeNameSetting.value);
  }, [storeNameSetting]);

  useEffect(() => {
    if (supportUsernameSetting?.value !== undefined) setSupportUsername(supportUsernameSetting.value);
  }, [supportUsernameSetting]);

  useEffect(() => {
    if (supportBtnTextSetting?.value !== undefined) setSupportBtnText(supportBtnTextSetting.value);
  }, [supportBtnTextSetting]);

  useEffect(() => {
    if (loadingTextSetting?.value !== undefined) setLoadingText(loadingTextSetting.value);
  }, [loadingTextSetting]);

  useEffect(() => {
    if (vapidPublicSetting?.value !== undefined) setVapidPublicKey(vapidPublicSetting.value);
  }, [vapidPublicSetting]);

  useEffect(() => {
    if (vapidPrivateSetting?.value !== undefined) setVapidPrivateKey(vapidPrivateSetting.value);
  }, [vapidPrivateSetting]);

  useEffect(() => {
    if (vapidSubjectSetting?.value !== undefined) setVapidSubject(vapidSubjectSetting.value);
  }, [vapidSubjectSetting]);

  const mutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "TELEGRAM_BOT_TOKEN",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/TELEGRAM_BOT_TOKEN"] });
      toast({
        title: "Settings Updated",
        description: "Telegram Bot has been re-initialized with the new token.",
      });
    }
  });

  const broadcastMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "BROADCAST_BOT_TOKEN",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/BROADCAST_BOT_TOKEN"] });
      toast({
        title: "Broadcast Bot Updated",
        description: "Separate broadcast bot token has been saved.",
      });
    }
  });

  const geminiMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "GEMINI_API_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/GEMINI_API_KEY"] });
      toast({
        title: "Gemini API Key Updated",
        description: "Live support chat bot is now using the updated Gemini API key.",
      });
    }
  });

  const extraInstructionsMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "EXTRA_INSTRUCTIONS",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/EXTRA_INSTRUCTIONS"] });
      toast({
        title: "Extra Instructions Updated",
        description: "Extra instructions & rules have been updated.",
      });
    }
  });

  const supportMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "SUPPORT_CONTACT",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/SUPPORT_CONTACT"] });
      toast({
        title: "Support Contact Updated",
        description: "Support contact has been updated.",
      });
    }
  });

  const cryptomusMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "CRYPTOMUS_API_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/CRYPTOMUS_API_KEY"] });
      toast({
        title: "Cryptomus API Key Updated",
        description: "Cryptomus integration is now ready to process payments.",
      });
    }
  });

  const cryptomusMerchantMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "CRYPTOMUS_MERCHANT_ID",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/CRYPTOMUS_MERCHANT_ID"] });
      toast({
        title: "Cryptomus Merchant ID Updated",
        description: "Merchant ID has been saved.",
      });
    }
  });

  const binancePayMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "BINANCE_PAY_ID",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/BINANCE_PAY_ID"] });
      toast({
        title: "Binance Pay ID Updated",
        description: "Binance Pay ID has been saved.",
      });
    }
  });

  const binanceApiKeyMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "BINANCE_API_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/BINANCE_API_KEY"] });
      toast({
        title: "Binance API Key Updated",
        description: "Binance API Key has been saved.",
      });
    }
  });

  const binanceSecretKeyMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "BINANCE_SECRET_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/BINANCE_SECRET_KEY"] });
      toast({
        title: "Binance Secret Key Updated",
        description: "Binance Secret Key has been saved.",
      });
    }
  });

  const trc20WalletMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "TRC20_WALLET_ADDRESS",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/TRC20_WALLET_ADDRESS"] });
      toast({
        title: "TRC20 Wallet Updated",
        description: "TRC20 wallet address has been updated.",
      });
    }
  });

  const aptosWalletMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "APTOS_WALLET_ADDRESS",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/APTOS_WALLET_ADDRESS"] });
      toast({
        title: "Aptos Wallet Updated",
        description: "Aptos wallet address has been updated.",
      });
    }
  });

  const trc20VerificationModeMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "TRC20_VERIFICATION_MODE",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/TRC20_VERIFICATION_MODE"] });
      toast({
        title: "TRC20 Verification Mode Updated",
        description: "TRC20 payment verification mode has been updated.",
      });
    }
  });

  const aptosVerificationModeMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "APTOS_VERIFICATION_MODE",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/APTOS_VERIFICATION_MODE"] });
      toast({
        title: "Aptos Verification Mode Updated",
        description: "Aptos payment verification mode has been updated.",
      });
    }
  });

  const faqMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "faq_content",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/faq_content"] });
      toast({
        title: "FAQ Updated",
        description: "FAQ content has been updated for all users.",
      });
    }
  });

  const tutorialBuyMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "TUTORIAL_BUY_VIDEO",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/TUTORIAL_BUY_VIDEO"] });
      toast({
        title: "Tutorial Updated",
        description: "How to buy video URL has been updated.",
      });
    }
  });

  const tutorialDepositMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "TUTORIAL_DEPOSIT_VIDEO",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/TUTORIAL_DEPOSIT_VIDEO"] });
      toast({
        title: "Tutorial Updated",
        description: "How to deposit video URL has been updated.",
      });
    }
  });

  const brandingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string, value: string }) => {
      const res = await apiRequest("POST", "/api/settings", { key, value });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/settings/${variables.key}`] });
      toast({
        title: "Branding Updated",
        description: `${variables.key.replace("_", " ").toLowerCase()} has been updated.`,
      });
    }
  });

  const togglePaymentMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string, value: string }) => {
      const res = await apiRequest("POST", "/api/settings", { key, value });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/settings/${variables.key}`] });
      toast({
        title: "Setting Updated",
        description: `${variables.key.replace("PAYMENT_", "").replace("_ENABLED", "").toLowerCase()} ${variables.value === "true" ? "enabled" : "disabled"}.`,
      });
    }
  });

  const adminCredentialsMutation = useMutation({
    mutationFn: async (data: { newEmail: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/admin/credentials", data);
      return res.json();
    },
    onSuccess: () => {
      setAdminPassword("");
      toast({
        title: "Admin Credentials Updated",
        description: "Your login email and password have been updated successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update admin credentials.",
        variant: "destructive",
      });
    }
  });

  const vapidPublicKeyMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "VAPID_PUBLIC_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/VAPID_PUBLIC_KEY"] });
      toast({
        title: "VAPID Public Key Updated",
        description: "Browser push notification credentials updated successfully.",
      });
    }
  });

  const vapidPrivateKeyMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "VAPID_PRIVATE_KEY",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/VAPID_PRIVATE_KEY"] });
      toast({
        title: "VAPID Private Key Updated",
        description: "Browser push notification credentials updated successfully.",
      });
    }
  });

  const vapidSubjectMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/settings", {
        key: "VAPID_SUBJECT",
        value
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/VAPID_SUBJECT"] });
      toast({
        title: "VAPID Subject Email Updated",
        description: "Browser push notification contact email updated successfully.",
      });
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in">
      <div className="flex items-center justify-between">
        <h1 className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
          Settings
        </h1>
        <div className="glass-panel px-6 py-2.5 rounded-full flex items-center gap-3 text-sm font-bold text-white shadow-lg border-white/20">
          <Bot className="w-5 h-5 text-purple-400" />
          Bot Configuration
        </div>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              Telegram Integration
            </CardTitle>
            <CardDescription className="text-white/60">
              Configure your Telegram Bot token here. Changes are applied instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="token" className="text-sm font-bold text-white/70 uppercase tracking-widest">Bot Token</Label>
              <div className="flex gap-3">
                <Input
                  id="token"
                  type="password"
                  placeholder="Paste your bot token here..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <Button
                  onClick={() => mutation.mutate(token)}
                  disabled={mutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 font-bold"
                >
                  {mutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-xs text-white/40">
                You can get this token from <a href="https://t.me/botfather" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">@BotFather</a>
              </p>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              <Label htmlFor="broadcast-token" className="text-sm font-bold text-white/70 uppercase tracking-widest">Broadcast Bot Token (Optional)</Label>
              <div className="flex gap-3">
                <Input
                  id="broadcast-token"
                  type="password"
                  placeholder="Separate token for broadcasting..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={broadcastToken}
                  onChange={(e) => setBroadcastToken(e.target.value)}
                />
                <Button
                  onClick={() => broadcastMutation.mutate(broadcastToken)}
                  disabled={broadcastMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {broadcastMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-xs text-white/40">
                If provided, this bot will be used for sending broadcasts instead of the main bot.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-400" />
              AI Support Assistant (Gemini)
            </CardTitle>
            <CardDescription className="text-white/60">
              Configure your Google AI Studio Gemini API Key to power the live support chat bot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="geminiApiKey" className="text-sm font-bold text-white/70 uppercase tracking-widest">Gemini API Key</Label>
              <div className="flex gap-3">
                <Input
                  id="geminiApiKey"
                  type="password"
                  placeholder="Paste your Gemini API Key here..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                />
                <Button
                  onClick={() => geminiMutation.mutate(geminiApiKey)}
                  disabled={geminiMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 font-bold"
                >
                  {geminiMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-xs text-white/40">
                Get your API key from the <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">Google AI Studio Dashboard</a>.
              </p>
            </div>

            <div className="h-px bg-white/5 my-6" />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Extra Instructions & Rules</Label>
                <CardDescription className="text-white/40">
                  Upload a text file (.txt) or write custom guidelines to guide the AI chatbot's behavior.
                </CardDescription>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept=".txt"
                    className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all cursor-pointer file:bg-purple-600/30 file:text-white file:border-0 file:h-full file:px-4 file:-ml-3 file:mr-3 file:hover:bg-purple-600/50 file:transition-all"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const text = event.target?.result as string;
                        if (text !== undefined) {
                          setExtraInstructionsText(text);
                          toast({
                            title: "File Loaded",
                            description: `Successfully loaded content from "${file.name}". Click 'Save Instructions & Rules' below to apply.`,
                          });
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>

                <Textarea
                  placeholder="Enter extra instructions, store guidelines, custom product rules, or restrictions for the AI bot..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white min-h-[150px] rounded-xl focus:border-purple-500/50 transition-all"
                  value={extraInstructionsText}
                  onChange={(e) => setExtraInstructionsText(e.target.value)}
                />

                <Button
                  onClick={() => extraInstructionsMutation.mutate(extraInstructionsText)}
                  disabled={extraInstructionsMutation.isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 font-bold"
                >
                  {extraInstructionsMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <Save className="w-5 h-5 mr-2" />
                  )}
                  Save Instructions & Rules
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
              <CardTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
                <Lock className="w-6 h-6 text-purple-400" />
                Admin Login Credentials
              </CardTitle>
              <CardDescription className="text-white/40">
                Update the email and password used to access this dashboard.
              </CardDescription>
            </div>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">New Login Email</Label>
              <Input
                type="email"
                placeholder="Enter new admin email..."
                className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">New Login Password</Label>
              <Input
                type="password"
                placeholder="Enter new admin password..."
                className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>

            <Button
              onClick={() => adminCredentialsMutation.mutate({ newEmail: adminEmail, newPassword: adminPassword })}
              disabled={adminCredentialsMutation.isPending || !adminEmail || !adminPassword}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 font-bold"
            >
              {adminCredentialsMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
              Update Credentials
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
              <CardTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
                ⚙️ Advanced
              </CardTitle>
              <CardDescription className="text-white/40">
                Configure advanced bot settings.
              </CardDescription>
            </div>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 glass-panel rounded-xl border-white/5">
              <div className="space-y-0.5">
                <Label className="text-white font-bold">Automation Feature</Label>
                <p className="text-xs text-white/40">Enable or disable DigitalOcean automation for users</p>
              </div>
              <Button
                variant={automationEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newValue = !automationEnabled;
                  setAutomationEnabled(newValue);
                  togglePaymentMutation.mutate({ key: "AUTOMATION_ENABLED", value: newValue.toString() });
                }}
                className={automationEnabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
              >
                {automationEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 glass-panel rounded-xl border-white/5">
              <div className="space-y-0.5">
                <Label className="text-white font-bold">Special Offers Feature</Label>
                <p className="text-xs text-white/40">Enable or disable the Special Offers menu in the bot</p>
              </div>
              <Button
                variant={specialOffersEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newValue = !specialOffersEnabled;
                  setSpecialOffersEnabled(newValue);
                  togglePaymentMutation.mutate({ key: "SPECIAL_OFFERS_ENABLED", value: newValue.toString() });
                }}
                className={specialOffersEnabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
              >
                {specialOffersEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>

            <div className="space-y-2 pt-6 border-t border-white/5">
              <Label htmlFor="support" className="text-sm font-bold text-white/70 uppercase tracking-widest">Support Contact Username</Label>
              <div className="flex gap-3">
                <Input
                  id="support"
                  type="text"
                  placeholder="e.g. @rochana_imesh"
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={supportContact}
                  onChange={(e) => setSupportContact(e.target.value)}
                />
                <Button
                  onClick={() => supportMutation.mutate(supportContact)}
                  disabled={supportMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 font-bold"
                >
                  {supportMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
              <p className="text-xs text-white/40">
                The username that will be shown when users click Support in the bot.
              </p>
            </div>

            <div className="space-y-2 pt-6 border-t border-white/5">
              <Label htmlFor="faq" className="text-sm font-bold text-white/70 uppercase tracking-widest">FAQ Content</Label>
              <div className="space-y-3">
                <Textarea
                  id="faq"
                  placeholder="Enter FAQ content..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white min-h-[150px] rounded-xl focus:border-purple-500/50 transition-all"
                  value={faqText}
                  onChange={(e) => setFaqText(e.target.value)}
                />
                <Button
                  onClick={() => faqMutation.mutate(faqText)}
                  disabled={faqMutation.isPending}
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {faqMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update FAQ Content"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
              <CardTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-purple-400" />
                Branding & Customization
              </CardTitle>
              <CardDescription className="text-white/40">
                Personalize your store and support contact information.
              </CardDescription>
            </div>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Store Name</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. Shopeefy Cloud Store"
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                />
                <Button
                  onClick={() => brandingMutation.mutate({ key: "STORE_NAME", value: storeName })}
                  disabled={brandingMutation.isPending}
                  className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {brandingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Support Username (Link)</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. @rochana_imesh"
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={supportUsername}
                  onChange={(e) => setSupportUsername(e.target.value)}
                />
                <Button
                  onClick={() => brandingMutation.mutate({ key: "SUPPORT_USERNAME", value: supportUsername })}
                  disabled={brandingMutation.isPending}
                  className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {brandingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Support Button Text</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. Write to Support"
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={supportBtnText}
                  onChange={(e) => setSupportBtnText(e.target.value)}
                />
                <Button
                  onClick={() => brandingMutation.mutate({ key: "SUPPORT_BTN_TEXT", value: supportBtnText })}
                  disabled={brandingMutation.isPending}
                  className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {brandingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t border-white/5">
              <Label className="text-sm font-bold text-white/70 uppercase tracking-widest">Loading Animation Text</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. Shopeefy..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={loadingText}
                  onChange={(e) => setLoadingText(e.target.value)}
                />
                <Button
                  onClick={() => brandingMutation.mutate({ key: "LOADING_TEXT", value: loadingText })}
                  disabled={brandingMutation.isPending}
                  className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {brandingMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-purple-400" />
                <p className="text-[10px] text-white/40 uppercase tracking-widest font-black">
                  Developer Credits: <span className="text-purple-400">Rochana Imesh</span> (Immutable)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl">
        <Card className="glass-card border-0">
            <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
              <CardTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-purple-400" />
                Admin Notifications
              </CardTitle>
              <CardDescription className="text-white/40">
                Enable native browser push notifications to receive alerts.
              </CardDescription>
            </div>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 glass-panel rounded-xl border-white/5">
              <div className="space-y-0.5">
                <Label className="text-white font-bold">Browser Push Alerts</Label>
                <p className="text-xs text-white/40">
                  {typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted'
                    ? "Notifications are enabled for this browser."
                    : "Receive instant alerts for new orders and deposits."}
                </p>
              </div>
              <Button
                variant={typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted' ? "default" : "outline"}
                size="sm"
                disabled={typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted'}
                onClick={() => window.dispatchEvent(new CustomEvent('trigger-push-setup'))}
                className={typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted' ? "bg-green-500 hover:bg-green-600" : "border-purple-500/30 text-purple-400 hover:bg-purple-500/10"}
              >
                {typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted' ? "Active" : "Enable Now"}
              </Button>
            </div>

            {typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted' && (
              <div className="pt-4 border-t border-white/5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full glass-panel border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-10 font-bold"
                  onClick={async () => {
                    try {
                      const res = await apiRequest("POST", "/api/admin/test-push", {});
                      if (res.ok) {
                        toast({
                          title: "Test Sent",
                          description: "Check your notification bar!",
                        });
                      }
                    } catch (err) {
                      toast({
                        title: "Failed to send test",
                        description: "Check server logs.",
                        variant: "destructive"
                      });
                    }
                  }}
                >
                  Send Test Notification
                </Button>
              </div>
            )}

            <div className="h-px bg-white/5 my-6" />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-white/70 uppercase tracking-widest font-black">
                  VAPID Subject (Email)
                </Label>
                <CardDescription className="text-white/40">
                  Contact email used to register with push service (e.g., mailto:your-email@example.com)
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="e.g. mailto:your-email@example.com"
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={vapidSubject}
                  onChange={(e) => setVapidSubject(e.target.value)}
                />
                <Button
                  onClick={() => vapidSubjectMutation.mutate(vapidSubject)}
                  disabled={vapidSubjectMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {vapidSubjectMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-white/70 uppercase tracking-widest font-black">
                  VAPID Public Key
                </Label>
                <CardDescription className="text-white/40">
                  Required for client browser to subscribe to push notification service
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="Paste VAPID public key..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={vapidPublicKey}
                  onChange={(e) => setVapidPublicKey(e.target.value)}
                />
                <Button
                  onClick={() => vapidPublicKeyMutation.mutate(vapidPublicKey)}
                  disabled={vapidPublicKeyMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {vapidPublicKeyMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-white/70 uppercase tracking-widest font-black">
                  VAPID Private Key
                </Label>
                <CardDescription className="text-white/40">
                  Keep this secure. Used by server to sign sent push notification payloads
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Input
                  type="password"
                  placeholder="Paste VAPID private key..."
                  className="glass-panel border-white/10 bg-purple-950/20 text-white h-12 rounded-xl focus:border-purple-500/50 transition-all"
                  value={vapidPrivateKey}
                  onChange={(e) => setVapidPrivateKey(e.target.value)}
                />
                <Button
                  onClick={() => vapidPrivateKeyMutation.mutate(vapidPrivateKey)}
                  disabled={vapidPrivateKeyMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  {vapidPrivateKeyMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      <div className="max-w-2xl">
        <Card className="glass-card border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
            <CardTitle className="text-2xl font-bold flex items-center gap-3">
              <Lock className="w-6 h-6 text-purple-400" />
              Payment Gateway
            </CardTitle>
            <CardDescription className="text-white/60">
              Configure your payment provider details and enable/disable payment methods.
            </CardDescription>
          </div>

          <CardContent className="p-8 space-y-12">
            {/* Cryptomus Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-purple-400">Cryptomus Integration</h3>
                <Button
                  variant={cryptomusEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newValue = !cryptomusEnabled;
                    setCryptomusEnabled(newValue);
                    togglePaymentMutation.mutate({ key: "PAYMENT_CRYPTOMUS_ENABLED", value: newValue.toString() });
                  }}
                  className={cryptomusEnabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
                >
                  {cryptomusEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Cryptomus Merchant ID</Label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Paste your Cryptomus Merchant ID"
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={cryptomusMerchantId}
                      onChange={(e) => setCryptomusMerchantId(e.target.value)}
                    />
                    <Button
                      onClick={() => cryptomusMerchantMutation.mutate(cryptomusMerchantId)}
                      disabled={cryptomusMerchantMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">Found in your Cryptomus dashboard settings.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Cryptomus API Key</Label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="Paste your Cryptomus API key"
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={cryptomusApiKey}
                      onChange={(e) => setCryptomusApiKey(e.target.value)}
                    />
                    <Button
                      onClick={() => cryptomusMutation.mutate(cryptomusApiKey)}
                      disabled={cryptomusMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">Get your API key from Cryptomus dashboard. Keep it secure!</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Binance Pay Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-yellow-500">Binance Pay Integration</h3>
                <Button
                  variant={binanceEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newValue = !binanceEnabled;
                    setBinanceEnabled(newValue);
                    togglePaymentMutation.mutate({ key: "PAYMENT_BINANCE_ENABLED", value: newValue.toString() });
                  }}
                  className={binanceEnabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
                >
                  {binanceEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Binance Pay ID</Label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter your Binance Pay ID..."
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={binancePayId}
                      onChange={(e) => setBinancePayId(e.target.value)}
                    />
                    <Button
                      onClick={() => binancePayMutation.mutate(binancePayId)}
                      disabled={binancePayMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">Your Binance Pay ID for manual transfers.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Binance API Key</Label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="Enter Binance API Key..."
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={binanceApiKey}
                      onChange={(e) => setBinanceApiKey(e.target.value)}
                    />
                    <Button
                      onClick={() => binanceApiKeyMutation.mutate(binanceApiKey)}
                      disabled={binanceApiKeyMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Binance Secret Key</Label>
                  <div className="flex gap-3">
                    <Input
                      type="password"
                      placeholder="Enter Binance Secret Key..."
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={binanceSecretKey}
                      onChange={(e) => setBinanceSecretKey(e.target.value)}
                    />
                    <Button
                      onClick={() => binanceSecretKeyMutation.mutate(binanceSecretKey)}
                      disabled={binanceSecretKeyMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">Required for automated payment verification.</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* TRC20 Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-red-500">TRC20 (USDT) Integration</h3>
                <Button
                  variant={trc20Enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newValue = !trc20Enabled;
                    setTrc20Enabled(newValue);
                    togglePaymentMutation.mutate({ key: "PAYMENT_TRC20_ENABLED", value: newValue.toString() });
                  }}
                  className={trc20Enabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
                >
                  {trc20Enabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">TRC20 Wallet Address</Label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter TRC20 USDT Wallet Address..."
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={trc20Wallet}
                      onChange={(e) => setTrc20Wallet(e.target.value)}
                    />
                    <Button
                      onClick={() => trc20WalletMutation.mutate(trc20Wallet)}
                      disabled={trc20WalletMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-red-500 to-red-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">USDT (TRC20) deposit address on the Tron network.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Verification Mode</Label>
                  <select
                    className="w-full glass-panel border-white/10 bg-purple-950/20 text-white h-12 px-3 rounded-xl focus:border-red-500/50 transition-all outline-none"
                    value={trc20VerificationMode}
                    onChange={(e) => {
                      setTrc20VerificationMode(e.target.value);
                      trc20VerificationModeMutation.mutate(e.target.value);
                    }}
                  >
                    <option value="binance" className="bg-purple-950 text-white">Binance API Keys (Deposit History)</option>
                    <option value="blockchain" className="bg-purple-950 text-white">Blockchain Network (TronScan)</option>
                  </select>
                  <p className="text-[10px] text-white/40">Select the service to use for payment verification.</p>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* Aptos Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-cyan-500">Aptos (USDT) Integration</h3>
                <Button
                  variant={aptosEnabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    const newValue = !aptosEnabled;
                    setAptosEnabled(newValue);
                    togglePaymentMutation.mutate({ key: "PAYMENT_APTOS_ENABLED", value: newValue.toString() });
                  }}
                  className={aptosEnabled ? "bg-green-500 hover:bg-green-600" : "border-white/20"}
                >
                  {aptosEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Aptos Wallet Address</Label>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Enter Aptos USDT Wallet Address..."
                      className="glass-panel border-white/10 bg-white/5 text-white h-12"
                      value={aptosWallet}
                      onChange={(e) => setAptosWallet(e.target.value)}
                    />
                    <Button
                      onClick={() => aptosWalletMutation.mutate(aptosWallet)}
                      disabled={aptosWalletMutation.isPending}
                      className="h-12 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 font-bold"
                    >
                      <Save className="w-5 h-5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-white/40">USDT (Aptos) deposit address on the Aptos network.</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-white/50 uppercase tracking-widest">Verification Mode</Label>
                  <select
                    className="w-full glass-panel border-white/10 bg-purple-950/20 text-white h-12 px-3 rounded-xl focus:border-cyan-500/50 transition-all outline-none"
                    value={aptosVerificationMode}
                    onChange={(e) => {
                      setAptosVerificationMode(e.target.value);
                      aptosVerificationModeMutation.mutate(e.target.value);
                    }}
                  >
                    <option value="binance" className="bg-purple-950 text-white">Binance API Keys (Deposit History)</option>
                    <option value="blockchain" className="bg-purple-950 text-white">Blockchain Network (Aptos Fullnode)</option>
                  </select>
                  <p className="text-[10px] text-white/40">Select the service to use for payment verification.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-2xl pb-20">
        <Card className="glass-card border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 p-6 border-b border-white/10">
            <CardTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
              🎬 Tutorial Videos
            </CardTitle>
            <CardDescription className="text-white/40">
              Configure tutorial video links for the bot.
            </CardDescription>
          </div>
          <CardContent className="space-y-8 pt-6">
            <div className="space-y-4">
              <Label className="text-sm font-bold text-white/70">How to Buy Product</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="Video URL..."
                  className="glass-panel border-white/10 bg-white/5 text-white h-12"
                  value={howToBuyVideo}
                  onChange={(e) => setHowToBuyVideo(e.target.value)}
                />
                <Button
                  onClick={() => tutorialBuyMutation.mutate(howToBuyVideo)}
                  disabled={tutorialBuyMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  <Save className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-white/5">
              <Label className="text-sm font-bold text-white/70">How to Deposit Balance</Label>
              <div className="flex gap-3">
                <Input
                  placeholder="Video URL..."
                  className="glass-panel border-white/10 bg-white/5 text-white h-12"
                  value={howToDepositVideo}
                  onChange={(e) => setHowToDepositVideo(e.target.value)}
                />
                <Button
                  onClick={() => tutorialDepositMutation.mutate(howToDepositVideo)}
                  disabled={tutorialDepositMutation.isPending}
                  className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 font-bold"
                >
                  <Save className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
