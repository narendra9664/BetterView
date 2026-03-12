import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const hf = new HfInference(process.env.VITE_HF_API_KEY);

async function test() {
    try {
        console.log("Testing Qwen2-VL-7B-Instruct...");
        const response = await hf.chatCompletion({
            model: "Qwen/Qwen2-VL-7B-Instruct",
            messages: [
                {
                    role: "user",
                    content: "Hi"
                }
            ],
            max_tokens: 10
        });
        console.log("Success:", response.choices[0].message.content);
    } catch (err: any) {
        console.log("Status:", err.status);
        console.log("Message:", err.message);
    }
}

test();
