import { Component } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 bg-background items-center justify-center px-6">
          <Icon icon={AlertTriangle} size={48} color="#ef4444" />
          <Text className="text-zinc-100 text-lg font-bold mt-4 text-center">
            {this.props.fallbackTitle ?? "Something went wrong"}
          </Text>
          <Text className="text-zinc-500 text-sm text-center mt-2 mb-6">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </Text>
          <Pressable
            onPress={this.handleReset}
            className="bg-primary px-6 py-3 rounded-xl active:opacity-80"
          >
            <Text className="text-white font-semibold">Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Boundary for invisible root-level components (notification watchers, config
 * sync bridges). Renders nothing on failure so a single misbehaving hook can't
 * unmount the whole app and trap the user on the fallback screen.
 */
export class SilentErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `SilentErrorBoundary[${this.props.label ?? "unknown"}] caught:`,
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/**
 * Lightweight error boundary for individual cards/sections.
 * Shows a minimal inline error instead of crashing the whole screen.
 */
export class CardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CardErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View className="bg-surface rounded-2xl p-4 border border-border items-center py-6">
          <Icon icon={AlertTriangle} size={20} color="#71717a" />
          <Text className="text-zinc-500 text-sm mt-2">Failed to load</Text>
          <Pressable
            onPress={() => this.setState({ hasError: false })}
            className="mt-2"
          >
            <Text className="text-primary text-xs">Retry</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
