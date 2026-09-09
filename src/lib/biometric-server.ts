// ═══════════════════════════════════════════════════════════════
// Server-side helper to communicate with the Python fingerprint service.
// Runs inside Next.js server (Node.js), not the browser.
// Uses raw WebSocket via the `ws` package or native fetch fallback.
// ═══════════════════════════════════════════════════════════════

const FP_SERVICE_URL = process.env.NEXT_PUBLIC_FINGERPRINT_SERVICE_URL || "ws://localhost:8765";

interface FPResponse {
  type: string;
  op?: string;
  success: boolean;
  message?: string;
  employee?: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    photoPath: string | null;
  };
  template?: {
    id: string;
    fingerIndex: number;
    quality: number;
    createdAt: string;
  };
  templates?: Array<{
    id: string;
    fingerIndex: number;
    quality: number;
    createdAt: string;
  }>;
}

/**
 * Send a command to the Python fingerprint service via WebSocket.
 * Uses native WebSocket (Node 22+) or falls back to error if unavailable.
 */
async function sendCommand(command: Record<string, unknown>, timeoutMs = 15000): Promise<FPResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Fingerprint service timeout"));
    }, timeoutMs);

    try {
      // Use native WebSocket (available in Node 22+)
      const ws = new WebSocket(FP_SERVICE_URL);

      ws.onopen = () => {
        ws.send(JSON.stringify(command));
      };

      ws.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        try {
          const data = JSON.parse(String(event.data)) as FPResponse;
          resolve(data);
        } catch {
          resolve({ type: "error", success: false, message: "Invalid response from fingerprint service" });
        }
        ws.close();
      };

      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Fingerprint service unreachable"));
      };

      ws.onclose = () => {
        clearTimeout(timer);
      };
    } catch {
      clearTimeout(timer);
      reject(new Error("WebSocket not available"));
    }
  });
}

export async function identifyFingerprint(): Promise<{
  success: boolean;
  employee?: FPResponse["employee"];
  message: string;
}> {
  try {
    const result = await sendCommand({ op: "identify" });
    return {
      success: result.success,
      employee: result.employee,
      message: result.message || (result.success ? "Identified" : "Not recognized"),
    };
  } catch (e) {
    return { success: false, message: "Fingerprint service unavailable" };
  }
}

export async function enrollFingerprint(
  employeeId: string,
  fingerIndex: number
): Promise<{
  success: boolean;
  template?: FPResponse["template"];
  message: string;
}> {
  try {
    const result = await sendCommand({ op: "enroll", employeeId, fingerIndex }, 30000);
    return {
      success: result.success,
      template: result.template,
      message: result.message || (result.success ? "Enrolled" : "Enrollment failed"),
    };
  } catch (e) {
    return { success: false, message: "Fingerprint service unavailable" };
  }
}

export async function deleteFingerprint(
  templateId?: string,
  employeeId?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await sendCommand({
      op: "delete",
      ...(templateId ? { templateId } : {}),
      ...(employeeId ? { employeeId } : {}),
    });
    return { success: result.success, message: result.message || "Done" };
  } catch (e) {
    return { success: false, message: "Fingerprint service unavailable" };
  }
}

export async function getFingerprintTemplates(
  employeeId: string
): Promise<{
  success: boolean;
  templates: FPResponse["templates"];
  message: string;
}> {
  try {
    const result = await sendCommand({ op: "getTemplates", employeeId });
    return {
      success: result.success,
      templates: result.templates || [],
      message: result.message || "OK",
    };
  } catch (e) {
    return { success: false, templates: [], message: "Fingerprint service unavailable" };
  }
}

export async function checkFingerprintService(): Promise<boolean> {
  try {
    const result = await sendCommand({ op: "ping" }, 5000);
    return result.success;
  } catch {
    return false;
  }
}
