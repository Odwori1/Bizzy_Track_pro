'use client';

import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartProps {
  data: {
    labels: string[];
    datasets: {
      data: number[];
      backgroundColor: string[];
      borderColor?: string[];
      borderWidth?: number;
    }[];
  };
  title?: string;
  height?: number;
}

export const PieChart: React.FC<PieChartProps> = ({ data, title, height = 300 }) => {
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      title: {
        display: !!title,
        text: title,
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = Math.round((value / total) * 100);
            return `${label}: ${format(value)} (${percentage}%)`; // ✅ CORRECT: Using format function
          }
        }
      }
    },
  };

  return (
    <div style={{ height }}>
      <Pie data={data} options={options} />
    </div>
  );
};
