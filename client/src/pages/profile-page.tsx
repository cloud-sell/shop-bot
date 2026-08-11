import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CreditCard, ShoppingBag } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return <div className="text-white text-2xl">Loading profile...</div>;
  }

  const calculateDaysSinceRegistration = () => {
    if (!user?.createdAt) return 0;
    const createdDate = new Date(user.createdAt);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - createdDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatRegistrationDate = () => {
    if (!user?.createdAt) return 'N/A';
    const date = new Date(user.createdAt);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-2xl text-white/60 hover:text-white hover:bg-white/10"
            data-testid="button-back-profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-3xl font-black text-white">👤 Your Profile</h1>
      </div>

      {/* Avatar */}
      <div className="flex justify-center mb-8">
        <div className="h-32 w-32 rounded-full ring-4 ring-purple-500/50 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-600 flex items-center justify-center text-white text-6xl font-black">
          {user?.firstName?.[0] || 'R'}
        </div>
      </div>

      {/* Profile Info */}
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="text-center text-white/60 font-black tracking-widest">
          ➖➖➖➖➖➖➖➖➖➖
        </div>

        <div className="space-y-3">
          <div className="text-lg font-black text-white">🫆 ID: {user?.id || 'N/A'}</div>
          <div className="text-lg font-black text-white">💵 Balance: {(user?.balance || 0) / 100}$</div>
          <div className="text-lg font-black text-white">🛍️ Purchased goods: 0pcs</div>
          <div className="text-lg font-black text-white">🕰 Registration: {formatRegistrationDate()} ({calculateDaysSinceRegistration()} days)</div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-6">
          <Button
            className="rounded-2xl h-12 bg-gradient-to-br from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-black"
            data-testid="button-topup"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Top-up
          </Button>
          <Button
            className="rounded-2xl h-12 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-black"
            data-testid="button-my-purchases"
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            My Purchases
          </Button>
        </div>
      </div>
    </div>
  );
}
