export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Skip noisy logs or format them cleanly
  if (message.includes("capturedJsonResponse")) return;
  
  console.log(`${formattedTime} [${source}] ${message}`);
}
