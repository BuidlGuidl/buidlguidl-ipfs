export function formatBytes(bytes: number | bigint | string): string {
  // Handle string input (from pin sizes)
  const bytes_num = typeof bytes === "string" 
    ? parseInt(bytes, 10)
    : typeof bytes === "bigint" 
    ? Number(bytes) 
    : bytes;

  const sizes = ["B", "KB", "MB", "GB", "TB"];

  if (bytes_num === 0) return "0 B";

  const i = Math.floor(Math.log(bytes_num) / Math.log(1024));
  const formatted = (bytes_num / Math.pow(1024, i)).toFixed(2);

  return `${formatted} ${sizes[i]}`;
} 