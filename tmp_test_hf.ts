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
                    content: "Hi"
                }
            ],
            max_tokens: 10
        });
        console.log("Success:", response.choices[0].message.content);
    } catch (err) {
        console.error("Error Detail:", err);
    }
}

test();
