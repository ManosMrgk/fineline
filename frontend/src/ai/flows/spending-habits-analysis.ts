'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SpendingDataSchema = z.object({
  month: z
    .string()
    .describe(
      'The month for which the spending data is being analyzed (e.g., January, February).'
    ),
  year: z
    .string()
    .describe(
      'The year for which the spending data is being analyzed (e.g., 2023, 2024).'
    ),
  totalSpent: z
    .number()
    .describe('The total amount spent during the specified month and year.'),
  averageSpending: z
    .number()
    .describe('The average spending amount based on historical data.'),
  categoryBreakdown: z
    .record(z.string(), z.number())
    .describe(
      'A breakdown of spending by category, where the key is the category name and the value is the amount spent in that category.'
    ),
});

const SpendingHabitsInputSchema = z.object({
  spendingData: SpendingDataSchema.describe(
    'The user spending data to be analyzed.'
  ),

  apiKey: z
    .string()
    .optional()
    .describe(
      'Optional Gemini API key to use for this request. When omitted, the default key from the environment / Genkit config is used.'
    ),
});

export type SpendingHabitsInput = z.infer<typeof SpendingHabitsInputSchema>;

const SpendingHabitsOutputSchema = z.object({
  insights: z
    .string()
    .describe('Insights into potential overspending risks and explanations.'),
  recommendations: z
    .string()
    .describe('Strategies for better financial management.'),
});

export type SpendingHabitsOutput = z.infer<typeof SpendingHabitsOutputSchema>;

export async function analyzeSpendingHabits(
  input: SpendingHabitsInput
): Promise<SpendingHabitsOutput> {
  return analyzeSpendingHabitsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'spendingHabitsAnalysisPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: SpendingHabitsInputSchema },
  output: { schema: SpendingHabitsOutputSchema },
  prompt: `You are a personal finance advisor conducting a spending analysis. Your tone should be encouraging and helpful.

Analyze the following spending data for the month of {{{spendingData.month}}} {{{spendingData.year}}}:
- Total Spent: €{{{spendingData.totalSpent}}}
- Average Monthly Spending: €{{{spendingData.averageSpending}}}
- Spending by Category:
{{#each spendingData.categoryBreakdown}}
  - {{@key}}: €{{this}}
{{/each}}

Based on this data, provide the following:
1.  **Insights:** Identify the key reasons for any significant overspending or underspending compared to the average. Point out the top 2-3 spending categories and explain their impact on the total.
2.  **Recommendations:** Offer 2-3 clear, actionable strategies for better financial management. These should be directly related to the insights you identified. For example, if "Dining Out" is high, suggest a realistic goal for reducing it.

Format your entire response using markdown. Use bolding for titles and bullet points for lists.`,
});

const analyzeSpendingHabitsFlow = ai.defineFlow(
  {
    name: 'analyzeSpendingHabitsFlow',
    inputSchema: SpendingHabitsInputSchema,
    outputSchema: SpendingHabitsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
