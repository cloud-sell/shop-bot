import { User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function ProfileButton({ user }: { user: any }) {
  const [isOpen, setIsOpen] = useState(false);

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
    <>
      <Button
        variant="outline"
        className="w-full justify-start gap-3 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white"
        onClick={() => setIsOpen(true)}
        data-testid="button-profile-open"
      >
        <User className="w-4 h-4" />
        <span>Profile</span>
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative bg-white text-black rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-black">👤 Your profile</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-black">
              <div className="text-center text-gray-400 font-black tracking-widest text-sm">
                ➖➖➖➖➖➖➖➖➖➖
              </div>

              <div className="space-y-2 text-sm font-black">
                <div>🫆 ID: {user?.id || 'N/A'}</div>
                <div>💵 Balance: {(user?.balance || 0) / 100}$</div>
                <div>🛍️ Purchased goods: 0pcs</div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="w-full mt-4 bg-blue-500 text-white font-black py-2 rounded-lg hover:bg-blue-600"
              >
                💳 Topup Balance
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
