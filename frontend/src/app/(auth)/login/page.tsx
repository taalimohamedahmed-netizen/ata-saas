import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="space-y-6">
      {/* Mobile logo (hidden on desktop since brand panel shows it) */}
      <div className="lg:hidden text-center mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          ATA
        </h1>
        <p className="text-sm text-muted mt-1">Autonomous Trade Agent</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">مرحباً بعودتك 👋</h2>
        <p className="text-sm text-muted">
          سجّل دخولك للوصول إلى لوحة التحكم
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
