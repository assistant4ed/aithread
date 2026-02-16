import { PrismaClient } from "@prisma/client";
import Image from "next/image";
import AutoRefresh from "@/components/AutoRefresh";

const prisma = new PrismaClient();

// Revalidate every 60 seconds
export const revalidate = 0; // Disable cache for realtime

export default async function Dashboard() {
  const accounts = await prisma.account.findMany();
  const hotPosts = await prisma.post.findMany({
    where: { hot_score: { gt: 0 } }, // Show all for now, typically gt: 50
    orderBy: { hot_score: "desc" },
    include: { account: true },
    take: 20,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 font-sans">
      <AutoRefresh />
      <header className="mb-10 max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Threads Monitor</h1>
        <p className="text-gray-600 dark:text-gray-400">Monitoring {accounts.length} tech accounts. {hotPosts.length} hot posts detected.</p>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Feed Column */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Hot Posts</h2>

          {hotPosts.length === 0 ? (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center text-gray-500">
              No hot posts detected yet. check back later.
            </div>
          ) : (
            hotPosts.map((post) => (
              <div key={post.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {post.account.username[0].toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">@{post.account.username}</h3>
                      <p className="text-xs text-gray-500">Hot Score: {post.hot_score.toFixed(1)}</p>
                    </div>
                  </div>

                  {/* Translated Content (if available) */}
                  {post.content_translated && (
                    <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Traditional Chinese (HK)</p>
                      <p className="text-gray-800 dark:text-gray-200 text-lg leading-relaxed">{post.content_translated}</p>
                    </div>
                  )}

                  {/* Original Content */}
                  <div className="mb-4">
                    {post.content_translated && <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Original</p>}
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{post.content_original}</p>
                  </div>

                  {/* Media */}
                  {post.media_urls && (
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {(() => {
                        try {
                          return JSON.parse(post.media_urls).map((url: string, i: number) => (
                            <img
                              key={i}
                              src={url}
                              alt="Post media"
                              className="rounded-lg w-full h-48 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ));
                        } catch (e) { return null; }
                      })()}
                    </div>
                  )}

                  <div className="flex items-center gap-6 text-sm text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-4 mt-4">
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.replies}</span>
                    <span>🔁 {post.reposts}</span>
                    <a href={post.url || "#"} target="_blank" className="ml-auto text-blue-500 hover:underline">View on Threads ↗</a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Monitored Accounts</h2>
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">@{acc.username}</span>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
