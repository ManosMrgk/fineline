'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FinancialInsightsInputSchema = z.object({
  query: z.string().describe('The user query about their spending habits.'),
  financialData: z
    .string()
    .describe(
      "A summary of the user's financial data, including total spent, average spending, and category breakdown."
    ),

  apiKey: z
    .string()
    .optional()
    .describe(
      'Optional Gemini API key to use for this request. When omitted, the default key from the environment / Genkit config is used.'
    ),
});

export type FinancialInsightsInput = z.infer<typeof FinancialInsightsInputSchema>;

const FinancialInsightsOutputSchema = z.object({
  insights: z
    .string()
    .describe(
      'Personalized financial insights and recommendations based on the user query and financial data.'
    ),
});
export type FinancialInsightsOutput = z.infer<typeof FinancialInsightsOutputSchema>;

export async function getFinancialInsights(
  input: FinancialInsightsInput
): Promise<FinancialInsightsOutput> {
  return financialInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'financialInsightsPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: FinancialInsightsInputSchema },
  output: { schema: FinancialInsightsOutputSchema },
  prompt: `You are a friendly and helpful financial advisor. Your goal is to provide clear, actionable, and personalized insights based on the user's spending data and their specific question.

Here is the user's question:
"{{{query}}}"

And here is their financial data for the current period:
{{{financialData}}}

Please provide a concise and easy-to-understand answer to the user's question. Use the financial data to support your points. Format your response using markdown for readability. If you provide a list, use bullet points.`,
});

const financialInsightsFlow = ai.defineFlow(
  {
    name: 'financialInsightsFlow',
    inputSchema: FinancialInsightsInputSchema,
    outputSchema: FinancialInsightsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
