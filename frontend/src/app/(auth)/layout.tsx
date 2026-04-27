import { Bot, Zap, Shield, BarChart3 } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* ═══════ LEFT: Brand Panel (40%) ═══════ */}
      <div className="hidden lg:flex lg:w-[40%] gradient-mesh relative flex-col justify-between p-10 overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-gold/5 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 backdrop-blur-sm">
              <Bot className="h-6 w-6 text-accent" />
            </div>
            <span className="text-2xl font-extrabold text-white tracking-tight">
              ATA
            </span>
          </div>
        </div>

        {/* Tagline + Features */}
        <div className="relative z-10 space-y-8">
          <div>
            <h2
              className="text-3xl font-bold text-white leading-relaxed text-arabic"
              style={{ fontFamily: '"IBM Plex Sans Arabic", sans-serif' }}
            >
              حوّل خدمة عملائك
              <br />
              <span className="text-gold">إلى محرك أرباح</span>
            </h2>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed max-w-sm">
              Autonomous Trade Agent — AI-powered customer service
              automation for Arabic e-commerce merchants.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                icon: Zap,
                title: "AI-Powered Responses",
                desc: "ردود ذكية تلقائية بالعربي على واتساب",
              },
              {
                icon: Shield,
                title: "Multi-Tenant Security",
                desc: "كل براند معزول بالكامل بنظام أمان متقدم",
              },
              {
                icon: BarChart3,
                title: "Real-time Analytics",
                desc: "تحليلات لحظية للطلبات والعملاء",
              },
            ].map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                  <feature.icon className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {feature.title}
                  </p>
                  <p
                    className="text-xs text-slate-400 text-arabic"
                    style={{
                      fontFamily: '"IBM Plex Sans Arabic", sans-serif',
                    }}
                  >
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} ATA Project. All rights reserved.
          </p>
        </div>
      </div>

      {/* ═══════ RIGHT: Form Panel (60%) ═══════ */}
      <div className="flex flex-1 flex-col items-center justify-center bg-navy-light p-6 lg:p-10">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
