import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SupportButtonProps {
  onOpen?: () => void;
}

export function SupportButton({ onOpen }: SupportButtonProps) {
  return (
    <Button
      variant="outline"
      className="w-full justify-start gap-3 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 text-white"
      onClick={onOpen}
      data-testid="button-support-open"
    >
      <MessageCircle className="w-4 h-4" />
      <span>AI Support</span>
    </Button>
  );
}

