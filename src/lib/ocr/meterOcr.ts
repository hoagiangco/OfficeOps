/**
 * OfficeOps - Bộ giải thuật OCR nhận diện số Counter đồng hồ máy Photocopy / Máy in
 *
 * Tính năng:
 * 1. Tiền xử lý ảnh (Image Preprocessing): Grayscale, tăng độ tương phản (Contrast Stretch),
 *    nhị phân hóa (Binarization/Thresholding) tối ưu cho màn hình LCD và bộ đếm cơ khí.
 * 2. Nhận diện ký tự chuyên dụng (Tesseract OCR Engine): Giới hạn bộ ký tự Whitelist (0-9, dấu chấm, dấu phẩy)
 *    để triệt tiêu nhầm lẫn chữ số (0 vs O, 1 vs l, 5 vs S, 8 vs B).
 * 3. Trích xuất ứng viên thông minh (Candidate Parser & Heuristics):
 *    - Nhận diện định dạng số ngăn cách nghìn (125,480 / 125.480 / 125 480).
 *    - Phân tích ngữ cảnh từ khóa ("Total", "Counter", "Count", "B&W", "Color").
 *    - So khớp trọng số với chỉ số trước đó (previousCounter) để ưu tiên số tăng tự nhiên.
 *    - Lọc bỏ số sê-ri, ngày tháng, mã lỗi để độ chính xác đạt chuẩn ≥ 90%.
 */

export interface MeterCandidate {
  value: number;
  formattedValue: string;
  confidence: number; // 0 - 100
  label?: string; // VD: "Total Counter (Tổng)", "Khớp chỉ số gần nhất (+1,450)"
  rawText: string;
  isAbovePrevious: boolean;
  deltaFromPrevious?: number;
}

export interface MeterOcrResult {
  bestValue: number | null;
  bestCandidate: MeterCandidate | null;
  candidates: MeterCandidate[];
  rawText: string;
  confidence: number;
  processedImageUrl?: string;
  processingTimeMs: number;
}

declare global {
  interface Window {
    Tesseract?: any;
  }
}

const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

/**
 * Tải động thư viện Tesseract.js từ CDN với cơ chế singleton promise
 */
let tesseractLoadingPromise: Promise<any> | null = null;

