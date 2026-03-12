import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";

dotenv.config();

const hf = new HfInference(process.env.VITE_HF_API_KEY);

async function test() {
    try {
        console.log("Testing GPT2 (Text Generation)...");
        const response = await hf.textGeneration({
            model: "gpt2",
            inputs: "The weather is",
        });
        console.log("Success:", response.generated_text);
    } catch (err: any) {
        console.log("Status:", err.status);
        console.log("Error Message:", err.message);
    }
}

test();
