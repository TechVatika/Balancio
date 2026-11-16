export function rupee(value) {
  const number = Number(String(value ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function reportFileName(report, extension) {
  const slug = report.kind === "summary" ? "summary" : "statement";
  return `Balancio-${slug}-${report.from}-to-${report.to}.${extension}`;
}

const logoCache = new Map();

export function logoDataUrl(file = "/logo.png") {
  if (!logoCache.has(file)) {
    logoCache.set(file, fetch(file).then(async (response) => {
      if (!response.ok) throw new Error("The Balancio logo could not be loaded.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
      }
      return `data:image/png;base64,${btoa(binary)}`;
    }));
  }
  return logoCache.get(file);
}

export function saveFile(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
