// Google Drive export handler - export content to Google Docs
import { refreshTokenInteractive } from './auth-handler';

interface ExportResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

// Convert Markdown to simple HTML for Google Docs
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).replace(/^[^\n]*\n/, ''); // Remove language hint
    return `<pre style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; font-family: monospace;">${code}</pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background-color: #f5f5f5; padding: 2px 4px; border-radius: 2px; font-family: monospace;">$1</code>');

  // Unordered lists
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)\n(?=<li>)/g, '$1');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraphs
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');

  return html;
}

// Create a Google Doc with the given content
export async function exportToGoogleDocs(
  title: string,
  content: string,
  sourceUrl?: string
): Promise<ExportResult> {
  const token = await refreshTokenInteractive();
  if (!token) {
    return { success: false, error: '未登录或授权已过期' };
  }

  try {
    // Convert markdown content to HTML
    const htmlContent = markdownToHtml(content);

    // Add source URL if provided
    let fullHtml = htmlContent;
    if (sourceUrl) {
      fullHtml = `<p><em>来源: <a href="${sourceUrl}">${sourceUrl}</a></em></p><hr>${htmlContent}`;
    }

    // Create the document using Drive API with HTML import
    const metadata = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    };

    const boundary = '-------314159265358979323846';
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/html\r\n\r\n<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${fullHtml}</body></html>\r\n--${boundary}--`;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create Google Doc:', response.status, errorText);
      return { success: false, error: `创建文档失败: ${response.status}` };
    }

    const data = await response.json();

    if (data.webViewLink) {
      return { success: true, fileUrl: data.webViewLink };
    }

    // Fallback: construct URL from file ID
    if (data.id) {
      return { success: true, fileUrl: `https://docs.google.com/document/d/${data.id}/edit` };
    }

    return { success: false, error: '无法获取文档链接' };
  } catch (error) {
    console.error('Export to Google Docs error:', error);
    return { success: false, error: String(error) };
  }
}

// Export multiple items as a single document
export async function exportMultipleToGoogleDocs(
  title: string,
  items: Array<{ title: string; content: string; sourceUrl?: string }>
): Promise<ExportResult> {
  // Combine all items into one document
  const combinedContent = items
    .map((item, index) => {
      let section = `## ${item.title}\n\n${item.content}`;
      if (item.sourceUrl) {
        section = `*来源: ${item.sourceUrl}*\n\n${section}`;
      }
      if (index < items.length - 1) {
        section += '\n\n---\n\n';
      }
      return section;
    })
    .join('');

  return exportToGoogleDocs(title, combinedContent);
}
