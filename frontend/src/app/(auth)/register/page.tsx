import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      {/* Mobile logo */}
      <div className="lg:hidden text-center mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          ATA
        </h1>
        <p className="text-sm text-muted mt-1">Autonomous Trade Agent</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white">إنشاء حساب جديد ✨</h2>
        <p className="text-sm text-muted">
          ابدأ رحلتك مع أتمتة خدمة العملاء الذكية
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}
