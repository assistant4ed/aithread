import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Data Deletion Instructions — Threads Monitor',
    description: 'How to delete your user data from Threads Monitor',
};

export default function DataDeletion() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-6">
            <h1 className="text-3xl font-semibold mb-6 text-foreground tracking-tight">User Data Deletion Instructions</h1>

            <div className="space-y-8 text-muted-foreground leading-relaxed">
                <p>
                    Threads Monitor is a Facebook/Meta-integrated application. According to the Facebook Platform rules, we must provide
                    users with instructions for requesting the deletion of their data.
                </p>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">Option 1: Delete via Facebook/Threads</h2>
                    <p>You can remove our app's access to your Threads account and delete the connection directly from your Meta settings:</p>
                    <ol className="list-decimal pl-5 mt-2 space-y-2">
                        <li>Go to your Facebook/Instagram/Threads Account Settings.</li>
                        <li>Navigate to <strong>Apps and Websites</strong>.</li>
                        <li>Find <strong>Threads Monitor</strong> in the list of active apps.</li>
                        <li>Click <strong>Remove</strong> to revoke our access.</li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-xl font-medium text-foreground mb-3">Option 2: Contact Us to Purge Your Data</h2>
                    <p>
                        If you want us to completely erase all data associated with your account from our internal database (including your user ID and access tokens),
                        you can request a full data purge.
                    </p>
                    <p className="mt-4">
                        Currently, please contact the site administrator directly to have your workspace and authentication data purged.
                        Once processed, all historical records, tokens, and metadata linked to your user account will be permanently destroyed.
                    </p>
                </section>

                <div className="pt-8">
                    <Link href="/" className="text-accent hover:underline text-sm">
                        &larr; Back to Command Center
                    </Link>
                </div>
            </div>
        </div>
    );
}
