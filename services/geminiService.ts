import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

// List of API Keys for fallback redundancy
const API_KEYS = [
  "AIzaSyAenNBpLkd70YYe9ABeuXvfnSfCXUuTQvQ",
  "AIzaSyChZdHISBYnyE6RTjfL9qWIVxnrnUa-VSE",
  "AIzaSyD5JryzPYKo08GEAOQjAavAqT6gXF9svms"
];

// Helper to convert Blob to Base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to convert blob to base64 string"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Handles Image Editing using gemini-2.5-flash-image
 * Implements a Multi-Key Fallback System
 */
export const editImage = async (
  images: Array<{ data: string; mimeType: string }>,
  prompt: string,
  engine: string = 'HTL-1'
): Promise<Message> => {
  
  let lastError: any = null;

  // Instructions based on engine selection
  let engineInstruction = "";
  if (engine === 'HTL-1') engineInstruction = "MODE: FAST/BASIC. Prioritize speed. Do not add unnecessary details.";
  if (engine === 'Qwalc-3') engineInstruction = "MODE: BALANCED/DETAILED. Enhance lighting and texture.";
  if (engine === 'Snapic-gen3') engineInstruction = "MODE: ULTRA/CREATIVE. Maximum artistic freedom and fidelity.";

  const fullPrompt = `[SYSTEM: You are SMAPic. ${engineInstruction} DO NOT CONVERSE. JUST EDIT/GENERATE.] ${prompt}`;

  // Loop through available API keys
  for (const apiKey of API_KEYS) {
    try {
      console.log(`Attempting generation with key ending in ...${apiKey.slice(-4)}`);
      
      const ai = new GoogleGenAI({ apiKey });
      
      // Construct parts: Images first, then text prompt
      const parts: any[] = images.map(img => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      }));
      
      parts.push({ text: fullPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{
          parts: parts
        }]
      });

      // Check for candidates and safety blocks
      const candidate = response.candidates?.[0];

      if (!candidate) {
          if (response.promptFeedback?.blockReason) {
              throw new Error(`Blocked by safety: ${response.promptFeedback.blockReason}`);
          }
          throw new Error("No candidates returned from model");
      }

      // Check finish reason
      if (candidate.finishReason === 'SAFETY') {
           throw new Error("Generación bloqueada por filtros de seguridad.");
      }

      let newImageBase64: string | undefined;
      let responseText: string | undefined;

      // Iterate parts to find text or image
      const contentParts = candidate.content?.parts;
      
      if (contentParts) {
        for (const part of contentParts) {
          if (part.inlineData) {
            newImageBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          } else if (part.text) {
            responseText = part.text;
          }
        }
      }

      if (!newImageBase64 && !responseText) {
        throw new Error("Empty response content parts from model");
      }

      // SUCCESS: Return the message and break the loop
      return {
        id: crypto.randomUUID(),
        role: 'model',
        // If we have an image, we try to suppress text unless it's critical.
        text: newImageBase64 ? (responseText?.length && responseText.length < 50 ? responseText : undefined) : responseText,
        image: newImageBase64
      };

    } catch (error: any) {
      console.warn(`Key ...${apiKey.slice(-4)} failed:`, error);
      lastError = error;
      
      // If it's a Safety error, don't try other keys, as the result will be the same.
      const errString = error.toString().toLowerCase();
      if (errString.includes("safety") || errString.includes("seguridad") || errString.includes("blocked")) {
         break; 
      }
      
      // Otherwise (Network, Quota, 500s), continue to next key in loop...
    }
  }

  // If we exhaust all keys or hit a hard stop (safety), handle the last error
  console.error("All API keys failed or Safety Block triggered.", lastError);
    
  let userMessage = "";
  const errString = lastError ? lastError.toString().toLowerCase() : "unknown error";

  // 1. Safety / Policy Errors
  if (errString.includes("safety") || errString.includes("seguridad") || errString.includes("blocked")) {
      userMessage = "⚠️ Bloqueo de Seguridad: La imagen o el prompt infringen nuestras normas de contenido.";
  } 
  // 2. Network / API Errors (Cloud Connection) - Only if ALL keys failed
  else if (
      errString.includes("fetch failed") || 
      errString.includes("network") || 
      errString.includes("503") || 
      errString.includes("500") ||
      errString.includes("429") // Rate limit
  ) {
      userMessage = "⚠️ Error de conexión de los motores en la nube ☁️. \n\nTodos los sistemas de respaldo intentaron procesar tu solicitud pero no responden. Por favor intenta más tarde.";
  } 
  // 3. Empty Response / Model Confusion
  else if (errString.includes("empty response") || errString.includes("no candidates")) {
      userMessage = `⚠️ El motor ${engine} no pudo procesar esta solicitud específica.\n\nSugerencia: Intenta reformular tu instrucción o prueba con otro motor (ej. Qwalc-3).`;
  }
  // 4. Generic / Engine Failure
  else {
      userMessage = `❌ Error Crítico en el motor ${engine}.\n\nNo pudimos completar la renderización tras múltiples intentos.`;
  }

  return {
    id: crypto.randomUUID(),
    role: 'model',
    text: userMessage,
    isError: true
  };
};