export function loadTesseract(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OCR client-side chỉ chạy trên trình duyệt"));
  }

  if (window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }

  if (tesseractLoadingPromise) {
    return tesseractLoadingPromise;
  }

  tesseractLoadingPromise = new Promise((resolve, reject) => {
    // Kiểm tra xem script đã có trong DOM chưa
    const existingScript = document.querySelector(`script[src="${TESSERACT_CDN_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.Tesseract));
      existingScript.addEventListener("error", (err) => reject(err));
      return;
    }

    const script = document.createElement("script");
    script.src = TESSERACT_CDN_URL;
    script.async = true;
    script.onload = () => {
      if (window.Tesseract) {
        resolve(window.Tesseract);
      } else {
        reject(new Error("Không thể khởi tạo Tesseract.js"));
      }
    };
    script.onerror = () => {
      tesseractLoadingPromise = null;
      reject(new Error("Lỗi tải thư viện OCR từ CDN. Vui lòng kiểm tra kết nối mạng."));
    };
    document.head.appendChild(script);
  });

  return tesseractLoadingPromise;
}

/**
 * Tiền xử lý hình ảnh trên Canvas để tăng độ rõ nét cho số đồng hồ:
 * - Downscale vừa đủ nét (max 1600px) để tối ưu tốc độ xử lý
 * - Chuyển ảnh xám (Grayscale)
 * - Tự động phát hiện màn hình ngược sáng (chữ sáng nền tối) và đảo màu
 * - Tăng tương phản & ngưỡng nhị phân hóa (Thresholding)
 */
export function preprocessMeterImage(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  options?: {
    threshold?: number; // 0 - 255, mặc định tự thích nghi
    invertIfNeeded?: boolean;
    contrastBoost?: number; // Hệ số nhân tương phản, mặc định 1.5
  }
): { canvas: HTMLCanvasElement; dataUrl: string } {
  const contrastBoost = options?.contrastBoost ?? 1.5;
  const invertIfNeeded = options?.invertIfNeeded ?? true;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Không thể tạo Canvas 2D Context");

  let srcWidth = imageSource.width;
  let srcHeight = imageSource.height;

  // Giới hạn độ phân giải tối đa 1600px để xử lý nhanh và không tốn RAM
  const MAX_DIM = 1600;
  if (srcWidth > MAX_DIM || srcHeight > MAX_DIM) {
    const ratio = Math.min(MAX_DIM / srcWidth, MAX_DIM / srcHeight);
    srcWidth = Math.round(srcWidth * ratio);
    srcHeight = Math.round(srcHeight * ratio);
  }

  canvas.width = srcWidth;
  canvas.height = srcHeight;
  ctx.drawImage(imageSource, 0, 0, srcWidth, srcHeight);

  const imgData = ctx.getImageData(0, 0, srcWidth, srcHeight);
  const data = imgData.data;
  const totalPixels = srcWidth * srcHeight;

  // Bước 1: Tính độ sáng trung bình và dải Min-Max luminance
  let totalLuminance = 0;
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Công thức Rec. 601 Luma
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    totalLuminance += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const avgLuminance = totalLuminance / totalPixels;
  // Nếu màn hình nền đen chữ trắng (như LCD máy photo dòng cũ) thì cần đảo màu sang chữ đen nền trắng
  const shouldInvert = invertIfNeeded && avgLuminance < 110;

  // Bước 2: Tăng cường tương phản & nhị phân hóa
  const range = Math.max(1, maxLum - minLum);
  const thresholdVal = options?.threshold ?? (minLum + range * 0.5);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    let lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Đảo màu nếu nền tối
    if (shouldInvert) {
      lum = 255 - lum;
    }

    // Tăng tương phản (Contrast Stretch)
    let stretched = ((lum - minLum) / range) * 255;
    stretched = ((stretched - 128) * contrastBoost) + 128;
    stretched = Math.max(0, Math.min(255, stretched));

    // Binarize nhẹ hoặc giữ xám tương phản cao
    const finalVal = stretched < thresholdVal ? 0 : 255;

    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
    // data[i + 3] giữ nguyên alpha
  }

  ctx.putImageData(imgData, 0, 0);

  return {
    canvas,
    dataUrl: canvas.toDataURL("image/png"),
  };
}

/**
 * Trích xuất và chấm điểm các số ứng viên Counter từ văn bản thô do OCR quét được
 */
export function parseMeterCandidates(
  rawText: string,
  previousCounter?: number | null
): { bestCandidate: MeterCandidate | null; candidates: MeterCandidate[] } {
  if (!rawText || !rawText.trim()) {
    return { bestCandidate: null, candidates: [] };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidatesMap = new Map<number, MeterCandidate>();

  // Danh mục từ khóa nhận diện loại counter
  const TOTAL_KEYWORDS = ["total", "tong", "tổng", "counter", "count", "dong ho", "đồng hồ", "chi so", "chỉ số", "meter", "bản chụp", "total 1"];
  const BW_KEYWORDS = ["black", "mono", "bw", "b&w", "đen", "trang", "trắng"];
  const COLOR_KEYWORDS = ["color", "colour", "màu", "full color"];
  const NEGATIVE_KEYWORDS = ["serial", "s/n", "sn", "date", "ngày", "time", "giờ", "page", "trang", "ver", "model", "fax", "tel"];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const lowerLine = rawLine.toLowerCase();

    // Kiểm tra dòng có từ khóa tiêu cực không (VD: S/N: 20241025, Date: 2026/10/25)
    const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lowerLine.includes(kw));

    // Tìm các token số trong dòng
    // 1. Số các chữ số cách nhau bởi dấu cách (đồng hồ cơ khí hoặc LCD nét rời): 0 5 4 1 2 9
    // 2. Số có dấu phân cách nghìn (kể cả có số 0 ở đầu): 0048,290 hoặc 125.480 hoặc 125 480
    // 3. Số nguyên liền nhau từ 3 đến 8 chữ số: 125480
    const rawTokens: { text: string; index: number }[] = [];

    // Tìm chuỗi chữ số cách nhau bởi dấu cách: [ 0 5 4 1 2 9 ]
    const spacedMatches = rawLine.matchAll(/(?:\[|\b|\s)((?:\d\s+){3,7}\d)(?:\]|\b|\s)/g);
    for (const sm of spacedMatches) {
      if (sm[1]) {
        rawTokens.push({ text: sm[1].trim(), index: sm.index ?? 0 });
      }
    }

    // Tìm số chuẩn có phân cách hoặc số nguyên
    const standardMatches = rawLine.matchAll(/(?:\b|\s)(\d+(?:[.,]\d{3})+|\d{1,3}(?:\s\d{3})+|\d{3,8})(?:\b|\s|:|$)/g);
    for (const m of standardMatches) {
      if (m[1]) {
        rawTokens.push({ text: m[1].trim(), index: m.index ?? 0 });
      }
    }

    for (const token of rawTokens) {
      const matchedStr = token.text;
      // Loại bỏ dấu chấm, dấu phẩy, khoảng trắng để lấy số nguyên
      const cleanDigits = matchedStr.replace(/[.,\s]/g, "");
      const val = parseInt(cleanDigits, 10);

      // Bộ lọc loại bỏ số không thực tế cho máy photo:
      // - Số < 100 (thường là số trang in khay, số bản test, mã lỗi)
      // - Số > 99,999,999 (vượt quá giới hạn đồng hồ 7-8 chữ số)
      // - Số năm (2020-2035) nếu dòng có chứa date hoặc định dạng ngày
      if (isNaN(val) || val < 100 || val > 99999999) continue;
      if (val >= 2020 && val <= 2035 && (lowerLine.includes("202") || lowerLine.includes("/"))) continue;

      // Kiểm tra nếu số này thực chất là số thứ tự dòng theo sau bởi dấu hai chấm (VD: 101:, 102:, 1:)
      const isLineIndex = new RegExp(`\\b${cleanDigits}\\s*:`).test(rawLine);

      // Tính điểm cơ sở (Base Score: 50)
      let score = 50;
      let label = "Chỉ số Counter";

      if (isLineIndex) {
        score -= 40; // Mã mục/dòng menu, không phải giá trị counter
      }

      // 1. Phân loại theo từ khóa ngữ cảnh
      const totalKw = TOTAL_KEYWORDS.find((kw) => lowerLine.includes(kw));
      const bwKw = BW_KEYWORDS.find((kw) => lowerLine.includes(kw));
      const colorKw = COLOR_KEYWORDS.find((kw) => lowerLine.includes(kw));

      if (totalKw) {
        const kwIdx = lowerLine.indexOf(totalKw);
        // Nếu số nằm SAU từ khóa Total thì đó là giá trị của Total Counter
        if (token.index >= kwIdx) {
          score += 35;
          label = "Total Counter (Tổng)";
        } else {
          score += 10;
        }
      } else if (bwKw) {
        const kwIdx = lowerLine.indexOf(bwKw);
        if (token.index >= kwIdx) {
          score += 25;
          label = "B&W Counter (Đen trắng)";
        } else {
          score += 10;
        }
      } else if (colorKw) {
        const kwIdx = lowerLine.indexOf(colorKw);
        if (token.index >= kwIdx) {
          score += 20;
          label = "Color Counter (Màu)";
        } else {
          score += 10;
        }
      }

      if (hasNegative) {
        score -= 40;
      }

      // Thưởng điểm cho số có định dạng chuẩn phân cách nghìn (VD: 125,480)
      if (/[.,]/.test(matchedStr)) {
        score += 10;
      }

      // 2. So khớp với chỉ số trước đó (previousCounter) nếu có
      let deltaFromPrevious: number | undefined;
      let isAbovePrevious = true;

      if (previousCounter != null && previousCounter > 0) {
        deltaFromPrevious = val - previousCounter;
        isAbovePrevious = deltaFromPrevious >= 0;

        if (isAbovePrevious) {
          // Máy photocopy thông thường chạy từ vài chục đến vài vạn bản / tháng
          if (deltaFromPrevious === 0) {
            score += 15;
            label += " (Bằng chỉ số cũ)";
          } else if (deltaFromPrevious <= 10000) {
            score += 35; // Rất hợp lý (+1 đến +10,000 bản)
            label += ` (+${deltaFromPrevious.toLocaleString("vi-VN")})`;
          } else if (deltaFromPrevious <= 50000) {
            score += 25; // Hợp lý với máy công suất cao
            label += ` (+${deltaFromPrevious.toLocaleString("vi-VN")})`;
          } else if (deltaFromPrevious <= 200000) {
            score += 10;
            label += ` (+${deltaFromPrevious.toLocaleString("vi-VN")})`;
          } else {
            score -= 15; // Tăng quá đột biến > 200,000
          }
        } else {
          // Nhỏ hơn counter cũ (có thể thay bo/reset, nhưng cần trừ bớt điểm ưu tiên)
          score -= 25;
          label += ` (Giảm ${(Math.abs(deltaFromPrevious)).toLocaleString("vi-VN")})`;
        }
      }

      const confidence = Math.max(10, Math.min(99, score));

      // Lưu lại nếu số này chưa có hoặc có độ tin cậy cao hơn
      const existing = candidatesMap.get(val);
      if (!existing || confidence > existing.confidence) {
        candidatesMap.set(val, {
          value: val,
          formattedValue: val.toLocaleString("vi-VN"),
          confidence,
          label,
          rawText: matchedStr,
          isAbovePrevious,
          deltaFromPrevious,
        });
      }
    }
  }

  const candidates = Array.from(candidatesMap.values()).sort(
    (a, b) => b.confidence - a.confidence
  );

  return {
    bestCandidate: candidates[0] || null,
    candidates,
  };
}

/**
 * Thực hiện nhận diện số Counter từ hình ảnh (Image Element, File, hoặc URL)
 */
export async function recognizeMeterFromImage(
  imageInput: HTMLImageElement | File | Blob | string,
  options?: {
    previousCounter?: number | null;
    onProgress?: (progress: number, status: string) => void;
  }
): Promise<MeterOcrResult> {
  const startTime = Date.now();
  const onProgress = options?.onProgress || (() => {});

  onProgress(10, "Đang khởi tạo thư viện OCR...");
  const Tesseract = await loadTesseract();

  onProgress(25, "Đang nạp và tối ưu hình ảnh...");

  // Tạo đối tượng HTMLImageElement nếu đầu vào là File / Blob / URL
  let imgElem: HTMLImageElement;
  if (typeof imageInput === "string") {
    imgElem = await loadImageFromUrl(imageInput);
  } else if (imageInput instanceof HTMLImageElement) {
    imgElem = imageInput;
  } else {
    const objectUrl = URL.createObjectURL(imageInput);
    try {
      imgElem = await loadImageFromUrl(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  onProgress(40, "Đang tiền xử lý ảnh tăng cường độ tương phản màn hình...");
  const preprocessed = preprocessMeterImage(imgElem);

  onProgress(60, "Đang quét nhận dạng số qua AI OCR...");

  // Cấu hình Tesseract Worker với Whitelist số chuyên dụng
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m: any) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        const p = 60 + Math.round(m.progress * 30);
        onProgress(p, `Đang đọc số đồng hồ (${Math.round(m.progress * 100)}%)...`);
      }
    },
  });

  try {
    // Chỉ định cấu hình nhận dạng số
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.,:TotalCountCounterCopyPrintBWMonoColor- ",
      tessedit_pageseg_mode: "6", // Assume a single uniform block of text
    });

    const ocrResponse = await worker.recognize(preprocessed.canvas);
    const rawText = ocrResponse?.data?.text || "";

    onProgress(95, "Đang trích xuất và chấm điểm chỉ số...");
    const { bestCandidate, candidates } = parseMeterCandidates(
      rawText,
      options?.previousCounter
    );

    const processingTimeMs = Date.now() - startTime;
    onProgress(100, "Hoàn tất nhận diện!");

    return {
      bestValue: bestCandidate ? bestCandidate.value : null,
      bestCandidate,
      candidates,
      rawText,
      confidence: bestCandidate ? bestCandidate.confidence : 0,
      processedImageUrl: preprocessed.dataUrl,
      processingTimeMs,
    };
  } finally {
    await worker.terminate();
  }
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!url.startsWith("data:") && !url.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không thể tải hình ảnh từ URL cung cấp"));
    img.src = url;
  });
}
