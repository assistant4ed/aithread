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
                </div>

                <p className="text-xs text-muted/60 mt-8">
                    By continuing, you agree to the Workspace Security Policy.
                </p>
            </div>
        </div>
    )
}
