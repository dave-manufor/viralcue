import { SignIn } from "@clerk/nextjs";
import { Zap } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
          <Zap className="h-6 w-6 text-white" />
        </div>
        <span className="text-2xl font-bold text-zinc-900">ViralCue</span>
      </div>

      {/* Clerk Sign In */}
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
        routing="path"
        path="/login"
        signUpUrl="/sign-up"
        forceRedirectUrl="/"
      />

      <p className="text-sm text-zinc-400 text-center mt-6">
        Real-time AI co-pilot for live streamers
      </p>
    </div>
  );
}
