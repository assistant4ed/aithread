import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service — Threads Monitor',
    description: 'Terms of Service for Threads Monitor',
};

export default function TermsOfService() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6">
            <h1 className="text-3xl font-semibold mb-6 text-foreground tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted mb-8">Last updated: {new Date().toLocaleDateString()}</p>

            <div className="space-y-8 text-muted-foreground leading-relaxed">
                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">1. Acceptance of Terms</h2>
                    <p>
                        By accessing or using Threads Monitor, you agree to be bound by these Terms of Service.
                        If you do not agree with any part of the terms, you must not use our service.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">2. Service Description</h2>
                    <p>
                        Threads Monitor provides automated content monitoring, synthesis, and publishing tools for Meta's Threads platform
                        and other supported social media integrations.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">3. Meta / Threads Integration</h2>
                    <p>
                        Our service utilizes the Meta API to publish content on your behalf. By authorizing our application,
                        you grant us permission to act on your behalf on your connected profiles. You must comply with all
                        Facebook and Threads platform policies and community standards when using our tool.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">4. Content Responsibility</h2>
                    <p>
                        You are solely responsible for the content generated, approved, and published through your workspaces.
                        Threads Monitor assumes no liability for content published through our platform that violates third-party
                        rights or platform terms.
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">5. Termination</h2>
                    <p>
                        We reserve the right to suspend or terminate your access to our service at any time,
                        with or without cause, including violations of these Terms of Service.
                    </p>
                </section>
            </div>
        </div>
    );
}
