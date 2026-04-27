"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginUser } from "@/lib/auth";
import { useAuthStore } from "@/store/auth-store";

const loginSchema = z.object({
  email: z.string().email("يرجى إدخال بريد إلكتروني صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  remember: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const res = await loginUser(data.email, data.password);
      setAuth(res.access_token, String(res.tenant_id), res.name);
      toast.success("تم تسجيل الدخول بنجاح! 🎉");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.";
      setServerError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Server Error */}
      <AnimatePresence>
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-red-300"
          >
            {serverError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            id="email"
            type="email"
            placeholder="name@company.com"
            className="pl-10"
            error={!!errors.email}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-danger"
          >
            {errors.email.message}
          </motion.p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor="password">كلمة المرور</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            className="pl-10 pr-10"
            error={!!errors.password}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-danger"
          >
            {errors.password.message}
          </motion.p>
        )}
      </div>

      {/* Remember me */}
      <div className="flex items-center gap-2">
        <input
          id="remember"
          type="checkbox"
          className="h-4 w-4 rounded border-border bg-navy-light text-accent focus:ring-accent/50"
          {...register("remember")}
        />
        <label htmlFor="remember" className="text-sm text-muted cursor-pointer">
          تذكرني
        </label>
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" size="lg" loading={isLoading}>
        تسجيل الدخول
      </Button>

      {/* Register link */}
      <p className="text-center text-sm text-muted">
        ليس لديك حساب؟{" "}
        <Link
          href="/register"
          className="text-accent hover:text-accent-hover font-medium transition-colors"
        >
          سجّل الآن
        </Link>
      </p>
    </form>
  );
}
