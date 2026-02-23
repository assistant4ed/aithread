import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        // The listModels method is on the genAI object or requires a specific client
        // Actually, the SDK doesn't have a simple listModels on GoogleGenerativeAI.
        // It's usually through the REST API or Vertex AI.
        // But we can try to "ping" different versions.

        const models = [
            "gemini-2.5-flash",
            "gemini-3.1-pro-preview",
            "gemini-3-pro-preview"
        ];

        console.log("Testing model availability...");
        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent("test");
                console.log(`✅ ${modelName} is available.`);
            } catch (err: any) {
                console.log(`❌ ${modelName} failed: ${err.message.slice(0, 100)}`);
            }
        }
    } catch (err) {
        console.error("Error listing models:", err);
    }
}

listModels();
