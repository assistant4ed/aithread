import { signIn } from "@/auth"

export default function LoginPage() {
    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-accent/5 via-background to-background">
            <div className="w-full max-w-md space-y-8 text-center bg-surface border border-border/50 p-10 rounded-2xl shadow-xl backdrop-blur-sm animate-fade-in">
                <div className="space-y-2">
                    <div className="mx-auto w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                        <span className="w-3 h-3 rounded-full bg-accent animate-pulse-dot" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Threads Monitor
                    </h1>
                    <p className="text-muted text-sm px-4">
                        Secure access to your content monitoring and publishing Command Center
                    </p>
                </div>

                <div className="space-y-4">
                    <form
                        action={async (formData) => {
                            "use server"
                            const email = formData.get("email") as string
                            const password = formData.get("password") as string
                            await signIn("credentials", { email, password, redirectTo: "/" })
                        }}
                        className="space-y-4 text-left"
                    >
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted/80 ml-1">Email Address</label>
                            <input
                                name="email"
                                type="email"
                                required
                                placeholder="name@example.com"
                                className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-foreground"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted/80 ml-1">Password</label>
                            <input
                                name="password"
                                type="password"
                                required
                                placeholder="••••••••"
                                className="w-full px-4 py-3 bg-surface border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all text-foreground"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full py-3.5 bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl shadow-lg shadow-accent/20 transition-all active:scale-[0.98]"
                        >
                            Sign In
                        </button>
                    </form>

                    <div className="relative flex items-center gap-4 py-2">
                        <div className="h-[1px] flex-1 bg-border/40" />
                        <span className="text-[10px] uppercase tracking-widest text-muted/40 font-bold">OR</span>
                        <div className="h-[1px] flex-1 bg-border/40" />
                    </div>

                    <form
                        action={async () => {
                            "use server"
                            await signIn("google")
                        }}
                    >
                        <button
                            type="submit"
                            className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-border/50 hover:bg-surface/50 text-foreground text-sm font-medium rounded-xl transition-all group"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                            Continue with Google
                        </button>
                    </form>
                </div>

                <p className="text-xs text-muted/60 mt-8">
                    By continuing, you agree to the Workspace Security Policy.
                </p>
            </div>
        </div>
    )
}
