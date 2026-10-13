function filenameFromHeader(header: string | null, fallback: string) {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] || fallback;
}

export async function downloadWorkbook(
  path: string,
  params: Record<string, string | undefined>,
  fallbackFilename: string
): Promise<string> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  let res: Response;
  try {
    res = await fetch(query.toString() ? `${path}?${query}` : path, {
      credentials: 'include'
    });
  } catch {
    throw new Error('تعذر التحميل — تحقق من الاتصال بالإنترنت');
  }

  if (!res.ok) {
    let message = 'تعذر تحميل الملف';
    try {
      const data = await res.json();
      message = data.message || data.error || message;
    } catch {
      // Non-JSON error body keeps the default message
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const filename = filenameFromHeader(res.headers.get('Content-Disposition'), fallbackFilename);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return filename;
}
