/**
 * The picture the playground opens with, drawn rather than fetched.
 *
 * No network, no asset to serve, no licence question — and the printed
 * identifier at the top left is deliberate: the browser suite redacts it and
 * then reads the exported pixels back to check the redaction really removed it.
 */
export async function sampleImage(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1067;
  const context = canvas.getContext("2d")!;

  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#1b2a5e");
  sky.addColorStop(0.55, "#e0674f");
  sky.addColorStop(1, "#f6c177");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255, 244, 214, 0.95)";
  context.beginPath();
  context.arc(1180, 430, 74, 0, Math.PI * 2);
  context.fill();

  const ridges: Array<[number, string]> = [
    [720, "#2b2f4a"],
    [820, "#1e2137"],
    [930, "#141626"],
  ];
  for (const [baseline, colour] of ridges) {
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(0, canvas.height);
    context.lineTo(0, baseline);
    for (let x = 0; x <= canvas.width; x += 40) {
      const y = baseline - Math.sin(x / 190) * 70 - Math.cos(x / 70) * 22;
      context.lineTo(x, y);
    }
    context.lineTo(canvas.width, canvas.height);
    context.closePath();
    context.fill();
  }

  // Printed detail, so the redaction tools have something real to destroy — and
  // so the browser tests can measure whether they did.
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.font = `${Math.round(canvas.height * 0.05)}px system-ui, sans-serif`;
  context.fillText("ID 4821-77", canvas.width * 0.08, canvas.height * 0.2);
  context.fillText("pixen sample", canvas.width * 0.08, canvas.height * 0.28);

  return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.9));
}
