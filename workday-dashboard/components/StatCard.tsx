"use client";

interface StatCardProps {
  label: string;
  count: number;
  color: string; // Tailwind bg class e.g. "bg-blue-600"
  onClick?: () => void;
}

export default function StatCard({ label, count, color, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`stat-card ${color} text-left w-full`}
      title={`View ${label}`}
    >
      <span className="text-3xl font-bold tabular-nums">{count}</span>
      <span className="text-sm font-medium opacity-90 leading-tight">{label}</span>
    </button>
  );
}
