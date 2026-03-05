import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy — Threads Monitor',
    description: 'Privacy Policy for Threads Monitor',
};

export default function PrivacyPolicy() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6">
            <h1 className="text-3xl font-semibold mb-6 text-foreground tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>

            <div className="space-y-8 text-muted-foreground leading-relaxed">
                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">1. Introduction</h2>
                    <p>
                        Welcome to Threads Monitor. We respect your privacy and are committed to protecting your personal data.
                        This privacy policy explains how we collect, use, and protect your information when you use our application
                        and our Meta/Threads integration.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">2. Data We Collect</h2>
                    <p>When you use the "Log in with Threads" feature, we may collect the following information from your Meta/Threads account:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Your public profile information (name, profile picture)</li>
                        <li>Your Threads user ID</li>
                        <li>Access tokens required to publish content on your behalf</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">3. How We Use Your Data</h2>
                    <p>We use the collected information exclusively to provide the core functionality of our service:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>To authenticate you and link your Threads account to our monitor workspaces</li>
                        <li>To publish approved content (posts, images, videos) to your Threads account automatically</li>
                        <li>We do not sell, rent, or share your personal data with third parties.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">4. Data Retention</h2>
                    <p>
                        We retain your Threads profile information and access tokens only for as long as your account is active on our platform
                        and the integration is enabled. If you disconnect your account or request deletion, we will purge the associated data
                        from our servers immediately.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">5. Data Security</h2>
                    <p>
                        We implement appropriate technical measures to protect the security of your personal information,
                        including encryption of access tokens in our database.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">6. Contact Us</h2>
                    <p>
                        If you have any questions or concerns about this privacy policy, please contact us.
                    </p>
                </section>
            </div>
        </div>
    );
}
