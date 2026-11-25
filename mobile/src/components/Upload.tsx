import type { Row } from '@/lib/review';

// Upload documents (phones, native): not built yet. A native build needs a document picker and its own PDF/image
// handling; the web build uses Upload.web.tsx (the web's reader.js + pdf.js in the browser).
export function Upload(_: { model: any; onRows: (rows: Row[], failed: number, clear: () => void) => void; onBusy?: (busy: boolean) => void }) { return null; }
