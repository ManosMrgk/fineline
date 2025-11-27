export type MonthlySpending = {
  month: string;
  year: number;
  totalSpent: number;
  averageSpending: number;
  categoryBreakdown: { name: string; value: number }[];
  dailySpending: { 
    day: string; 
    spent: number; 
    expenses: { 
      merchant: string; 
      category: string; 
      value: number }[] 
    }[];
};


export const spendingData: MonthlySpending[] = []

export const availableYears = [new Date().getFullYear()];

export const availableMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
