import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const hf = new HfInference(process.env.VITE_HF_API_KEY);

async function test() {
    try {
        console.log("Testing Llama-3.2-11B-Vision-Instruct...");
        const response = await hf.chatCompletion({
            model: "meta-llama/Llama-3.2-11B-Vision-Instruct",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What is in this image?" },
                        { type: "image_url", image_url: { url: "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/transformers/tasks/ai2d-demo.png" } }
                    ]
                }
            ],
            max_tokens: 50
        });
        console.log("Success:", JSON.stringify(response, null, 2));
    } catch (err: any) {
        console.log("Status:", err.status);
        console.log("Message:", err.message);
        console.log("Full Error:", JSON.stringify(err, null, 2));
    }
}

test();
