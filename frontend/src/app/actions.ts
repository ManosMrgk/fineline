'use server';

import {
  getFinancialInsights,
  type FinancialInsightsInput,
} from '@/ai/flows/financial-insights-from-ai';
import {
  analyzeSpendingHabits,
  type SpendingHabitsInput,
} from '@/ai/flows/spending-habits-analysis';
import type { MonthlySpending } from '@/lib/data';

export type AIState = {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  id?: string;
};

const ENV_GEMINI_KEY =
  process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
const HAS_ENV_GEMINI_KEY = !!ENV_GEMINI_KEY;

function formatFinancialData(data: MonthlySpending): string {
  const categoryBreakdownString = data.categoryBreakdown
    .map(item => `  - ${item.name}: €${item.value.toFixed(2)}`)
    .join('\n');

  return `
- Month: ${data.month} ${data.year}
- Total Spent: €${data.totalSpent.toFixed(2)}
- Average Spending: €${data.averageSpending.toFixed(2)}
- Category Breakdown:
${categoryBreakdownString}
  `.trim();
}

async function generateWithGeminiUserKey(
  apiKey: string,
  prompt: string
): Promise<string> {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  const res = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as any;

  const text =
    json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text ?? '')
      .join('') ?? '';

  if (!text) {
    throw new Error('Empty response from Gemini API');
  }

  return text;
}


export async function hasEnvGeminiKeyAction(): Promise<boolean> {
  return HAS_ENV_GEMINI_KEY;
}

export async function verifyGeminiKeyAction(apiKey: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const testPrompt =
      'Reply with a single word: OK. This is a connectivity test.';
    await generateWithGeminiUserKey(apiKey, testPrompt);
    return { ok: true };
  } catch (e: any) {
    console.error('[verifyGeminiKeyAction] Error verifying key', e);
    return {
      ok: false,
      error:
        e?.message ??
        'Failed to verify the key. Please make sure it is a valid Gemini API key.',
    };
  }
}

export async function getInsightsAction(
  query: string,
  financialData: MonthlySpending,
  userApiKey?: string | null
): Promise<AIState> {
  try {
    const formattedData = formatFinancialData(financialData);

    // Prefer env-based Genkit flow if available
    if (HAS_ENV_GEMINI_KEY) {
      const input: FinancialInsightsInput = {
        query,
        financialData: formattedData,
      };
      const result = await getFinancialInsights(input);
      return {
        role: 'assistant',
        content: result.insights,
      };
    }

    // Fallback to user-supplied API key
    if (!userApiKey) {
      return {
        role: 'error',
        content:
          'No Gemini API key is configured. Please add your Gemini API key in the assistant setup first.',
      };
    }

    const promptText = `
You are a friendly and helpful financial advisor. Your goal is to provide clear, actionable, and personalized insights based on the user's spending data and their specific question.

Here is the user's question:
"${query}"

And here is their financial data for the current period:
${formattedData}

Please provide a concise and easy-to-understand answer to the user's question. Use the financial data to support your points. Format your response using markdown for readability. If you provide a list, use bullet points.
`.trim();

    const text = await generateWithGeminiUserKey(userApiKey, promptText);

    return {
      role: 'assistant',
      content: text,
    };
  } catch (e) {
    console.error(e);
    return {
      role: 'error',
      content:
        'Sorry, I encountered an error. Please check your API key or try again.',
    };
  }
}

export async function analyzeSpendingAction(
  financialData: MonthlySpending,
  userApiKey?: string | null
): Promise<AIState> {
  try {
    const categoryBreakdown = financialData.categoryBreakdown.reduce(
      (acc, item) => {
        acc[item.name] = item.value;
        return acc;
      },
      {} as Record<string, number>
    );

    const spendingSummary = `
- Total Spent: €${financialData.totalSpent.toFixed(2)}
- Average Monthly Spending: €${financialData.averageSpending.toFixed(2)}
- Spending by Category:
${Object.entries(categoryBreakdown)
  .map(([name, val]) => `  - ${name}: €${val.toFixed(2)}`)
  .join('\n')}
`.trim();

    // Prefer env-based Genkit flow if available
    if (HAS_ENV_GEMINI_KEY) {
      const input: SpendingHabitsInput = {
        spendingData: {
          month: financialData.month,
          year: String(financialData.year),
          totalSpent: financialData.totalSpent,
          averageSpending: financialData.averageSpending,
          categoryBreakdown: categoryBreakdown,
        },
      };
      const result = await analyzeSpendingHabits(input);
      const combinedResponse = `**Insights:**\n${result.insights}\n\n**Recommendations:**\n${result.recommendations}`;
      return {
        role: 'assistant',
        content: combinedResponse,
      };
    }

    // Fallback to user-supplied API key
    if (!userApiKey) {
      return {
        role: 'error',
        content:
          'No Gemini API key is configured. Please add your Gemini API key in the assistant setup first.',
      };
    }

    const promptText = `
You are a personal finance advisor conducting a spending analysis. Your tone should be encouraging and helpful.

Analyze the following spending data for the month of ${
      financialData.month
    } ${financialData.year}:

${spendingSummary}

Based on this data, provide the following:
1. **Insights:** Identify the key reasons for any significant overspending or underspending compared to the average. Point out the top 2–3 spending categories and explain their impact on the total.
2. **Recommendations:** Offer 2–3 clear, actionable strategies for better financial management. These should be directly related to the insights you identified.

Format your entire response using markdown. Use bolding for titles and bullet points for lists.
`.trim();

    const text = await generateWithGeminiUserKey(userApiKey, promptText);

    return {
      role: 'assistant',
      content: text,
    };
  } catch (e) {
    console.error(e);
    return {
      role: 'error',
      content:
        'Sorry, I encountered an error while analyzing spending. Please check your API key or try again.',
    };
  }
}
