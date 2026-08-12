import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught Error Boundary caught:", error, errorInfo);
    const msg = error?.message || "";
    if (
      msg.includes("text/html") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("dynamically imported module") ||
      msg.includes("Loading chunk")
    ) {
      const reloaded = sessionStorage.getItem("chunk_auto_reload");
      if (!reloaded) {
        sessionStorage.setItem("chunk_auto_reload", "true");
        window.location.reload();
      }
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-3xl border border-purple-500/20 bg-[#130d24] text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Something went wrong</h2>
            <p className="text-xs text-white/50 leading-relaxed font-mono bg-black/40 p-3 rounded-xl overflow-x-auto">
              {this.state.error?.message || "An unexpected error occurred while loading this page."}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-xl h-11 px-6 font-bold text-xs"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
