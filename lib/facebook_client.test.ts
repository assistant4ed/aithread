import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
    postTextToPage,
    postImageToPage,
    postVideoToPage,
    publishToFacebookPage,
    getFacebookPost,
} from "./facebook_client";

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── postTextToPage ────────────────────────────────────────────────────────────

describe("postTextToPage", () => {
    it("posts text to /{pageId}/feed", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "page123_post456" }),
        });

        const result = await postTextToPage("page123", "token-abc", "Hello world");

        expect(result).toBe("page123_post456");
        expect(mockFetch).toHaveBeenCalledWith(
            "https://graph.facebook.com/v19.0/page123/feed",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("truncates text longer than 500 chars", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "post-id" }),
        });

        const longText = "A".repeat(600);
        await postTextToPage("page1", "token", longText);

        const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
        const message = body.get("message")!;
        expect(message.length).toBe(500);
        expect(message.endsWith("...")).toBe(true);
    });

    it("throws on API error", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({
                error: { message: "Invalid token", type: "OAuthException", code: 190 },
            }),
        });

        await expect(postTextToPage("page1", "bad-token", "test")).rejects.toThrow("Invalid token");
    });
});

// ─── postImageToPage ──────────────────────────────────────────────────────────

describe("postImageToPage", () => {
    it("posts image to /{pageId}/photos", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "photo-1", post_id: "page1_photo1" }),
        });

        const result = await postImageToPage("page1", "token", "https://example.com/img.jpg", "My caption");

        expect(result).toBe("page1_photo1");
        const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
        expect(body.get("url")).toBe("https://example.com/img.jpg");
        expect(body.get("message")).toBe("My caption");
    });

    it("returns id when post_id is not present", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "photo-2" }),
        });

        const result = await postImageToPage("page1", "token", "https://example.com/img.jpg");
        expect(result).toBe("photo-2");
    });
});

// ─── postVideoToPage ──────────────────────────────────────────────────────────

describe("postVideoToPage", () => {
    it("posts video to /{pageId}/videos with file_url", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "video-1" }),
        });

        const result = await postVideoToPage("page1", "token", "https://example.com/vid.mp4", "Video desc");

        expect(result).toBe("video-1");
        const body = mockFetch.mock.calls[0][1].body as URLSearchParams;
        expect(body.get("file_url")).toBe("https://example.com/vid.mp4");
        expect(body.get("description")).toBe("Video desc");
    });
});

// ─── publishToFacebookPage (fallback behavior) ───────────────────────────────

describe("publishToFacebookPage", () => {
    it("publishes text-only when no media", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "page1_post1" }),
        });

        const result = await publishToFacebookPage("page1", "token", "Hello", undefined, "TEXT");
        expect(result.postId).toBe("page1_post1");
        expect(result.url).toContain("facebook.com");
    });

    it("publishes with image when mediaType is IMAGE", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "photo-1", post_id: "page1_photo1" }),
        });

        const result = await publishToFacebookPage("page1", "token", "Caption", "https://img.com/a.jpg", "IMAGE");
        expect(result.postId).toBe("page1_photo1");
    });

    it("falls back to text-only when image fails", async () => {
        // First call (image) fails
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: { message: "Bad image", type: "OAuthException", code: 100 } }),
        });
        // Second call (text fallback) succeeds
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "page1_text_fallback" }),
        });

        const result = await publishToFacebookPage("page1", "token", "Fallback text", "https://bad-image.com/x.jpg", "IMAGE");
        expect(result.postId).toBe("page1_text_fallback");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("falls back to text-only when video is too large", async () => {
        // HEAD request returns large content-length
        mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([["content-length", "2000000000"]]) as any, // 2GB > 1GB limit
        });
        // Text fallback succeeds
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "page1_text" }),
        });

        const result = await publishToFacebookPage("page1", "token", "Video too big", "https://vid.com/big.mp4", "VIDEO");
        expect(result.postId).toBe("page1_text");
    });

    it("falls back to text-only when video post fails", async () => {
        // HEAD succeeds with small size
        mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: new Map([["content-length", "1000"]]) as any,
        });
        // Video post fails
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: { message: "Video error", type: "OAuthException", code: 100 } }),
        });
        // Text fallback succeeds
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ id: "page1_text_fallback" }),
        });

        const result = await publishToFacebookPage("page1", "token", "Fallback", "https://vid.com/small.mp4", "VIDEO");
        expect(result.postId).toBe("page1_text_fallback");
    });
});

// ─── getFacebookPost ─────────────────────────────────────────────────────────

describe("getFacebookPost", () => {
    it("fetches post permalink", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: "page1_post1",
                permalink_url: "https://www.facebook.com/page/posts/12345",
            }),
        });

        const result = await getFacebookPost("page1_post1", "token");
        expect(result.permalink_url).toBe("https://www.facebook.com/page/posts/12345");
    });

    it("throws on fetch failure", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            statusText: "Not Found",
        });

        await expect(getFacebookPost("bad-id", "token")).rejects.toThrow("Failed to fetch Facebook post details");
    });
});
