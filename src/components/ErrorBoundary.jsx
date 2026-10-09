import React from "react";
import { reportError } from "@/lib/errorReporter";

// If part of the app crashes, show a friendly screen with a Reload button
// (instead of a blank page) and report the crash.
export default class ErrorBoundary extends React.Component {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    if (info?.componentStack && error) error.stack = `${error.stack || ""}\n${info.componentStack}`.slice(0, 2000);
    reportError(error, "crash");
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] p-6 text-center text-gray-100">
        <div className="max-w-xs">
          <p className="mb-2 text-4xl">😵</p>
          <h1 className="mb-1 text-lg font-black">Something went wrong</h1>
          <p className="mb-4 text-sm text-gray-400">We've been told about it. Reloading usually fixes it.</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-6 py-2.5 text-sm font-black text-black"
          >
            Reload Pixsup
          </button>
        </div>
      </div>
    );
  }
}
