import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

const plugins: any[] = [];

const envKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

if (envKey) {
  plugins.push(
    googleAI({
      apiKey: envKey,
    })
  );
} else {
  console.warn(
    '[AI] No GEMINI_API_KEY/GOOGLE_API_KEY found. Genkit is initialized WITHOUT the Google plugin. ' +
      'Flows that call Gemini will fail until you either set a key in env or supply a user key.'
  );
}

export const ai = genkit({
  plugins,
});
